const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("product availability search has its own tab", () => {
  const root = path.resolve(__dirname, "../../..");
  const html = fs.readFileSync(path.join(root, "办公软件/111/inline-packager.html"), "utf8");
  const moduleSource = fs.readFileSync(path.join(root, "办公软件/111/src/module-product-availability.js"), "utf8");

  assert.match(html, /data-target="tab-product-availability"/);
  assert.match(html, /id="tab-product-availability"/);
  assert.doesNotMatch(html, /<option value="availability-search">/);
  assert.match(html, /src="src\/module-product-availability\.js\?v=/);
  assert.match(moduleSource, /\/api\/product-availability\/search/);
});
