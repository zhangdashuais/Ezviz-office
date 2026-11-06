const test = require("node:test");
const assert = require("node:assert/strict");
const {
  goodsIdFromEditorUrl,
  readProductBackendRecord,
  pcViewFromBackendRecord
} = require("./product-backend-record");

test("product editor ids are accepted only from approved backend URLs", () => {
  assert.equal(goodsIdFromEditorUrl("https://new-shop.ezvizlife.com/goods/edit/351650"), "351650");
  assert.equal(goodsIdFromEditorUrl("https://new-eu-shop.ezvizlife.com/goods/edit/123"), "123");
  assert.equal(goodsIdFromEditorUrl("https://shop.ezvizlife.com/goods/add?id=456"), "456");
  assert.equal(goodsIdFromEditorUrl("https://evil.example/goods/edit/123"), "");
  assert.equal(goodsIdFromEditorUrl("http://new-shop.ezvizlife.com/goods/edit/123"), "");
});

test("product backend reader verifies the id and name before returning data", async () => {
  const visited = [];
  const page = {
    url: () => "https://new-shop.ezvizlife.com/goods/edit/351650",
    request: { async get(url) {
      visited.push(url);
      return { ok: () => true, status: () => 200,
        json: async () => ({ status: true, data: { goods_id: 351650, name: "DP2 Pro" } }) };
    } }
  };
  const record = await readProductBackendRecord(page, { productName: "DP2 Pro" });
  assert.equal(record.goods_id, 351650);
  assert.deepEqual(visited, ["https://shop.ezvizlife.com/goods/edit-goods?goods_id=351650"]);
  await assert.rejects(readProductBackendRecord(page, { productName: "Other" }), /产品名称不一致/);
});

test("product backend reader rejects mismatched product records", async () => {
  const page = {
    url: () => "https://new-shop.ezvizlife.com/goods/edit/351650",
    request: { async get() {
      return { ok: () => true, status: () => 200,
        json: async () => ({ status: true, data: { goods_id: 123, name: "DP2 Pro" } }) };
    } }
  };
  await assert.rejects(readProductBackendRecord(page), /goods_id 不一致/);
});

test("backend record maps Overview and custom Specification fields", () => {
  assert.deepEqual(pcViewFromBackendRecord({
    summary_intro: "<p>Overview</p>",
    extra: [{ name_key: "Specification", name_value: "<p>Spec</p>" }]
  }), {
    summary: "<p>Overview</p>",
    customs: [{ name: "Specification", value: "<p>Spec</p>" }]
  });
});
