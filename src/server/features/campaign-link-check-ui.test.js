const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const html = fs.readFileSync(path.join(root, "办公软件/111/inline-packager.html"), "utf8");
const script = fs.readFileSync(path.join(root, "办公软件/111/src/module-campaign-tools.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("campaign link check uses one explicit country and defaults to banner plus popup", () => {
  assert.match(html, /id="campaignAuditSiteSelect"/);
  assert.match(html, /<option value="all" selected>banner \+ popup<\/option>/);
  assert.match(html, /检查所选国家链接/);
  assert.match(script, /const selected = \[siteCode\]/);
  assert.match(script, /placement: el\.auditPlacement\.value/);
});

test("campaign link check displays every checked URL and redirect target", () => {
  assert.match(script, /const checked = issues\.links \|\| \[\]/);
  assert.match(script, /最终地址/);
  assert.match(server, /finalUrl: link\.finalUrl \|\| ""/);
  assert.match(server, /summary: report\?\.summary \|\| null,\s+links,/);
});
