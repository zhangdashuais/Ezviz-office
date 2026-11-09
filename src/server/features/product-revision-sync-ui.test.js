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

test("language-only selection stays in product revision and uses its own Datasheet input", () => {
  assert.match(html, /value="specification-only">只改 Specification/);
  assert.match(html, /value="language-only">只改语言包/);
  assert.match(html, /id="revisionSyncLanguageDatasheet"/);
  assert.match(script, /operationSelect\.addEventListener\("change", updateModeUi\)/);
  assert.doesNotMatch(script, /nav-item\[data-target="tab-language-package"\]/);
  assert.match(script, /if \(isLanguageOnly\(\)\) form\.append\("updateScope", "language-only"\)/);
});

test("batch publishing only renders sites whose Specification language is ready", () => {
  assert.match(script, /workbookHeaders\(product\.files\.specification, "specification", true\)/);
  assert.match(script, /!isBatchPublishing\(\)[\s\S]*autoLanguageHeader\(site\.siteCode, specificationHeaders\)/);
});

test("batch publishing exposes force translation overwrite and includes it in the request signature", () => {
  assert.match(html, /id="revisionForceTranslationOverwrite" type="checkbox"/);
  assert.ok(html.indexOf('id="revisionForceTranslationOverwriteLabel"')
    > html.indexOf('id="revisionSyncOutput"'));
  assert.match(script, /forceTranslationOverwrite: forceTranslationOverwriteInput\.checked/);
  assert.match(script, /form\.append\("forceTranslationOverwrite", forceTranslationOverwriteInput\.checked \? "1" : "0"\)/);
  assert.match(script, /forceTranslationOverwriteInput\.addEventListener\("change", \(\) => previewButton\.click\(\)\)/);
  assert.match(script, /if \(isBatchPublishing\(\)\) forceTranslationOverwriteLabel\.hidden = false/);
});
