const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INT_GOODS_CATEGORY_PRIORITY,
  INT_GOODS_SOURCE_SITE_VALUE,
  LEGACY_GOODS_INDEX_URL,
  createProductManagement,
  isLegacyShopPath,
  isLegacyShopUrl,
  normalizeProductNameForMatch,
  orderedIntGoodsCategories,
  productNameSearchVariants
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

test("product copy reuses the source verified just before submission", async () => {
  const requests = [];
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    request: {
      async post(url, options) {
        requests.push({ url, options });
        return { ok: () => true, status: () => 200, text: async () => '{"status":true}' };
      }
    }
  };
  const result = await feature.copy(page, "CB90f Triple Kit", [], {
    productName: "CB90f Triple Kit",
    goodsId: "295737",
    category: { text: "WiFi Cameras" }
  });
  assert.equal(result.goodsId, "295737");
  assert.deepEqual(requests[0].options.form, { cite: "", copy: "295737," });
});

test("product editor navigation treats new regional shop hosts as non-legacy", () => {
  assert.equal(isLegacyShopUrl("https://shop.ezvizlife.com/goods/index"), true);
  assert.equal(isLegacyShopUrl("https://new-vn-shop.ezvizlife.com/goods/index"), false);
  assert.equal(isLegacyShopPath("https://shop.ezvizlife.com/goods/index", "/goods/index"), true);
  assert.equal(isLegacyShopPath("https://new-shop.ezvizlife.com/goods/index", "/goods/index"), false);
});

test("product name matching treats superscript plus as plus", () => {
  assert.equal(
    normalizeProductNameForMatch("H7c Dual 2K\u207a"),
    normalizeProductNameForMatch("H7c Dual 2K+")
  );
  assert.deepEqual(productNameSearchVariants("H7c Dual 2K+"), [
    "H7c Dual 2K+",
    "H7c Dual 2K\u207a"
  ]);
});

test("product editor uses the legacy index from global and regional backend hosts", async () => {
  for (const host of ["new-shop", "new-eu-shop", "new-sa-shop", "new-vn-shop"]) {
    const visited = [];
    const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
    const page = {
      currentUrl: `https://${host}.ezvizlife.com/goods/index`,
      url() { return this.currentUrl; },
      async evaluate(_fn, arg) {
        return arg?.name === "H8c"
          ? { ok: true, href: "https://shop.ezvizlife.com/goods/add?id=123", rowText: "H8c" }
          : "";
      },
      async goto(url) { visited.push(url); this.currentUrl = url; },
      async waitForTimeout() {}
    };
    await feature.openByName(page, "H8c", []);
    assert.deepEqual(visited, [LEGACY_GOODS_INDEX_URL], host);
  }
});

test("product editor reports an index navigation failure instead of product not found", async () => {
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    url: () => "https://new-eu-shop.ezvizlife.com/goods/index",
    evaluate: async () => "",
    goto: async () => ({ status: () => 404 }),
    waitForTimeout: async () => {}
  };
  await assert.rejects(feature.openByName(page, "H8c", []), /产品列表打开失败/);
});

test("product editor forwards exact-only matching to the page search", async () => {
  let searchOptions;
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    currentUrl: LEGACY_GOODS_INDEX_URL,
    url() { return this.currentUrl; },
    async evaluate(_fn, arg) {
      if (!arg?.name) return "";
      searchOptions = arg;
      this.currentUrl = "https://shop.ezvizlife.com/goods/add?id=456";
      return { ok: true, href: this.currentUrl, rowText: "H6c" };
    },
    async waitForTimeout() {}
  };
  await feature.openByName(page, "H6c", [], { exactOnly: true });
  assert.deepEqual(searchOptions, { name: "H6c", exactOnly: true });
});
