const test = require("node:test");
const assert = require("node:assert/strict");
const { registerProductRevisionSyncRoutes } = require("./product-revision-sync-routes");

function setup() {
  const routes = new Map();
  const calls = [];
  const app = {
    post(path, _upload, handler) {
      routes.set(path, handler);
    }
  };
  const upload = {
    fields: () => (_req, _res, next) => next(),
    array: () => (_req, _res, next) => next(),
    none: () => (_req, _res, next) => next()
  };
  const feature = {
    preview: async () => ({ mode: "product-revision-sync-preview" }),
    submit: async () => ({ mode: "product-revision-sync-submit" }),
    previewPublishing: async (body) => {
      calls.push(["previewPublishing", body]);
      return { mode: "product-publishing-preview" };
    },
    submitPublishing: async (body) => {
      calls.push(["submitPublishing", body]);
      return { mode: "product-publishing-submit" };
    }
  };
  registerProductRevisionSyncRoutes(app, {
    upload,
    feature,
    batchFeature: {
      preview: async () => ({ mode: "product-publishing-batch-preview" }),
      submit: async () => ({ mode: "product-publishing-batch-submit" })
    },
    delistingFeature: {
      preview: async () => ({ mode: "product-delisting-preview" }),
      submit: async () => ({ mode: "product-delisting-submit" })
    },
    logLine: (logs, message) => logs.push(message)
  });
  return { routes, calls };
}

async function invoke(handler) {
  const response = { statusCode: 200 };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
  };
  await handler({
    body: { productName: "CP8" },
    files: {
      specExcel: [{ path: "spec.xlsx" }],
      languageDatasheet: [{ path: "datasheet.xlsx" }]
    }
  }, response);
  return response;
}

test("product publishing routes use the copy-before-revision workflow", async () => {
  const { routes, calls } = setup();
  const preview = await invoke(routes.get("/api/product-publishing/preview"));
  const submit = await invoke(routes.get("/api/product-publishing/submit"));

  assert.equal(preview.statusCode, 200);
  assert.equal(preview.body.result.mode, "product-publishing-preview");
  assert.equal(submit.statusCode, 200);
  assert.equal(submit.body.result.mode, "product-publishing-submit");
  assert.deepEqual(calls.map(([name]) => name), ["previewPublishing", "submitPublishing"]);
});
