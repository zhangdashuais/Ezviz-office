const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_EMPTY_DETAIL,
  parseProductNames,
  buildEmptyProductPayload,
  publicProductUrl
} = require("./product-empty-link");

test("empty-link names are trimmed and de-duplicated", () => {
  assert.deepEqual(parseProductNames("A\nB，a; C"), ["A", "B", "C"]);
});

test("empty-link payload keeps product configuration and clears identity/detail content", () => {
  const source = {
    name: "Reference",
    bn: "Reference",
    is_search: 1,
    cat_id: 7,
    type_id: 24,
    images: [{ id: 1 }],
    spec: [{ product_id: 99, product_bn: "Reference" }],
    summary_intro: "old",
    function_intro: "old function",
    mobile_summary_intro: "old mobile",
    extra: [{ value: "old" }],
    seo: { web_name: "Reference" },
    goods_extra_info: {}
  };
  const result = buildEmptyProductPayload(source, "New Product");
  assert.equal(result.cat_id, 7);
  assert.deepEqual(result.images, [{ id: 1 }]);
  assert.equal(result.name, "New Product");
  assert.equal(result.bn, "New Product");
  assert.equal(result.is_search, 0);
  assert.equal(result.spec[0].product_id, 0);
  assert.equal(result.spec[0].product_bn, "New Product");
  assert.equal(result.summary_intro, DEFAULT_EMPTY_DETAIL);
  assert.equal(result.mobile_summary_intro, DEFAULT_EMPTY_DETAIL);
  assert.equal(result.function_intro, "");
  assert.deepEqual(result.extra, []);
  assert.equal(result.seo.web_name, "New Product");
  assert.equal(
    publicProductUrl("https://www.ezvizlife.com/inter/en/product/new-product/123"),
    "https://www.ezviz.com/inter/product/new-product/123"
  );
});
