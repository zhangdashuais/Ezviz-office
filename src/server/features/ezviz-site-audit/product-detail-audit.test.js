const test = require("node:test");
const assert = require("node:assert/strict");
const { languageIssue } = require("./product-detail-audit");
const { assertAllowedEzvizUrl } = require("./index");

test("accepts EZVIZ category and mobile product URLs", () => {
  assert.match(assertAllowedEzvizUrl("https://www.ezviz.com/category/smart-home"), /^https:\/\/www\.ezviz\.com/);
  assert.match(assertAllowedEzvizUrl("https://m.ezviz.com/product/hp8/287416"), /^https:\/\/m\.ezviz\.com/);
});

test("rejects non-EZVIZ audit targets", () => {
  assert.throws(() => assertAllowedEzvizUrl("https://example.com/product/1"));
});

test("reports a clear language mismatch", () => {
  const issue = languageIssue("detail", "让智能生活更简单，让您的家庭更加安全", "en");
  assert.equal(issue.type, "product-content-language-mismatch");
  assert.equal(issue.section, "detail");
});

test("accepts matching English detail content", () => {
  const issue = languageIssue("specifications", "Smart protection for your home with easy installation", "en");
  assert.equal(issue, null);
});
