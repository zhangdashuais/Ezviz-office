const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INT_GOODS_CATEGORY_PRIORITY,
  INT_GOODS_SOURCE_SITE_VALUE,
  LEGACY_GOODS_INDEX_URL,
  createProductManagement,
  isLegacyShopPath,
  isLegacyShopUrl,
  orderedIntGoodsCategories
} = require("./product-management");

test("product publishing always reads from the international source selector", () => {
  assert.equal(INT_GOODS_SOURCE_SITE_VALUE, "0");
});

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

test("product editor navigation treats new regional shop hosts as non-legacy", () => {
  assert.equal(isLegacyShopUrl("https://shop.ezvizlife.com/goods/index"), true);
  assert.equal(isLegacyShopUrl("https://new-vn-shop.ezvizlife.com/goods/index"), false);
  assert.equal(isLegacyShopPath("https://shop.ezvizlife.com/goods/index", "/goods/index"), true);
  assert.equal(isLegacyShopPath("https://new-shop.ezvizlife.com/goods/index", "/goods/index"), false);
});

test("product editor opens legacy goods index even when current new shop path matches", async () => {
  const visited = [];
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    currentUrl: "https://new-vn-shop.ezvizlife.com/goods/index",
    url() {
      return this.currentUrl;
    },
    async evaluate(_fn, arg) {
      if (arg === "H8c") {
        return {
          ok: true,
          href: "https://shop.ezvizlife.com/goods/add?id=123",
          productPageUrl: "",
          candidateUrls: [],
          rowText: "H8c"
        };
      }
      return "";
    },
    async goto(url) {
      visited.push(url);
      this.currentUrl = url;
    },
    async waitForTimeout() {},
    locator() {
      throw new Error("search fallback should not be used");
    }
  };

  await feature.openByName(page, "H8c", []);

  assert.deepEqual(visited, [LEGACY_GOODS_INDEX_URL]);
});
