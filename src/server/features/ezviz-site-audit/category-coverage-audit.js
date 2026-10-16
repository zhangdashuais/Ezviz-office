const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { navigateStable, assertStayedOnSite } = require('./random-site-audit');

function productId(url) {
  try { return new URL(url).pathname.match(/\/product\/[^/]+\/(\d+)\/?$/i)?.[1] || ''; }
  catch { return ''; }
}

function classifyProductHtml(html, url, status) {
  const $ = cheerio.load(html);
  const nav = $('#J_ProductNavItems');
  const support = nav.find('.support a[href]').first().attr('href') || '';
  const issues = [];
  if (status >= 400 || !nav.length) issues.push('产品详情页不可用或缺少产品导航');
  else if (!support) issues.push('产品详情页缺少 Support 入口');
  return { actualUrl: url, status, navItems: nav.children().length, supportUrl: support ? new URL(support, url).href : '', issues };
}

async function auditCategory(page, category, outputDir) {
  const actualUrl = await navigateStable(page, category.url);
  assertStayedOnSite(category.url, actualUrl);
  await page.waitForSelector('.J_SiteProduct', { timeout: 20000 });
  const result = { ...category, actualUrl, sections: [], cards: [], variants: [], issues: [] };
  const sections = await page.locator('#J_CategoryNav a').evaluateAll(els => els.map(e => ({ label: e.textContent.trim(), target: e.name?.replace(/^id-nav-/, 'id-nav-'), href: e.getAttribute('href') })));
  for (let i = 0; i < sections.length; i++) {
    await page.locator('#J_CategoryNav a').nth(i).evaluate(e => e.click());
    await page.waitForTimeout(900);
    const section = await page.evaluate(({ index, tab }) => {
      const a = document.querySelectorAll('#J_CategoryNav a')[index];
      const target = document.getElementById(a?.name) || [...document.querySelectorAll('.cate-items')].find(e => e.getAttribute('name') === tab.label);
      return { ...tab, active: !!a?.parentElement.classList.contains('active'), targetExists: !!target, cards: target?.querySelectorAll('.J_SiteProduct').length || 0 };
    }, { index: i, tab: sections[i] });
    result.sections.push(section);
    if (!section.targetExists) result.issues.push({ type: '分类导航目标不存在', label: section.label });
    if (!section.active) result.issues.push({ type: '分类导航点击后未激活', label: section.label });
  }
  const count = await page.locator('.J_SiteProduct').count();
  for (let index = 0; index < count; index++) {
    const card = page.locator('.J_SiteProduct').nth(index);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    const meta = await card.evaluate(e => {
      let rows = []; try { rows = JSON.parse(e.getAttribute('data-jsond') || '[]'); } catch {}
      return { section: e.closest('.cate-items')?.getAttribute('name') || '', originalId: e.getAttribute('data-gid'), defaultUrl: e.querySelector('.J_SiteProductDetailLink')?.href || '', rows: rows.map(r => ({ ...r, where_to_buy: undefined })), optionCount: e.querySelectorAll('.J_SiteProductSku').length };
    });
    const defaultId = productId(meta.defaultUrl) || meta.originalId;
    const options = meta.optionCount && meta.rows.length ? meta.rows : [meta.rows.find(r => String(r.goods_id) === defaultId) || { goods_id: defaultId, learn_more: meta.defaultUrl }];
    result.cards.push({ index, section: meta.section, originalId: meta.originalId, variantCount: options.length, optionCount: meta.optionCount });
    for (const variant of options) {
      const state = await card.evaluate((element, desired) => {
        const groups = [...element.querySelectorAll('.J_SiteProductSkus ul')].filter(g => g.querySelector('.J_SiteProductSku'));
        const keyFor = attr => attr.name.replace(/^data-/, '').replace(/-/g, '_');
        const matches = button => [...button.attributes].filter(a => a.name.startsWith('data-')).some(a => desired[keyFor(a)] != null && String(desired[keyFor(a)]) === a.value);
        if (groups.length) {
          [...element.querySelectorAll('.J_SiteProductSku.active')].forEach(b => b.click());
          for (const group of groups) {
            const button = [...group.querySelectorAll('.J_SiteProductSku')].find(matches);
            if (button) button.click();
          }
        }
        const links = [...element.querySelectorAll('.J_SiteProductDetailLink')].map(e => ({ url: e.href, id: e.getAttribute('gtm-item_id'), name: e.getAttribute('gtm-item_name') }));
        return { actualId: element.getAttribute('data-gid'), name: element.querySelector('.J_SiteProductTitle')?.textContent.trim() || '', tagline: element.querySelector('.J_SiteProductDesc')?.textContent.trim() || '', image: element.querySelector('.J_SiteProductImg')?.getAttribute('src') || '', selected: [...element.querySelectorAll('.J_SiteProductSku.active')].map(e => e.textContent.trim()), links };
      }, variant);
      const expectedId = String(variant.goods_id);
      const issues = [];
      // data-gid is a cached card attribute; the displayed links carry the selected product ID.
      if (state.links.some(link => productId(link.url) !== expectedId)) issues.push('标签切换后详情链接ID不匹配');
      if (state.links.some(link => { try { return new URL(link.url).pathname.split('/')[1] !== category.site; } catch { return true; } })) issues.push('产品链接跳转到其他国家站');
      if (variant.goods_name && state.name !== variant.goods_name) issues.push('标签切换后产品名不匹配');
      if (!state.image) issues.push('产品卡片缺少图片地址');
      if (!state.tagline) issues.push('产品卡片缺少简介');
      result.variants.push({ cardIndex: index, section: meta.section, expectedId, expectedName: variant.goods_name || state.name, expectedUrl: variant.learn_more || state.links[0]?.url || '', ...state, issues });
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const filename = `${category.site}-${category.kind}.png`;
  await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
  result.screenshot = filename;
  return result;
}

async function runCategoryCoverageAudit({ chromium, sites, outputDir, resume = false, onProgress = () => {} }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reportPath = path.join(outputDir, 'report.json');
  const report = resume && fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : { startedAt: new Date().toISOString(), scope: '全部分类卡片及其可选变体；产品详情和 Support 入口；只读', categories: [], products: [], errors: [] };
  report.finishedAt = null;
  const save = () => fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  try {
    const queue = [...sites];
    await Promise.all(Array.from({ length: 3 }, async () => {
      const page = await context.newPage();
      while (queue.length) {
        const site = queue.shift();
        if (['security-cameras', 'smart-home'].every(kind => report.categories.some(c => c.site === site.siteCode && c.kind === kind))) continue;
        try {
          await navigateStable(page, site.url);
          assertStayedOnSite(site.url, page.url());
          const links = await page.locator('a[href]').evaluateAll(es => [...new Set(es.map(e => e.href).filter(h => h.includes('/category/')))]);
          for (const [kind, marker] of [['security-cameras', 'security-wifi-cameras'], ['smart-home', 'smart-home']]) {
            if (report.categories.some(c => c.site === site.siteCode && c.kind === kind)) continue;
            const url = links.find(h => { try { const u = new URL(h); return u.hostname === 'www.ezviz.com' && u.pathname.split('/')[1] === site.siteCode && (u.pathname.endsWith('/category/' + marker) || kind === 'security-cameras' && u.pathname.endsWith('/category/security-cameras')); } catch { return false; } });
            if (!url) { report.errors.push({ site: site.siteCode, kind, error: '站点导航未发现该分类入口' }); save(); continue; }
            try {
              const item = await auditCategory(page, { site: site.siteCode, siteName: site.name, kind, url }, outputDir);
              report.categories.push(item); save();
              onProgress({ phase: 'category', site: site.siteCode, kind, sections: item.sections.length, cards: item.cards.length, variants: item.variants.length, switchIssues: item.variants.filter(v => v.issues.length).length });
            } catch (error) { report.errors.push({ site: site.siteCode, kind, url, error: error.message }); save(); }
          }
        } catch (error) { report.errors.push({ site: site.siteCode, error: error.message }); save(); }
      }
      await page.close();
    }));
    // Older cached card data can contain variants with no visible selector; only the displayed product is exposed in that case.
    for (const category of report.categories) {
      category.variants = category.variants.filter(v => category.cards[v.cardIndex]?.optionCount > 0 || v.expectedId === productId(v.links[0]?.url));
      for (const card of category.cards) card.variantCount = category.variants.filter(v => v.cardIndex === card.index).length;
    }
    report.errors = report.errors.filter(e => !report.categories.some(c => c.site === e.site && c.kind === e.kind));
    const unique = new Map();
    for (const category of report.categories) for (const variant of category.variants) {
      const url = variant.expectedUrl;
      if (!url) continue;
      const key = category.site + ':' + variant.expectedId;
      if (!unique.has(key)) unique.set(key, { site: category.site, siteName: category.siteName, id: variant.expectedId, name: variant.expectedName, url, appearances: [] });
      unique.get(key).appearances.push({ category: category.kind, section: variant.section, labels: variant.selected });
    }
    report.products = report.products.filter(p => unique.has(p.site + ':' + p.id));
    const completed = new Set(report.products.map(p => p.site + ':' + p.id));
    const products = [...unique.values()].filter(p => !completed.has(p.site + ':' + p.id));
    const supportCache = new Map();
    async function checkSupport(url) {
      if (!supportCache.has(url)) supportCache.set(url, (async () => {
        try {
          const response = await context.request.get(url, { timeout: 30000 });
          const $ = cheerio.load(await response.text());
          const text = $('body').text().replace(/\s+/g, ' ').trim();
          const unavailable = response.status() >= 400 || /we can't seem to find|page not found|404 Not Found/i.test(text);
          const result = { status: response.status(), actualUrl: response.url(), title: $('h1').first().text().trim() || $('title').text().trim(), unavailable };
          await response.dispose();
          return result;
        } catch (error) { return { error: error.message }; }
      })());
      return supportCache.get(url);
    }
    let next = 0;
    const totalProducts = unique.size;
    await Promise.all(Array.from({ length: 12 }, async () => {
      while (next < products.length) {
        const product = products[next++];
        try {
          const response = await context.request.get(product.url, { timeout: 30000 });
          const result = { ...product, ...classifyProductHtml(await response.text(), response.url(), response.status()) };
          await response.dispose();
          if (new URL(result.actualUrl).pathname.split('/')[1] !== product.site) result.issues.push('产品详情发生跨国家跳转');
          if (result.supportUrl) {
            result.support = await checkSupport(result.supportUrl);
            if (result.support.unavailable) result.issues.push('Support 页面不可用');
            if (result.support.error) result.issues.push('Support 请求失败，待复查');
          }
          report.products.push(result);
        } catch (error) { report.products.push({ ...product, issues: ['产品详情请求失败，待复查'], error: error.message }); }
        if (report.products.length % 25 === 0) { save(); onProgress({ phase: 'products', checked: report.products.length, total: totalProducts }); }
      }
    }));
    report.finishedAt = new Date().toISOString(); save();
    return report;
  } finally { await browser.close(); }
}

module.exports = { productId, classifyProductHtml, runCategoryCoverageAudit };
