const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.resolve(__dirname, "../../../办公软件/111/inline-packager.html"),
  "utf8"
);
const script = fs.readFileSync(
  path.resolve(__dirname, "../../../办公软件/111/src/module-product-revision-sync.js"),
  "utf8"
);

test("product revision offers separate Specification-only and language-only modes", () => {
  assert.match(html, /value="specification-only">只改 Specification/);
  assert.match(html, /value="language-only">只改语言包/);
  assert.match(script, /!isLanguageOnly\(\) && !file/);
  assert.match(script, /!isSpecificationOnly\(\) && !languageDatasheet/);
});
