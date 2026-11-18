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
const languagePackageScript = fs.readFileSync(
  path.resolve(__dirname, "../../../办公软件/111/src/module-language-package.js"),
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

test("language-only results show both English sources and their cell addresses", () => {
  assert.match(languagePackageScript, /mismatch\.datasheetSourceLocation/);
  assert.match(languagePackageScript, /mismatch\.expectedSource/);
  assert.match(languagePackageScript, /entry\.location/);
  assert.match(languagePackageScript, /entry\.source/);
  assert.match(script, /appendSourceMismatches\(lines, item\.languagePackage\?\.sourceMismatches/);
});

test("batch publishing only renders sites whose Specification language is ready", () => {
  assert.match(script, /workbookHeaders\(product\.files\.specification, "specification", true\)/);
  assert.match(script, /!isBatchPublishing\(\)[\s\S]*autoLanguageHeader\(site\.siteCode, specificationHeaders\)/);
});

test("batch publishing exposes force translation overwrite and includes it in the request signature", () => {
  assert.match(html, /id="revisionForceTranslationOverwrite" type="checkbox"/);
  assert.ok(html.indexOf('id="revisionForceTranslationOverwriteLabel"')
    < html.indexOf('id="revisionSyncSelectMatched"'));
  assert.match(html, /覆盖当前冲突语言包译文（默认关闭；仅覆盖目标译文，不修改英文原文或 Sheet1）/);
  assert.match(script, /forceTranslationOverwrite: forceTranslationOverwriteInput\.checked/);
  assert.match(script, /form\.append\("forceTranslationOverwrite", forceTranslationOverwriteInput\.checked \? "1" : "0"\)/);
  assert.match(script, /forceTranslationOverwriteLabel\.hidden = !batch/);
  assert.match(script, /const shouldRefreshPreview = Boolean\(validatedPreview\) && isBatchPublishing\(\)/);
  assert.match(script, /invalidatePreview\(true\)/);
});
