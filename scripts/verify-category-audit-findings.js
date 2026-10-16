const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { navigateStable } = require('../src/server/features/ezviz-site-audit/random-site-audit');

async function main() {
  const outputDir = path.resolve('outputs/europe-category-support-audit-2026-10-15');
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json')));
  const result = { startedAt: new Date().toISOString(), navigation: [], switches: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const queue = report.categories.filter(c => c.issues.length);
  try {
    await Promise.all(Array.from({ length: 3 }, async () => {
      const page = await context.newPage();
      while (queue.length) {
        const c = queue.shift();
        try {
          await navigateStable(page, c.url);
          for (const warning of c.issues) {
            const anchor = page.locator('#J_CategoryNav a').filter({ hasText: warning.label }).first();
            await anchor.scrollIntoViewIfNeeded();
            await anchor.evaluate(e => e.click());
            await page.waitForTimeout(1200);
            const check = await anchor.evaluate(a => {
              const target = document.getElementById(a.name);
              return { label: a.textContent.trim(), active: a.parentElement.classList.contains('active'), activeLabel: document.querySelector('#J_CategoryNav li.active')?.textContent.trim(), targetTop: target?.getBoundingClientRect().top, scrollY: window.scrollY, hash: location.hash };
            });
            check.site = c.site; check.category = c.kind; check.url = c.url;
            if (!check.active) {
              check.screenshot = `${c.site}-${c.kind}-nav-${result.navigation.length}.png`;
              await page.screenshot({ path: path.join(outputDir, check.screenshot) });
            }
            result.navigation.push(check);
          }
        } catch (e) { result.navigation.push({ site: c.site, category: c.kind, error: e.message }); }
      }
      await page.close();
    }));
    const candidates = report.categories.flatMap(c => c.variants.filter(v => c.cards[v.cardIndex]?.optionCount > 0 && v.issues.length).map(v => ({ ...v, site: c.site, category: c.kind, categoryUrl: c.url })));
    const page = await context.newPage();
    for (const candidate of candidates) {
      await navigateStable(page, candidate.categoryUrl);
      const index = await page.locator('.J_SiteProduct').evaluateAll((cards, id) => cards.findIndex(c => { try { return JSON.parse(c.getAttribute('data-jsond') || '[]').some(r => String(r.goods_id) === id); } catch { return false; } }), candidate.expectedId);
      const card = page.locator('.J_SiteProduct').nth(index);
      await card.scrollIntoViewIfNeeded();
      const before = await card.evaluate(c => ({ name: c.querySelector('.J_SiteProductTitle')?.textContent.trim(), buttons: [...c.querySelectorAll('.J_SiteProductSku')].map(b => ({ label: b.textContent.trim(), active: b.classList.contains('active'), disabled: b.classList.contains('disabled') })) }));
      const label = candidate.selected.find(Boolean);
      await card.locator('.J_SiteProductSku').filter({ hasText: label }).first().evaluate(e => e.click());
      await page.waitForTimeout(500);
      const after = await card.evaluate(c => ({ name: c.querySelector('.J_SiteProductTitle')?.textContent.trim(), url: c.querySelector('.J_SiteProductDetailLink')?.href, selected: [...c.querySelectorAll('.J_SiteProductSku.active')].map(e => e.textContent.trim()) }));
      const screenshot = `${candidate.site}-variant-${candidate.expectedId}.png`;
      await card.screenshot({ path: path.join(outputDir, screenshot) });
      result.switches.push({ site: candidate.site, categoryUrl: candidate.categoryUrl, expectedId: candidate.expectedId, expectedName: candidate.expectedName, requestedLabel: label, before, after, screenshot, reproduced: !after.url?.endsWith('/' + candidate.expectedId) });
    }
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ navigationChecks: result.navigation.length, navigationFailures: result.navigation.filter(n => n.active === false).length, switches: result.switches.length, reproduced: result.switches.filter(s => s.reproduced).length }));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
