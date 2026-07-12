const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inferSiteLanguage,
  detectTaglineLanguage,
  languagesAreSimilar
} = require("./product-tagline-language");

test("prefers the page-declared language", () => {
  assert.equal(inferSiteLanguage("https://www.ezviz.com/de/category/smart-home", "de-DE"), "de");
});

test("falls back to the country slug", () => {
  assert.equal(inferSiteLanguage("https://www.ezviz.com/fr/category/smart-home", ""), "fr");
  assert.equal(inferSiteLanguage("https://www.ezviz.com/inter/category/smart-home", ""), "en");
});

test("detects strong script mismatches", () => {
  assert.equal(detectTaglineLanguage("让智能生活更简单").language, "zh");
  assert.equal(languagesAreSimilar("en", "zh"), false);
});

test("does not flag an uncertain short product tagline", () => {
  assert.equal(detectTaglineLanguage("Smart Siren").language, "unknown");
  assert.equal(languagesAreSimilar("en", "unknown"), true);
});

test("detects a typical English tagline", () => {
  assert.equal(detectTaglineLanguage("A smarter choice for your home").language, "en");
});
