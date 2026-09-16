const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  chooseLanguageRowCandidate,
  chooseLanguageTemplateCandidate,
  globalFirst,
  buildGlobalPropagationProbe,
  hasGlobalSourcePropagation,
  approvedDatasheetSiteCodes
} = require("./language-package");

test("Datasheet submit approves ready sites without blocking on skipped sites", () => {
  const targets = ["hq", "cn", "fr"].map((siteCode) => ({ site: { siteCode } }));
  const approved = approvedDatasheetSiteCodes({ approvedSiteCodes: '["fr"]' }, targets);
  assert.deepEqual([...approved], ["fr"]);
  assert.throws(
    () => approvedDatasheetSiteCodes({ approvedSiteCodes: '["unknown"]' }, targets),
    /当前预览不一致/
  );
});
const { readLanguagePackage } = require("./language-package-workbook");

test("full-site Datasheet submissions always process Global first", () => {
  const targets = [
    { site: { siteCode: "la" } },
    { site: { siteCode: "hq" } },
    { site: { siteCode: "us" } }
  ];
  assert.deepEqual(globalFirst(targets).map((target) => target.site.siteCode), ["hq", "la", "us"]);
});

test("English-only sites can use the explicit en-US language template download", () => {
  const selected = chooseLanguageTemplateCandidate([{
    text: "Download Language Template",
    href: "https://shop.ezvizlife.com/language/down?lang_code=en-US"
  }], "English (Source)");

  assert.equal(selected.langCode, "en-US");
  assert.equal(chooseLanguageTemplateCandidate([{
    text: "Download Language Template",
    href: "https://shop.ezvizlife.com/language/down?lang_code=en-US"
  }], "Français (France-法语)"), null);
});

test("Global propagation is accepted only after the changed English source is visible", () => {
  const datasheet = {
    sheetName: "Sheet1",
    headers: ["English (Source)", "Spanish"],
    headerColumns: { "English (Source)": 1, Spanish: 2 },
    rows: [{
      key: "product_copy",
      source: "New English source",
      rowNumber: 2,
      translations: { "English (Source)": "New English source", Spanish: "Nuevo" }
    }]
  };
  const probe = buildGlobalPropagationProbe(datasheet, {
    updates: [{ key: "product_copy" }],
    newFields: []
  });
  const packageForSource = (source) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"],
      ["goods", "G1", "product_copy", source, "Anterior"]
    ]), "Sheet1");
    return readLanguagePackage(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "es-ES");
  };

  assert.equal(hasGlobalSourcePropagation(packageForSource("Old English source"), probe, "Spanish"), false);
  assert.equal(hasGlobalSourcePropagation(packageForSource("New English source"), probe, "Spanish"), true);
});

test("France selects fr-FR instead of the preceding fr-CA package", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "Canada (Français)-FRSTORE Delete Edit Download Phrase Missing", langCode: "fr-CA" },
    { rowText: "Français-FRSTORE Delete Edit Download Phrase Missing", langCode: "fr-FR" }
  ], "fr");

  assert.equal(selected.langCode, "fr-FR");
});

test("Canada prefers its English package when both Canadian locales exist", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "Canada (Français)-CASTORE Delete Edit Download", langCode: "fr-CA" },
    { rowText: "Canada (English)-CASTORE Delete Edit Download", langCode: "en-CA" }
  ], "ca");

  assert.equal(selected.langCode, "en-CA");
});

test("global action fallback also selects the France locale by lang_code", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "Canada (Français)-FRSTORE", langCode: "fr-CA", actionIndex: 3 },
    { rowText: "Français-FRSTORE", langCode: "fr-FR", actionIndex: 7 }
  ], "fr");

  assert.equal(selected.actionIndex, 7);
});

test("Belgium selects its editable Dutch package for the Dutch Datasheet column", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "België-BESTORE Delete Edit Download", langCode: "" },
    { rowText: "Belgique-BEFRSTORE Delete Edit Download", langCode: "" }
  ], "be", "13_Nederlands (Dutch-荷兰语)");

  assert.match(selected.rowText, /^België/);
});
