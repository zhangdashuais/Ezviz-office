const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INT_GOODS_CATEGORY_PRIORITY,
  INT_GOODS_SOURCE_SITE_VALUE,
  LEGACY_GOODS_INDEX_URL,
  createProductManagement,
  isShopProductIndexUrl,
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

test("product editor navigation accepts product lists on approved shop hosts only", () => {
  assert.equal(isLegacyShopUrl("https://shop.ezvizlife.com/goods/index"), true);
  assert.equal(isLegacyShopUrl("https://new-vn-shop.ezvizlife.com/goods/index"), false);
  assert.equal(isLegacyShopPath("https://shop.ezvizlife.com/goods/index", "/goods/index"), true);
  assert.equal(isLegacyShopPath("https://new-shop.ezvizlife.com/goods/index", "/goods/index"), false);
  assert.equal(isShopProductIndexUrl("https://new-shop.ezvizlife.com/goods/index"), true);
  assert.equal(isShopProductIndexUrl("https://new-vn-shop.ezvizlife.com/goods/index"), true);
  assert.equal(isShopProductIndexUrl("https://new-shop.ezvizlife.com/templates/list"), false);
  assert.equal(isShopProductIndexUrl("https://evil.example/goods/index"), false);
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

test("product editor opens the product index from global and regional dashboards", async () => {
  for (const host of ["new-shop", "new-eu-shop", "new-sa-shop", "new-vn-shop"]) {
    const visited = [];
    const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
    const page = {
      currentUrl: `https://${host}.ezvizlife.com/templates/list`,
      url() { return this.currentUrl; },
      async evaluate(_fn, arg) {
        return arg?.name === "H8c"
          ? { ok: true, href: "https://shop.ezvizlife.com/goods/add?id=123", rowText: "H8c" }
          : "";
      },
      async goto(url) { visited.push(url); this.currentUrl = "https://new-shop.ezvizlife.com/goods/index"; },
      locator() { return { first: () => ({ waitFor: async () => {} }) }; },
      async waitForTimeout() {}
    };
    await feature.openByName(page, "H8c", []);
    assert.deepEqual(visited, [LEGACY_GOODS_INDEX_URL], host);
  }
});

test("product editor reports an index navigation failure instead of product not found", async () => {
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    url: () => "https://new-eu-shop.ezvizlife.com/templates/list",
    evaluate: async () => "",
    goto: async () => ({ status: () => 404 }),
    waitForTimeout: async () => {}
  };
  await assert.rejects(feature.openByName(page, "H8c", []), /产品列表打开失败/);
});

test("product editor rejects a redirected product page without a loaded list", async () => {
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    currentUrl: "https://new-shop.ezvizlife.com/templates/list",
    url() { return this.currentUrl; },
    evaluate: async () => "",
    async goto() { this.currentUrl = "https://new-shop.ezvizlife.com/goods/index"; return { status: () => 200 }; },
    locator: () => ({ first: () => ({ waitFor: async () => { throw new Error("not found"); } }) })
  };
  await assert.rejects(feature.openByName(page, "H8c", []), /产品列表未加载/);
});

test("product editor forwards exact-only matching to the page search", async () => {
  let searchOptions;
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  const page = {
    currentUrl: LEGACY_GOODS_INDEX_URL,
    url() { return this.currentUrl; },
    request: { async get() {
      return { ok: () => true, status: () => 200,
        json: async () => ({ status: true, data: { goods_id: 456, name: "H6c" } }) };
    } },
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

test("product editor searches the product-name field rather than a page-size combobox", async () => {
  const feature = createProductManagement({ logLine() {}, normalizeBool: Boolean });
  let searched = false;
  let searchSelector = "";
  const page = {
    currentUrl: LEGACY_GOODS_INDEX_URL,
    url() { return this.currentUrl; },
    async evaluate(_fn, arg) {
      if (!arg?.name) return "";
      if (!searched) return { ok: false };
      this.currentUrl = "https://new-shop.ezvizlife.com/goods/edit/123";
      return { ok: true, rowText: "H8c" };
    },
    locator(selector) {
      searchSelector = selector;
      return { first: () => ({ count: async () => 1, fill: async () => {} }) };
    },
    getByRole(role, options) {
      assert.equal(role, "button");
      assert.match("Product Search", options.name);
      return { first: () => ({ count: async () => 1, click: async () => { searched = true; } }) };
    },
    request: { async get() {
      return { ok: () => true, status: () => 200,
        json: async () => ({ status: true, data: { goods_id: 123, name: "H8c" } }) };
    } },
    async waitForTimeout() {}
  };
  const result = await feature.openByName(page, "H8c", []);
  assert.match(searchSelector, /placeholder\*="Product Name"/);
  assert.match(searchSelector, /not\(\[readonly\]\)/);
  assert.equal(result.editUrl, "https://new-shop.ezvizlife.com/goods/edit/123");
});
