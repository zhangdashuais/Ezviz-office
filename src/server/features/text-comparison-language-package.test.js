const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  readLanguageReplacementMap,
  replaceLanguageFieldsInHtml
} = require("./text-comparison-language-package");

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Goods");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("reads total language package fields and replaces html language tokens with en-US source", () => {
  const languagePackage = readLanguageReplacementMap(workbookBuffer([
    ["Category", "Serial", "Single word", "en-US", "fr-FR(need translation)"],
    ["goods", "1", "camera_title", "Smart Camera", "Caméra intelligente"],
    ["goods", "2", "camera_copy", "Always stays connected", "Reste toujours connectée"]
  ]));
  const result = replaceLanguageFieldsInHtml(
    "<h1>{{t('goods.camera_title')}}</h1><p>{{t(&#39;goods.camera_copy&#39;)}}</p>",
    languagePackage.valuesByKey
  );

  assert.equal(languagePackage.fieldCount, 2);
  assert.match(result.html, /Smart Camera/);
  assert.match(result.html, /Always stays connected/);
  assert.equal(result.replacementCount, 2);
  assert.deepEqual(result.missingKeys, []);
});

test("can use a requested language column when replacing html language tokens", () => {
  const languagePackage = readLanguageReplacementMap(workbookBuffer([
    ["Single word", "en-US", "fr-FR(need translation)"],
    ["camera_title", "Smart Camera", "Caméra intelligente"]
  ]), { column: "fr-FR" });
  const result = replaceLanguageFieldsInHtml(
    "<h1>{{t('goods.camera_title')}}</h1><p>{{t('goods.missing')}}</p>",
    languagePackage.valuesByKey
  );

  assert.match(result.html, /Caméra intelligente/);
  assert.match(result.html, /\{\{t\('goods\.missing'\)\}\}/);
  assert.deepEqual(result.missingKeys, ["goods.missing"]);
});

test("can annotate replaced language tokens for text comparison field suggestions", () => {
  const languagePackage = readLanguageReplacementMap(workbookBuffer([
    ["Single word", "en-US"],
    ["camera_title", "Smart Camera"]
  ]));
  const result = replaceLanguageFieldsInHtml(
    "<h1>{{t('goods.camera_title')}}</h1>",
    languagePackage.valuesByKey,
    { annotate: true }
  );

  assert.match(result.html, /data-text-compare-language-key="goods\.camera_title"/);
  assert.match(result.html, />Smart Camera<\/span>/);
});
