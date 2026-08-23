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
  writeUpdatedLanguagePackage,
  writeUpdatedLanguagePackageNative,
  normalizeSourceForComparison,
  normalizeTranslationForComparison
} = require("./language-package-workbook");

test("source comparison ignores casing and whitespace but not changed words", () => {
  assert.equal(
    normalizeSourceForComparison("Great Brands Don't Age. They Adapt."),
    normalizeSourceForComparison("Great brands don't age. They adapt.")
  );
  assert.equal(
    normalizeSourceForComparison("appearance) from 2022"),
    normalizeSourceForComparison("appearance)from 2022")
  );
  assert.notEqual(
    normalizeSourceForComparison("ULTRA HD"),
    normalizeSourceForComparison("ULTRA UD")
  );
});

test("translation comparison ignores Excel line-ending conversion", () => {
  assert.equal(
    normalizeTranslationForComparison("restez connecté\r\n\r\nà tout moment"),
    normalizeTranslationForComparison("restez connecté\n\nà tout moment")
  );
});

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

test("skips a note-only Datasheet row but still rejects translated rows without source text", () => {
  const parsed = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["Review note for the following strings", "", ""],
    ["product_title", "Smart camera", "Cámara inteligente"]
  ]));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].key, "product_title");

  assert.throws(() => parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["product_title", "", "Cámara inteligente"]
  ])), /缺少原文/);
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

test("does not plan an update when only translation line endings differ", () => {
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "French"],
    ["HP8_2", "Doorbell description", "Première ligne\r\n\r\nDeuxième ligne"]
  ]));
  const languagePackage = readLanguagePackage(workbookBuffer([
    ["Category", "Serial", "Single word", "en-US", "fr-FR(need translation)"],
    ["goods", "G1", "HP8_2", "Doorbell description", "Première ligne\n\nDeuxième ligne"]
  ], "biff8"), "fr-FR");
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "French");
  assert.equal(plan.changedCellCount, 0);
  assert.equal(plan.unchangedCellCount, 1);
});

test("plans new Datasheet fields for append and treats the site package source as authoritative", () => {
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["product_title", "Different source", "Nuevo"],
    ["not_in_package", "Unknown", "Desconocido"]
  ]));
  const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
  assert.equal(plan.safe, true);
  assert.equal(plan.missing.length, 1);
  assert.equal(plan.newFields.length, 1);
  assert.equal(plan.sourceMismatches.length, 1);
  assert.equal(plan.changedCellCount, 1);
  if (plan.newFields.length) return;
  assert.throws(() => assertSafePlan(plan), /预检未通过/);
});

test("copies translations by stable key while only reporting a source mismatch", () => {
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["product_title", "Revised source", "Nuevo"]
  ]));
  const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
  assert.equal(plan.safe, true);
  assert.equal(plan.sourceMismatches.length, 1);
  assert.equal(plan.changedCellCount, 1);
  assert.doesNotThrow(() => assertSafePlan(plan));
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

test("appends new Datasheet fields to the language package end", () => {
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["new_field", "New source", "Nuevo"]
  ]));
  const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "language-package-append-"));
  try {
    const outputPath = path.join(temporaryDirectory, "es-ES.xlsx");
    const result = writeUpdatedLanguagePackage(languagePackage, plan, outputPath);
    assert.equal(result.appendedFieldCount, 1);
    const verified = readLanguagePackage(outputPath, "es-ES");
    const sheet = verified.workbook.Sheets.Sheet1;
    assert.equal(sheet.C6.v, "new_field");
    assert.equal(sheet.D6.v, "New source");
    assert.equal(sheet.E6.v, "Nuevo");
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("uses native Excel to update and append fields without rebuilding the xls", {
  skip: process.platform !== "win32",
  timeout: 30000
}, () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "language-package-native-"));
  try {
    const inputPath = path.join(temporaryDirectory, "before.xls");
    const outputPath = path.join(temporaryDirectory, "after.xls");
    fs.writeFileSync(inputPath, packageBuffer());
    const datasheet = parseLanguageDatasheet(workbookBuffer([
      ["Field", "Source", "Spanish"],
      ["product_title", "Smart camera", "Nuevo"],
      ["new_field", "New source", "Nueva traduccion"]
    ]));
    const languagePackage = readLanguagePackage(inputPath, "es-ES");
    const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
    const result = writeUpdatedLanguagePackageNative(
      inputPath,
      languagePackage,
      datasheet,
      plan,
      outputPath
    );
    assert.equal(result.verifiedCellCount, 2);
    const verified = readLanguagePackage(outputPath, "es-ES");
    assert.equal(verified.workbook.Sheets.Sheet1.E2.v, "Nuevo");
    assert.equal(verified.workbook.Sheets.Sheet1.C6.v, "new_field");
    assert.equal(verified.workbook.Sheets.Sheet1.E6.v, "Nueva traduccion");
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
