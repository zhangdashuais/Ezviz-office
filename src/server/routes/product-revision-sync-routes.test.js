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
    },
    previewCommonRevision: async () => ({ mode: "product-common-revision-preview" }),
    submitCommonRevision: async () => ({ mode: "product-common-revision-submit" }),
    previewContentSync: async () => ({ mode: "product-content-sync-preview" }),
    submitContentSync: async () => ({ mode: "product-content-sync-submit" }),
    searchProductAvailability: async () => ({ mode: "product-availability-search" })
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

async function invoke(handler, request = {}) {
  const response = { statusCode: 200 };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
  };
  await handler({
    body: request.body || { productName: "CP8" },
    files: request.files || {
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

test("common partial revision has dedicated routes instead of publishing batch routes", async () => {
  const { routes } = setup();
  const preview = await invoke(routes.get("/api/product-revision/common-preview"));
  const submit = await invoke(routes.get("/api/product-revision/common-submit"));

  assert.equal(preview.body.result.mode, "product-common-revision-preview");
  assert.equal(submit.body.result.mode, "product-common-revision-submit");
  assert.equal(routes.has("/api/product-revision/batch-preview"), false);
});

test("product content sync has preview and submit routes without file uploads", async () => {
  const { routes } = setup();
  const preview = await invoke(routes.get("/api/product-content-sync/preview"));
  const submit = await invoke(routes.get("/api/product-content-sync/submit"));

  assert.equal(preview.body.result.mode, "product-content-sync-preview");
  assert.equal(submit.body.result.mode, "product-content-sync-submit");
});

test("product availability search has a read-only route", async () => {
  const { routes } = setup();
  const response = await invoke(routes.get("/api/product-availability/search"));
  assert.equal(response.body.result.mode, "product-availability-search");
});

test("Specification-only revision accepts only the Specification workbook", async () => {
  const { routes } = setup();
  const response = await invoke(routes.get("/api/product-revision-sync/preview"), {
    body: { productName: "CP8", updateScope: "specification-only" },
    files: { specExcel: [{ path: "spec.xlsx" }] }
  });
  assert.equal(response.statusCode, 200);
});

test("language-only revision accepts only the Datasheet workbook", async () => {
  const { routes } = setup();
  const response = await invoke(routes.get("/api/product-revision-sync/preview"), {
    body: { productName: "CP8", updateScope: "language-only" },
    files: { languageDatasheet: [{ path: "datasheet.xlsx" }] }
  });
  assert.equal(response.statusCode, 200);
});

test("language-only revision still requires a Datasheet workbook", async () => {
  const { routes } = setup();
  const response = await invoke(routes.get("/api/product-revision-sync/preview"), {
    body: { productName: "CP8", updateScope: "language-only" },
    files: {}
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /语言包 Datasheet/);
});
