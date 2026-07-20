const test = require("node:test");
const assert = require("node:assert/strict");
const { sampleProducts, assertStayedOnSite, focusedContentIssues, sectionContentIssues } = require("./random-site-audit");

test("samples unique products and respects the requested size", () => {
  const products = [
    { detailUrl: "https://m.ezviz.com/product/a/1" },
    { detailUrl: "https://m.ezviz.com/product/a/1" },
    { detailUrl: "https://m.ezviz.com/product/b/2" },
    { detailUrl: "https://m.ezviz.com/product/c/3" }
  ];
  const sampled = sampleProducts(products, 2, () => 0.5);
  assert.equal(sampled.length, 2);
  assert.equal(new Set(sampled.map((item) => item.detailUrl)).size, 2);
});

test("reports a regional redirect instead of auditing the wrong site", () => {
  assert.throws(
    () => assertStayedOnSite("https://www.ezviz.com/ro", "https://www.ezviz.com/tr"),
    /期望 \/ro，实际进入 \/tr/
  );
});

test("focused detail audit only reports missing content or language mismatch", () => {
  assert.deepEqual(focusedContentIssues("", "en"), [{ type: "product-detail-content-missing" }]);
  const mismatch = focusedContentIssues("Akıllı eviniz için daha fazla güvenlik ve kolay kontrol", "en");
  assert.equal(mismatch[0]?.type, "product-detail-language-mismatch");
  assert.equal(focusedContentIssues("Smart security for your home with more control", "en").length, 0);
});

test("checks detail and specification containers by HTML content", () => {
  assert.deepEqual(
    sectionContentIssues("detail", { exists: true, html: "", text: "" }, "en"),
    [{ type: "product-detail-content-missing" }]
  );
  assert.deepEqual(
    sectionContentIssues("specifications", { exists: false, html: "", text: "" }, "en"),
    [{ type: "product-specification-content-missing" }]
  );
  assert.equal(
    sectionContentIssues("detail", { exists: true, html: '<img src="product.jpg">', text: "" }, "en").length,
    0
  );
});
