const test = require("node:test");
const assert = require("node:assert/strict");
const { replaceSpecificationTerms, createSpecificationTranslationFeature } = require("./specification-translation");

test("replaces singular and plural Specification with one localized term", () => {
  const result = replaceSpecificationTerms(
    "<h2>Specifications</h2><a>Specification</a><p>specification-grade</p>",
    "Spécifications"
  );
  assert.equal(result.replaced, 3);
  assert.equal(result.generatedHtml, "<h2>Spécifications</h2><a>Spécifications</a><p>Spécifications-grade</p>");
});

test("does not replace a Specification substring inside another word", () => {
  const result = replaceSpecificationTerms("<p>respecification</p>", "Datenblatt");
  assert.equal(result.replaced, 0);
});

test("requires a translated term", () => {
  assert.throws(() => replaceSpecificationTerms("Specification", "  "), /没有从参考详情页取得/);
});

test("reads the redirected product list through the new backend pagination API", async () => {
  const calls = [];
  const feature = createSpecificationTranslationFeature({ logLine() {} });
  const page = {
    async goto() {},
    url: () => "https://new-shop.ezvizlife.com/goods/index",
    request: {
      async post(url, options) {
        calls.push({ url, data: options.data });
        return {
          ok: () => true,
          status: () => 200,
          async json() { return { code: 200, meta: { total: 2 }, data: [
            { goodsId: 12, name: "First" }, { goodsId: 13, name: "Second" }
          ] }; }
        };
      }
    }
  };
  const products = await feature.listAllProducts(page);
  assert.deepEqual(products, [
    { name: "First", editUrl: "https://new-shop.ezvizlife.com/goods/edit/12" },
    { name: "Second", editUrl: "https://new-shop.ezvizlife.com/goods/edit/13" }
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].data, { page: 1, pageSize: 100 });
});

test("new editor reads and saves only the Specification field in the raw payload", async () => {
  const feature = createSpecificationTranslationFeature({ logLine() {} });
  const original = {
    goods_id: 12, name: "First", summary_intro: "Overview",
    extra: [{ name_key: "Specifications", name_value: "Specification old" },
      { name_key: "Other", name_value: "Keep me" }]
  };
  let submitted;
  const page = {
    url: () => "https://new-shop.ezvizlife.com/goods/edit/12",
    request: {
      async get() { return {
        ok: () => true, status: () => 200,
        async json() { return { status: true, data: structuredClone(original) }; }
      }; },
      async post(url, options) { submitted = { url, payload: options.data.data }; return {
        ok: () => true, status: () => 200, async json() { return { status: 1 }; }
      }; }
    }
  };
  assert.deepEqual(await feature.readEditor(page), {
    goodsId: "12", html: "Specification old", hasField: true
  });
  await feature.saveEditor(page, "Translated new");
  assert.equal(submitted.payload.extra[0].name_value, "Translated new");
  assert.equal(submitted.payload.extra[1].name_value, "Keep me");
  assert.equal(submitted.payload.summary_intro, "Overview");
});
