const {
  inferSiteLanguage,
  detectTaglineLanguage,
  languagesAreSimilar
} = require("./product-tagline-language");

const PRODUCT_NAV_SELECTOR = "#J_ProductNavItems";
const PRODUCT_DETAIL_SELECTOR = "#J_productContent";
const PRODUCT_SPECIFICATION_SELECTOR = "#cont2";

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

async function readProductContent(page, selector) {
  const section = page.locator(selector).first();
  if (!await section.count()) return { exists: false, html: "", text: "" };
  return section.evaluate((element) => ({
    exists: true,
    html: (element.innerHTML || "").trim(),
    text: (element.innerText || element.textContent || "").trim()
  })).catch(() => ({ exists: false, html: "", text: "" }));
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
  const nav = page.locator(PRODUCT_NAV_SELECTOR).first();
  const navExists = await nav.count() > 0;
  const navItemCount = navExists ? await nav.locator(":scope > *").count() : 0;
  const menuItems = navExists
    ? await nav.locator(":scope > *").allTextContents().then((items) => items.map((item) => item.trim()).filter(Boolean))
    : [];

  if (navItemCount !== 3) {
    issues.push({ type: "product-navigation-count-mismatch", expectedCount: 3, actualCount: navItemCount, menuItems });
  }

  let detail = { text: "", language: null };
  let specifications = { text: "", language: null };
  let support = null;

  if (navItemCount === 3) {
    const detailContent = await readProductContent(page, PRODUCT_DETAIL_SELECTOR);
    detail.text = detailContent.text;
    detail.language = detectTaglineLanguage(detail.text);
    if (!detailContent.exists || !detailContent.html) {
      issues.push({ type: "product-detail-content-missing" });
    } else {
      const issue = languageIssue("detail", detail.text, expectedLanguage);
      if (issue) issues.push(issue);
    }

    const specificationContent = await readProductContent(page, PRODUCT_SPECIFICATION_SELECTOR);
    specifications.text = specificationContent.text;
    specifications.language = detectTaglineLanguage(specifications.text);
    if (!specificationContent.exists || !specificationContent.html) {
      issues.push({ type: "product-specification-content-missing" });
    } else {
      const issue = languageIssue("specifications", specifications.text, expectedLanguage);
      if (issue) issues.push(issue);
    }
  }

  if (navItemCount === 3) {
    const supportLink = nav.locator(".support a[href]").first();
    if (!await supportLink.count()) {
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
  }

  return {
    url: pageInfo.url,
    htmlLang: pageInfo.htmlLang,
    expectedLanguage,
    navItemCount,
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
  PRODUCT_DETAIL_SELECTOR,
  PRODUCT_SPECIFICATION_SELECTOR,
  languageIssue,
  inspectSupportPage,
  auditProductDetailPage
};
