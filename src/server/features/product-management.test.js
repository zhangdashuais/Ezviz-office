const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INT_GOODS_CATEGORY_PRIORITY,
  orderedIntGoodsCategories
} = require("./product-management");

test("product copy categories prefer WiFi Cameras then For Home", () => {
  const result = orderedIntGoodsCategories([
    { value: "0", text: "\u25c6\u25c6\u25c6ToC Category\u25c6\u25c6\u25c6" },
    { value: "8", text: "For Home" },
    { value: "2", text: "Wired Cameras" },
    { value: "1", text: "WiFi Cameras" },
    { value: "9", text: "\u25c6\u25c6\u25c6ToB Category\u25c6\u25c6\u25c6" },
    { value: "10", text: "Smart Home Camera" }
  ]);
  assert.deepEqual(INT_GOODS_CATEGORY_PRIORITY, ["WiFi Cameras", "For Home"]);
  assert.deepEqual(result.map((item) => item.text), [
    "WiFi Cameras",
    "For Home",
    "Wired Cameras",
    "Smart Home Camera"
  ]);
});

test("product copy categories omit placeholder and category headings", () => {
  const result = orderedIntGoodsCategories([
    { value: "0", text: "\u25c6\u25c6\u25c6ToC Category\u25c6\u25c6\u25c6" },
    { value: "22", text: "Others" }
  ]);
  assert.deepEqual(result, [{ value: "22", text: "Others" }]);
});
