const PRODUCT_TAGLINE_SELECTOR = ".site-product-desc.J_SiteProductDesc";
const REGION_SELECTOR = ".yf.yf-shop-region";

const SITE_LANGUAGE_BY_SLUG = {
  inter: "en",
  us: "en",
  uk: "en",
  au: "en",
  ca: "en",
  la: "es",
  arg: "es",
  br: "pt",
  de: "de",
  es: "es",
  fr: "fr",
  it: "it",
  nl: "nl",
  pl: "pl",
  pt: "pt",
  tr: "tr",
  ru: "ru",
  ua: "uk",
  vn: "vi",
  th: "th",
  id: "id",
  kr: "ko",
  jp: "ja",
  cn: "zh",
  my: "ms",
  cis: "ru",
  cz: "cs",
  be: "nl",
  eu: "en",
  ro: "ro",
  ar: "ar",
  af: "en",
  sa: "ar"
};

const LATIN_HINTS = {
  en: ["the", "and", "with", "your", "home", "smart", "more", "for", "easy", "to", "of", "in"],
  de: ["der", "die", "das", "und", "mit", "für", "ihr", "haus", "mehr", "ein"],
  es: ["el", "la", "los", "las", "y", "con", "para", "tu", "hogar", "más", "una"],
  fr: ["le", "la", "les", "et", "avec", "pour", "votre", "maison", "plus", "une"],
  it: ["il", "la", "gli", "le", "e", "con", "per", "casa", "più", "una"],
  nl: ["de", "het", "en", "met", "voor", "uw", "huis", "meer", "een"],
  pl: ["i", "z", "dla", "twój", "dom", "więcej", "bez", "na"],
  pt: ["o", "a", "os", "as", "e", "com", "para", "sua", "casa", "mais", "uma"],
  tr: ["ve", "ile", "için", "ev", "daha", "akıllı", "bir"],
  vi: ["và", "với", "cho", "nhà", "thông minh", "hơn", "của"],
  id: ["dan", "dengan", "untuk", "rumah", "pintar", "lebih", "anda", "keamanan", "kamera", "yang"],
  ms: ["dan", "dengan", "untuk", "rumah", "pintar", "lebih", "anda", "keselamatan", "kamera", "yang"],
  ro: ["și", "cu", "pentru", "casa", "inteligent", "mai", "securitate", "cameră", "fără"],
  cs: ["pro", "váš", "domov", "chytrý", "více", "bezpečnost", "kamera", "bez", "snadno"]
};

function normalizeLanguage(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
}

function inferSiteLanguage(url, htmlLang) {
  const declared = normalizeLanguage(htmlLang);
  if (declared) return declared;

  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return SITE_LANGUAGE_BY_SLUG[slug] || "en";
  } catch {
    return "en";
  }
}

function tokenizeLatin(text) {
  return String(text || "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function detectTaglineLanguage(text) {
  const value = String(text || "").trim();
  if (!value) return { language: "unknown", confidence: 0, reason: "empty" };

  const scriptRules = [
    ["zh", /\p{Script=Han}/gu],
    ["ja", /\p{Script=Hiragana}|\p{Script=Katakana}/gu],
    ["ko", /\p{Script=Hangul}/gu],
    ["ru", /\p{Script=Cyrillic}/gu],
    ["ar", /\p{Script=Arabic}/gu],
    ["th", /\p{Script=Thai}/gu]
  ];

  for (const [language, pattern] of scriptRules) {
    const count = (value.match(pattern) || []).length;
    if (count >= 2) return { language, confidence: 0.99, reason: `${language}-script` };
  }

  const tokens = tokenizeLatin(value);
  if (!tokens.length) return { language: "unknown", confidence: 0, reason: "no-words" };

  const scores = Object.entries(LATIN_HINTS).map(([language, hints]) => {
    const score = hints.reduce((total, hint) => {
      const hintTokens = hint.split(" ");
      if (hintTokens.length === 1) return total + (tokens.includes(hint) ? 1 : 0);
      return total + (value.toLocaleLowerCase().includes(hint) ? 2 : 0);
    }, 0);
    return { language, score };
  }).sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];
  if (!best || best.score < 2 || best.score === second?.score) {
    return { language: "unknown", confidence: 0, reason: "insufficient-language-signals" };
  }

  return {
    language: best.language,
    confidence: Math.min(0.95, 0.55 + best.score / Math.max(tokens.length, 4)),
    reason: "language-word-signals"
  };
}

function languagesAreSimilar(expected, detected) {
  if (!detected || detected === "unknown") return true;
  if (expected === detected) return true;
  if (expected === "uk" && detected === "ru") return false;
  return false;
}

async function extractProductTaglines(page) {
  return page.locator(PRODUCT_TAGLINE_SELECTOR).evaluateAll((elements) => elements.map((element, index) => {
    const product = element.closest(".site-product-item.J_SiteProduct");
    const link = product?.querySelector("a[href]");
    const name = product?.querySelector(".site-product-name, .J_SiteProductName, [class*='product-name']");
    return {
      index,
      text: (element.textContent || "").trim(),
      productName: (name?.textContent || "").trim(),
      productUrl: link?.href || ""
    };
  }).filter((item) => item.text));
}

async function auditProductTaglines(page) {
  const pageInfo = await page.evaluate(() => ({
    url: location.href,
    htmlLang: document.documentElement.lang || ""
  }));
  const expectedLanguage = inferSiteLanguage(pageInfo.url, pageInfo.htmlLang);
  const taglines = await extractProductTaglines(page);
  const checked = taglines.map((item) => {
    const detection = detectTaglineLanguage(item.text);
    return {
      ...item,
      expectedLanguage,
      detectedLanguage: detection.language,
      confidence: detection.confidence,
      reason: detection.reason,
      matchesSiteLanguage: languagesAreSimilar(expectedLanguage, detection.language)
    };
  });
  const issues = checked.filter((item) => !item.matchesSiteLanguage && item.confidence >= 0.7);

  return {
    url: pageInfo.url,
    htmlLang: pageInfo.htmlLang,
    expectedLanguage,
    selector: PRODUCT_TAGLINE_SELECTOR,
    total: checked.length,
    issueCount: issues.length,
    issues,
    taglines: checked
  };
}

module.exports = {
  PRODUCT_TAGLINE_SELECTOR,
  REGION_SELECTOR,
  SITE_LANGUAGE_BY_SLUG,
  inferSiteLanguage,
  detectTaglineLanguage,
  languagesAreSimilar,
  extractProductTaglines,
  auditProductTaglines
};
