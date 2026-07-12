const {
  inferSiteLanguage,
  detectTaglineLanguage,
  languagesAreSimilar
} = require("./product-tagline-language");
const { auditProductDetailPage } = require("./product-detail-audit");

const REGION_PAGE_URL = "https://www.ezviz.com/choose-country-region";
const CATEGORY_NAMES = ["Security Cameras", "Smart Home"];

function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function sampleProducts(products, count, random = Math.random) {
  const unique = new Map();
  products.forEach((product) => {
    if (product.detailUrl && !unique.has(product.detailUrl)) unique.set(product.detailUrl, product);
  });
  return shuffle([...unique.values()], random).slice(0, Math.max(1, Number(count) || 5));
}

async function discoverSites(page) {
  await page.goto(REGION_PAGE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  return page.evaluate(() => {
    const unique = new Map();
    [...document.querySelectorAll("a[href]")].forEach((anchor) => {
      const name = (anchor.innerText || "").trim();
      if (!name || /Global-English/i.test(name)) return;
      try {
        const url = new URL(anchor.href);
        const segments = url.pathname.split("/").filter(Boolean);
        if (url.hostname !== "www.ezviz.com" || segments.length !== 1 || segments[0] === "choose-country-region") return;
        if (!unique.has(url.href)) unique.set(url.href, { name, url: url.href.replace(/\/$/, "") });
      } catch {}
    });
    return [...unique.values()];
  });
}

async function discoverCategoryUrls(page, siteUrl) {
  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".c-flex.nav-menu__items", { timeout: 30000 });
  return page.locator(".c-flex.nav-menu__items").first().evaluate((nav, names) => names.map((name) => {
    const link = [...nav.querySelectorAll("a[href]")].find((anchor) => (anchor.innerText || "").trim() === name);
    return link ? { name, url: link.href } : { name, url: "" };
  }), CATEGORY_NAMES);
}

async function collectCategoryProducts(page, category) {
  await page.goto(category.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".site-product-item.J_SiteProduct", { timeout: 30000 });
  const pageInfo = await page.evaluate(() => ({ url: location.href, htmlLang: document.documentElement.lang || "" }));
  const products = await page.locator(".site-product-item.J_SiteProduct").evaluateAll((cards, categoryName) => cards.map((card) => {
    const detailLink = card.querySelector(".site-product-btns-link.J_SiteProductDetailLink");
    const tagline = card.querySelector(".site-product-desc.J_SiteProductDesc");
    return {
      category: categoryName,
      productName: (detailLink?.getAttribute("aria-label") || "").trim(),
      detailUrl: detailLink?.href || "",
      tagline: (tagline?.textContent || "").trim()
    };
  }).filter((product) => product.detailUrl), category.name);
  return { ...pageInfo, products };
}

async function runRandomSiteAudit({ chromium, sampleSize = 5, onProgress = () => {} }) {
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const report = { startedAt, finishedAt: null, sampleSize, sites: [], issueCount: 0, issues: [] };

  try {
    const sites = await discoverSites(page);
    onProgress({ type: "sites-discovered", totalSites: sites.length });

    for (let siteIndex = 0; siteIndex < sites.length; siteIndex += 1) {
      const site = sites[siteIndex];
      const siteResult = { ...site, categories: [], sampledProducts: [], issues: [], error: null };
      report.sites.push(siteResult);
      onProgress({ type: "site-started", siteIndex, totalSites: sites.length, site });

      try {
        const categories = await discoverCategoryUrls(page, site.url);
        const missingCategories = categories.filter((category) => !category.url);
        missingCategories.forEach((category) => siteResult.issues.push({
          type: "category-navigation-missing",
          site: site.name,
          category: category.name
        }));

        const allProducts = [];
        for (const category of categories.filter((item) => item.url)) {
          try {
            const categoryResult = await collectCategoryProducts(page, category);
            siteResult.categories.push({ name: category.name, url: categoryResult.url, productCount: categoryResult.products.length });
            allProducts.push(...categoryResult.products.map((product) => ({
              ...product,
              categoryUrl: categoryResult.url,
              siteHtmlLang: categoryResult.htmlLang
            })));
          } catch (error) {
            siteResult.issues.push({ type: "category-load-failed", site: site.name, category: category.name, error: error.message });
          }
        }

        const selected = sampleProducts(allProducts, sampleSize);
        for (let productIndex = 0; productIndex < selected.length; productIndex += 1) {
          const product = selected[productIndex];
          const expectedLanguage = inferSiteLanguage(product.categoryUrl, product.siteHtmlLang);
          const taglineLanguage = detectTaglineLanguage(product.tagline);
          const productResult = {
            ...product,
            expectedLanguage,
            taglineLanguage,
            detailAudit: null,
            issues: []
          };
          siteResult.sampledProducts.push(productResult);
          onProgress({
            type: "product-started",
            siteIndex,
            totalSites: sites.length,
            productIndex,
            sampleSize: selected.length,
            site: site.name,
            product: product.productName
          });

          if (!languagesAreSimilar(expectedLanguage, taglineLanguage.language) && taglineLanguage.confidence >= 0.7) {
            productResult.issues.push({
              type: "product-tagline-language-mismatch",
              expectedLanguage,
              detectedLanguage: taglineLanguage.language,
              confidence: taglineLanguage.confidence,
              tagline: product.tagline
            });
          }

          const productPage = await context.newPage();
          try {
            await productPage.goto(product.detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            await productPage.waitForSelector("#J_items", { timeout: 30000 });
            productResult.detailAudit = await auditProductDetailPage(productPage);
            productResult.issues.push(...productResult.detailAudit.issues);
          } catch (error) {
            productResult.issues.push({ type: "product-detail-load-failed", error: error.message, url: product.detailUrl });
          } finally {
            await productPage.close();
          }

          productResult.issues.forEach((issue) => siteResult.issues.push({
            ...issue,
            site: site.name,
            product: product.productName,
            detailUrl: product.detailUrl
          }));
          onProgress({ type: "product-finished", site: site.name, product: product.productName, issueCount: productResult.issues.length });
        }
      } catch (error) {
        siteResult.error = error.message;
        siteResult.issues.push({ type: "site-audit-failed", site: site.name, error: error.message });
      }

      report.issues.push(...siteResult.issues);
      onProgress({ type: "site-finished", site: site.name, issueCount: siteResult.issues.length });
    }

    report.issueCount = report.issues.length;
    report.finishedAt = new Date().toISOString();
    return report;
  } finally {
    await browser.close();
  }
}

module.exports = {
  REGION_PAGE_URL,
  CATEGORY_NAMES,
  shuffle,
  sampleProducts,
  discoverSites,
  discoverCategoryUrls,
  collectCategoryProducts,
  runRandomSiteAudit
};
