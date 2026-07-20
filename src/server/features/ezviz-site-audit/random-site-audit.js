const {
  inferSiteLanguage,
  detectTaglineLanguage,
  languagesAreSimilar
} = require("./product-tagline-language");

const REGION_PAGE_URL = "https://www.ezviz.com/choose-country-region";
const CATEGORY_NAMES = ["Security Cameras", "Smart Home"];
const PRODUCT_NAV_SELECTOR = "#J_ProductNavItems";
const PRODUCT_DETAIL_SELECTOR = "#J_productContent";
const PRODUCT_SPECIFICATION_SELECTOR = "#cont2";

async function navigateStable(page, url, options = {}) {
  const timeout = options.timeout || 60000;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "commit", timeout });
      await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeout, 30000) }).catch(() => {});
      await page.waitForTimeout(1200);
      return page.url();
    } catch (error) {
      lastError = error;
      if (!/interrupted by another navigation|navigation.*interrupted/i.test(error.message || "")) break;
      await page.waitForTimeout(1800);
      if (page.url() && page.url() !== "about:blank") return page.url();
    }
  }
  throw lastError || new Error("页面导航失败：" + url);
}

function siteSlug(value) {
  try { return new URL(value).pathname.split("/").filter(Boolean)[0]?.toLowerCase() || ""; } catch { return ""; }
}

function assertStayedOnSite(expectedUrl, actualUrl) {
  const expected = siteSlug(expectedUrl);
  const actual = siteSlug(actualUrl);
  if (expected && actual && expected !== actual) {
    throw new Error(`站点发生区域跳转：期望 /${expected}，实际进入 /${actual}`);
  }
}

function focusedContentIssues(text, expectedLanguage) {
  const value = String(text || "").trim();
  if (!value) return [{ type: "product-detail-content-missing" }];
  const detection = detectTaglineLanguage(value);
  if (!languagesAreSimilar(expectedLanguage, detection.language) && detection.confidence >= 0.7) {
    return [{
      type: "product-detail-language-mismatch",
      expectedLanguage,
      detectedLanguage: detection.language,
      confidence: detection.confidence,
      sample: value.slice(0, 300)
    }];
  }
  return [];
}

async function readProductSection(page, selector) {
  const section = page.locator(selector).first();
  if (!await section.count()) return { exists: false, html: "", text: "" };
  return section.evaluate((element) => ({
    exists: true,
    html: (element.innerHTML || "").trim(),
    text: (element.innerText || element.textContent || "").trim()
  })).catch(() => ({ exists: false, html: "", text: "" }));
}

function sectionContentIssues(section, content, expectedLanguage) {
  const missingType = section === "specifications"
    ? "product-specification-content-missing"
    : "product-detail-content-missing";
  if (!content?.exists || !String(content.html || "").trim()) return [{ type: missingType }];

  const value = String(content.text || "").trim();
  const detection = detectTaglineLanguage(value);
  if (value && !languagesAreSimilar(expectedLanguage, detection.language) && detection.confidence >= 0.7) {
    return [{
      type: section === "specifications"
        ? "product-specification-language-mismatch"
        : "product-detail-language-mismatch",
      expectedLanguage,
      detectedLanguage: detection.language,
      confidence: detection.confidence,
      sample: value.slice(0, 300)
    }];
  }
  return [];
}

async function auditFocusedProductPage(page, expectedLanguage) {
  const nav = page.locator(PRODUCT_NAV_SELECTOR).first();
  const navItemCount = await nav.count() ? await nav.locator(":scope > *").count() : 0;
  const issues = [];
  let detail = { exists: false, html: "", text: "" };
  let specifications = { exists: false, html: "", text: "" };

  if (navItemCount !== 3) {
    issues.push({ type: "product-navigation-count-mismatch", expectedCount: 3, actualCount: navItemCount });
  } else {
    detail = await readProductSection(page, PRODUCT_DETAIL_SELECTOR);
    specifications = await readProductSection(page, PRODUCT_SPECIFICATION_SELECTOR);
    issues.push(...sectionContentIssues("detail", detail, expectedLanguage));
    issues.push(...sectionContentIssues("specifications", specifications, expectedLanguage));
  }

  const detailDetection = detectTaglineLanguage(detail.text);
  const specificationDetection = detectTaglineLanguage(specifications.text);
  return {
    url: page.url(),
    navItemCount,
    contentExists: detail.exists && !!detail.html,
    specificationContentExists: specifications.exists && !!specifications.html,
    expectedLanguage,
    detectedLanguage: detailDetection.language,
    confidence: detailDetection.confidence,
    sample: detail.text.slice(0, 500),
    specifications: {
      detectedLanguage: specificationDetection.language,
      confidence: specificationDetection.confidence,
      sample: specifications.text.slice(0, 500)
    },
    issueCount: issues.length,
    issues
  };
}

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
  await navigateStable(page, REGION_PAGE_URL);
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
  const actualUrl = await navigateStable(page, siteUrl);
  assertStayedOnSite(siteUrl, actualUrl);
  await page.waitForSelector(".c-flex.nav-menu__items", { timeout: 30000 });
  return page.locator(".c-flex.nav-menu__items").first().evaluate((nav, names) => names.map((name) => {
    const link = [...nav.querySelectorAll("a[href]")].find((anchor) => (anchor.innerText || "").trim() === name);
    return link ? { name, url: link.href } : { name, url: "" };
  }), CATEGORY_NAMES);
}

async function collectCategoryProducts(page, category) {
  const actualUrl = await navigateStable(page, category.url);
  assertStayedOnSite(category.url, actualUrl);
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
  const report = { startedAt, finishedAt: null, sampleSize, sites: [], issueCount: 0, issues: [] };

  try {
    const discoveryContext = await browser.newContext();
    const discoveryPage = await discoveryContext.newPage();
    const sites = await discoverSites(discoveryPage);
    await discoveryContext.close();
    onProgress({ type: "sites-discovered", totalSites: sites.length });

    for (let siteIndex = 0; siteIndex < sites.length; siteIndex += 1) {
      const site = sites[siteIndex];
      const siteResult = { ...site, categories: [], sampledProducts: [], issues: [], error: null };
      report.sites.push(siteResult);
      onProgress({ type: "site-started", siteIndex, totalSites: sites.length, site });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        const categories = await discoverCategoryUrls(page, site.url);

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

          if (!String(product.tagline || "").trim()) {
            productResult.issues.push({ type: "product-tagline-missing" });
          }

          if (String(product.tagline || "").trim() && !languagesAreSimilar(expectedLanguage, taglineLanguage.language) && taglineLanguage.confidence >= 0.7) {
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
            const actualUrl = await navigateStable(productPage, product.detailUrl);
            assertStayedOnSite(product.detailUrl, actualUrl);
            productResult.detailAudit = await auditFocusedProductPage(productPage, expectedLanguage);
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
      } finally {
        await context.close().catch(() => {});
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
  navigateStable,
  assertStayedOnSite,
  focusedContentIssues,
  sectionContentIssues,
  auditFocusedProductPage,
  runRandomSiteAudit
};
