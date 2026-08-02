const test = require("node:test");
const assert = require("node:assert/strict");
const { createSpecificationTranslationFeature } = require("./specification-translation");

function createFeature() {
  return createSpecificationTranslationFeature({
    logLine() {},
    shopCredentials: {},
    async openProductEditorByName() {}
  });
}

test("Specification submit posts the full product model directly", async () => {
  let captured = null;
  const page = {
    request: {
      async post(url, options) {
        captured = { url, options };
        return {
          ok: () => true,
          status: () => 200,
          text: async () => JSON.stringify({ status: 1, redirect: "/goods/index" })
        };
      }
    }
  };
  const payload = { goods_id: "123", pcView: { customs: [] } };
  const result = await createFeature().postProductUpdate(page, payload);

  assert.equal(captured.url, "https://shop.ezvizlife.com/goods/do-edit-goods");
  assert.deepEqual(captured.options.data, { data: payload });
  assert.equal(captured.options.headers["x-requested-with"], "XMLHttpRequest");
  assert.equal(result.backendStatus, 1);
});

test("Specification submit rejects a backend business failure", async () => {
  const page = {
    request: {
      async post() {
        return {
          ok: () => true,
          status: () => 200,
          text: async () => JSON.stringify({ status: 0, msg: "blocked" })
        };
      }
    }
  };
  await assert.rejects(
    () => createFeature().postProductUpdate(page, { goods_id: "123" }),
    /blocked/
  );
});
