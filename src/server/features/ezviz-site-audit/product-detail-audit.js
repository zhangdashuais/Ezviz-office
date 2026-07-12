const {
  inferSiteLanguage,
  detectTaglineLanguage,
  languagesAreSimilar
} = require("./product-tagline-language");

const PRODUCT_NAV_SELECTOR = "#J_items";
const PRODUCT_CONTENT_SELECTOR = ".product-main .tab_cont.tab.clearfix";

function normalizeMenuLabel(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function languageIssue(section, text, expectedLanguage) {
  const detection = detectTaglineLanguage(text);
  if (languagesAreSimilar(expectedLanguage, detection.language) || detection.confidence < 0.7) return null;
  return {
    type: "product-content-language-mismatch",
    section,
    expectedLanguage,
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    sample: String(text || "").trim().slice(0, 300)
  };
}

async function readActiveProductContent(page) {
  return page.locator(PRODUCT_CONTENT_SELECTOR).first().evaluate((element) => (element.innerText || "").trim());
}

async function inspectSupportPage(page, expectedLanguage) {
  await page.waitForTimeout(2500);
  const snapshot = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || "").trim();
    const actionable = [...document.querySelectorAll("a, button, li, [role='tab']")]
      .map((element) => (element.innerText || "").trim())
      .filter(Boolean);
    const missingSourceImages = [...document.querySelectorAll("img")]
      .filter((image) => {
        const source = image.getAttribute("src") || image.getAttribute("data-src") || image.getAttribute("data-original");
        return !String(source || "").trim();
      })
      .map((image) => ({ alt: image.alt || "", className: image.className || "" }));
    const brokenImages = [...document.querySelectorAll("img[src]")]
      .filter((image) => image.complete && image.naturalWidth === 0 && !/^data:/i.test(image.src))
      .map((image) => ({ src: image.src, alt: image.alt || "", className: image.className || "" }));
    return {
      url: location.href,
      htmlLang: document.documentElement.lang || "",
      bodyText,
      actionable,
      missingSourceImages,
      brokenImages
    };
  });

  const labels = snapshot.actionable.map(normalizeMenuLabel);
  const hasDatasheet = labels.some((label) => /\bdatasheet\b/.test(label));
  const supportMenuLabels = ["datasheet", "manual", "user manual", "faq", "tutorial video", "download"];
  const pageUnavailable = /we can't seem to find|page not found|\b404\b/i.test(snapshot.bodyText);
  const hasProductSupportNavigation = !pageUnavailable
    && labels.some((label) => supportMenuLabels.some((item) => label.includes(item)));
  const issues = [];

  if (pageUnavailable) {
    issues.push({ type: "support-page-unavailable", url: snapshot.url });
  }
  if (!hasProductSupportNavigation) {
    issues.push({ type: "support-navigation-missing", url: snapshot.url });
  }
  if (!hasDatasheet) {
    issues.push({ type: "support-datasheet-missing", url: snapshot.url });
  }
  if (snapshot.missingSourceImages.length || snapshot.brokenImages.length) {
    issues.push({
      type: "support-image-missing-or-broken",
      url: snapshot.url,
      missingSourceImages: snapshot.missingSourceImages,
      brokenImages: snapshot.brokenImages
    });
  }

  const supportLanguage = languageIssue("support", snapshot.bodyText, expectedLanguage);
  if (supportLanguage && !pageUnavailable) issues.push(supportLanguage);

  return {
    url: snapshot.url,
    htmlLang: snapshot.htmlLang,
    hasProductSupportNavigation,
    hasDatasheet,
    missingImageCount: snapshot.missingSourceImages.length,
    brokenImageCount: snapshot.brokenImages.length,
    pageUnavailable,
    issues
  };
}

async function auditProductDetailPage(page) {
  const pageInfo = await page.evaluate(() => ({
    url: location.href,
    htmlLang: document.documentElement.lang || ""
  }));
  const expectedLanguage = inferSiteLanguage(pageInfo.url, pageInfo.htmlLang);
  const issues = [];
  const nav = page.locator(PRODUCT_NAV_SELECTOR);
  const navExists = await nav.count() > 0;
  const menuItems = navExists
    ? await nav.locator(".item").allTextContents().then((items) => items.map((item) => item.trim()).filter(Boolean))
    : [];
  const normalizedMenus = menuItems.map(normalizeMenuLabel);
  const requiredMenus = ["detail", "specifications", "support"];
  const missingMenus = requiredMenus.filter((required) => !normalizedMenus.some((label) => label === required));

  if (!navExists || missingMenus.length) {
    issues.push({ type: "product-navigation-missing", missingMenus, menuItems });
  }

  let detail = { text: "", language: null };
  let specifications = { text: "", language: null };
  let support = null;

  if (navExists && await page.locator("#t1").count()) {
    await page.locator("#t1").click();
    await page.waitForTimeout(350);
    detail.text = await readActiveProductContent(page);
    detail.language = detectTaglineLanguage(detail.text);
    const issue = languageIssue("detail", detail.text, expectedLanguage);
    if (issue) issues.push(issue);
  }

  if (navExists && await page.locator("#t2").count()) {
    await page.locator("#t2").click();
    await page.waitForTimeout(350);
    specifications.text = await readActiveProductContent(page);
    specifications.language = detectTaglineLanguage(specifications.text);
    const issue = languageIssue("specifications", specifications.text, expectedLanguage);
    if (issue) issues.push(issue);
  }

  const supportLink = navExists ? nav.locator(".support a[href]").first() : null;
  if (!supportLink || !await supportLink.count()) {
    issues.push({ type: "support-link-missing" });
  } else {
    const supportUrl = await supportLink.getAttribute("href");
    const supportPage = await page.context().newPage();
    try {
      await supportPage.goto(supportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      support = await inspectSupportPage(supportPage, expectedLanguage);
      issues.push(...support.issues);
    } finally {
      await supportPage.close();
    }
  }

  return {
    url: pageInfo.url,
    htmlLang: pageInfo.htmlLang,
    expectedLanguage,
    menuItems,
    detail: { language: detail.language, sample: detail.text.slice(0, 500) },
    specifications: { language: specifications.language, sample: specifications.text.slice(0, 500) },
    support,
    issueCount: issues.length,
    issues
  };
}

module.exports = {
  PRODUCT_NAV_SELECTOR,
  PRODUCT_CONTENT_SELECTOR,
  languageIssue,
  inspectSupportPage,
  auditProductDetailPage
};
