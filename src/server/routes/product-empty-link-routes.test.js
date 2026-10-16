const test = require("node:test");
const assert = require("node:assert/strict");
const { registerProductEmptyLinkRoutes } = require("./product-empty-link-routes");

test("product empty-link routes expose preview and submit", async () => {
  const routes = new Map();
  const app = { post: (path, _middleware, handler) => routes.set(path, handler) };
  const upload = { none: () => (_req, _res, next) => next() };
  const feature = {
    preview: async () => ({ mode: "product-empty-link-preview" }),
    submit: async () => ({ mode: "product-empty-link-submit" })
  };
  registerProductEmptyLinkRoutes(app, {
    upload,
    feature,
    logLine: (logs, message) => logs.push(message)
  });

  for (const [path, mode] of [
    ["/api/product-empty-link/preview", "product-empty-link-preview"],
    ["/api/product-empty-link/submit", "product-empty-link-submit"]
  ]) {
    const response = { status: () => response, json: (body) => { response.body = body; } };
    await routes.get(path)({ body: {} }, response);
    assert.equal(response.body.result.mode, mode);
  }
});
