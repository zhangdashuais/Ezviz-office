const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const {
  parseLanguageDatasheet,
  resolveDatasheetLanguage,
  readLanguagePackage,
  planLanguagePackageUpdates,
  assertSafePlan,
  writeUpdatedLanguagePackage
} = require("./language-package-workbook");

function workbookBuffer(rows, bookType = "xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType });
}

function datasheetBuffer() {
  return workbookBuffer([
    ["Field", "Source", "Spanish", "French"],
    ["product_title", "Smart camera", "Cámara inteligente", "Caméra intelligente"],
    ["duplicate_key", "Same source", "Mismo texto", "Même texte"],
    ["blank_translation", "Keep existing", "", ""]
  ]);
}

function packageBuffer() {
  return workbookBuffer([
    [
      "Category (cannot be modified)",
      "Serial number (cannot be modified)",
      "Single word (cannot be modified)",
      "en-US(cannot be modified)",
      "es-ES(need translation)",
      "Descr"
    ],
    ["goods", "G1", "product_title", "Smart camera", "Cámara antigua", ""],
    ["goods", "G2", "duplicate_key", "Same source", "Anterior 1", ""],
    ["goods", "G3", "duplicate_key", "Same source", "Anterior 2", ""],
    ["goods", "G4", "blank_translation", "Keep existing", "Conservar", ""]
  ], "biff8");
}

test("parses language Datasheet and resolves a target language", () => {
  const parsed = parseLanguageDatasheet(datasheetBuffer());
  assert.deepEqual(parsed.headers, ["Spanish", "French"]);
  assert.equal(parsed.rows[0].key, "product_title");
  assert.equal(
    resolveDatasheetLanguage(parsed, { siteCode: "es" }, { es: ["spanish"] }),
    "Spanish"
  );
});

test("plans exact field and source matches, including identical duplicates", () => {
  const datasheet = parseLanguageDatasheet(datasheetBuffer());
  const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
  assert.equal(plan.safe, true);
  assert.equal(plan.matchedFieldCount, 2);
  assert.equal(plan.changedCellCount, 3);
  assert.equal(plan.skippedBlankCount, 1);
});

test("blocks missing fields and source mismatches", () => {
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["product_title", "Different source", "Nuevo"],
    ["not_in_package", "Unknown", "Desconocido"]
  ]));
  const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
  assert.equal(plan.safe, false);
  assert.equal(plan.missing.length, 1);
  assert.equal(plan.sourceMismatches.length, 1);
  assert.throws(() => assertSafePlan(plan), /预检未通过/);
});

test("writes an xls package and verifies updated cells", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "language-package-"));
  try {
    const datasheet = parseLanguageDatasheet(datasheetBuffer());
    const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
    const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
    const outputPath = path.join(temporaryDirectory, "es-ES.xls");
    const result = writeUpdatedLanguagePackage(languagePackage, plan, outputPath);
    assert.equal(result.verifiedCellCount, 3);
    const verified = readLanguagePackage(outputPath, "es-ES");
    const sheet = verified.workbook.Sheets.Sheet1;
    assert.equal(sheet.E2.v, "Cámara inteligente");
    assert.equal(sheet.E3.v, "Mismo texto");
    assert.equal(sheet.E4.v, "Mismo texto");
    assert.equal(sheet.E5.v, "Conservar");
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
