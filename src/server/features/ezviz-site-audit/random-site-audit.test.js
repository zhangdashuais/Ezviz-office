const test = require("node:test");
const assert = require("node:assert/strict");
const { sampleProducts } = require("./random-site-audit");

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
