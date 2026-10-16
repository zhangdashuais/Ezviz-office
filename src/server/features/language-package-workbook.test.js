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
  languagePackageKeySnapshot,
  assertSafePlan,
  assertPlanPreservesSheet,
  writeUpdatedLanguagePackage,
  writeUpdatedLanguagePackageNative,
  normalizeSourceForComparison,
  normalizeTranslationForComparison,
  workbookContentFingerprintForGlobalRebase
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

test("source comparison tolerates HTML spaces, footnote glyphs, and trailing punctuation", () => {
  assert.equal(
    normalizeSourceForComparison("Time intervals&nbsp;create video4"),
    normalizeSourceForComparison("Time intervals create video⁴.")
  );
});

test("translation comparison ignores Excel line-ending conversion", () => {
  assert.equal(
    normalizeTranslationForComparison("restez connecté\r\n\r\nà tout moment"),
    normalizeTranslationForComparison("restez connecté\n\nà tout moment")
  );
});

test("translation comparison ignores invisible direction markers", () => {
  assert.equal(
    normalizeTranslationForComparison("دقة 2K\u200e"),
    normalizeTranslationForComparison("دقة 2K")
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

test("only validates the selected language column and reports usable row issues", () => {
  const parsed = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish", "French"],
    ["Review note for the following strings", "", "", ""],
    ["product_title", "Smart camera", "Cámara inteligente", "Caméra intelligente"],
    ["french_only_problem", "", "", "Texte français"]
  ]));
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].key, "product_title");
  const languagePackage = readLanguagePackage(packageBuffer(), "es-ES");
  const plan = planLanguagePackageUpdates(languagePackage, parsed, "Spanish");
  assert.equal(plan.inputWarnings.length, 0);
  assert.equal(plan.changedCellCount, 1);
});

test("selected-language row errors become located warnings instead of blocking updates", () => {
  const parsed = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish", "French"],
    ["product_title", "Smart camera", "Primero", "Caméra"],
    ["product_title", "Smart camera", "Último", ""],
    ["", "Missing key", "Sin clave", ""],
    ["french_problem", "", "", "Texte français"]
  ]));
  const plan = planLanguagePackageUpdates(readLanguagePackage(packageBuffer(), "es-ES"), parsed, "Spanish");
  assert.equal(plan.changedCellCount, 1);
  assert.equal(plan.updates[0].translation, "Último");
  assert.deepEqual(plan.inputWarnings.map((item) => item.type), ["duplicate-key", "missing-key"]);
  assert.deepEqual(plan.inputWarnings.map((item) => item.location), ["Sheet1!C3", "Sheet1!C4"]);
});

test("a readable Datasheet without translation columns remains parseable", () => {
  const parsed = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source"],
    ["product_title", "Smart camera"]
  ]));
  assert.deepEqual(parsed.headers, []);
  assert.equal(parsed.rows.length, 1);
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
  assert.equal(plan.sourceChangedCellCount, 1);
  assert.equal(plan.sourceUpdates[0].source, "Revised source");
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

test("publishing fills blank translations but preserves populated keys and mismatched sources", () => {
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["reviewed", "Same source", "Máquina"],
    ["empty", "Same source", "Nuevo"],
    ["different_source", "Changed source", "Cambio"],
    ["different_source_filled", "Changed source", "Cambio 2"],
    ["new_key", "New source", "Nuevo campo"]
  ]));
  const current = readLanguagePackage(workbookBuffer([
    ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"],
    ["goods", "G1", "reviewed", "Same source", "Revisado"],
    ["goods", "G2", "empty", "Same source", ""],
    ["goods", "G3", "different_source", "Old source", ""],
    ["goods", "G4", "different_source_filled", "Old source", "Revisado también"]
  ], "biff8"), "es-ES");
  const publishing = planLanguagePackageUpdates(current, datasheet, "Spanish", { fillBlankOnly: true });
  assert.deepEqual(publishing.updates.map((item) => item.key), ["empty", "different_source"]);
  assert.equal(publishing.updates[1].sourceMismatch, true);
  assert.deepEqual(publishing.newFields.map((item) => item.key), ["new_key"]);
  assert.equal(publishing.preservedExistingCount, 2);
  assert.equal(publishing.preservedExisting[0].current, "Revisado");
  assert.equal(publishing.preservedExisting[1].sourceMismatch, true);
  assert.equal(publishing.sourceChangedCellCount, 0);
  assert.deepEqual(publishing.sourceMismatches.map((item) => item.key), [
    "different_source", "different_source_filled"
  ]);
  const revision = planLanguagePackageUpdates(current, datasheet, "Spanish");
  assert.ok(revision.updates.some((item) => item.key === "reviewed"));
  assert.ok(revision.sourceUpdates.some((item) => item.key === "different_source"));
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ezviz-source-mismatch-"));
  try {
    const outputPath = path.join(outputDirectory, "filled.xlsx");
    writeUpdatedLanguagePackage(current, publishing, outputPath);
    const filled = readLanguagePackage(outputPath, "es-ES");
    assert.deepEqual(languagePackageKeySnapshot(filled, ["different_source"]).different_source,
      [JSON.stringify([normalizeSourceForComparison("Old source"), "Cambio"])]);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
  const originalSnapshot = languagePackageKeySnapshot(current, ["reviewed", "empty"]);
  const changed = readLanguagePackage(workbookBuffer([
    ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"],
    ["goods", "G1", "reviewed", "Same source", "Máquina"],
    ["goods", "G2", "empty", "Same source", "Nuevo"]
  ], "biff8"), "es-ES");
  const changedSnapshot = languagePackageKeySnapshot(changed, ["reviewed", "empty"]);
  assert.notDeepEqual(changedSnapshot.reviewed, originalSnapshot.reviewed);
});

test("product publishing preserves Sheet1 and updates only Sheet2", () => {
  const workbook = XLSX.utils.book_new();
  const heading = ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    heading, ["common", "C1", "system_copy", "System source", "Sistema"]
  ]), "Sheet1");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    heading, ["goods", "G1", "product_copy", "Product source", ""]
  ]), "Sheet2");
  const packageInfo = readLanguagePackage(XLSX.write(workbook, { type: "buffer", bookType: "biff8" }), "es-ES");
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"], ["product_copy", "Product source", "Producto"]
  ]));
  const plan = planLanguagePackageUpdates(packageInfo, datasheet, "Spanish", { fillBlankOnly: true });
  assert.doesNotThrow(() => assertPlanPreservesSheet(packageInfo, plan, "Sheet1"));
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ezviz-preserve-sheet1-"));
  try {
    const outputPath = path.join(outputDirectory, "updated.xlsx");
    writeUpdatedLanguagePackage(packageInfo, plan, outputPath, { preserveSheets: ["Sheet1"] });
    const result = readLanguagePackage(outputPath, "es-ES");
    assert.equal(result.workbook.Sheets.Sheet1.E2.v, "Sistema");
    assert.equal(result.workbook.Sheets.Sheet2.E2.v, "Producto");
    const forbidden = planLanguagePackageUpdates(result, parseLanguageDatasheet(workbookBuffer([
      ["Field", "Source", "Spanish"], ["system_copy", "System source", "Nuevo"]
    ])), "Spanish");
    assert.throws(() => assertPlanPreservesSheet(result, forbidden, "Sheet1"), /仅允许修改 Sheet2/);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("publishing a later product preserves translations filled by an earlier batch", () => {
  const initial = readLanguagePackage(workbookBuffer([
    ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"],
    ["goods", "G1", "shared", "Shared source", ""],
    ["goods", "G2", "four_k_only", "4K source", ""]
  ], "biff8"), "es-ES");
  const first = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["shared", "Shared source", "Reviewed 3K text"]
  ]));
  const later = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["shared", "Shared source", "Machine 4K text"],
    ["four_k_only", "4K source", "New 4K text"]
  ]));
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ezviz-fill-only-"));
  try {
    const firstPlan = planLanguagePackageUpdates(initial, first, "Spanish", { fillBlankOnly: true });
    const firstFile = path.join(temporaryDirectory, "first.xlsx");
    writeUpdatedLanguagePackage(initial, firstPlan, firstFile);
    const current = readLanguagePackage(firstFile, "es-ES");
    const laterPlan = planLanguagePackageUpdates(current, later, "Spanish", { fillBlankOnly: true });
    assert.deepEqual(laterPlan.updates.map((item) => item.key), ["four_k_only"]);
    assert.deepEqual(laterPlan.preservedExisting.map((item) => item.key), ["shared"]);
    const secondFile = path.join(temporaryDirectory, "second.xlsx");
    writeUpdatedLanguagePackage(current, laterPlan, secondFile);
    const finalPackage = readLanguagePackage(secondFile, "es-ES");
    const snapshot = languagePackageKeySnapshot(finalPackage, ["shared", "four_k_only"]);
    assert.match(snapshot.shared[0], /Reviewed 3K text/);
    assert.match(snapshot.four_k_only[0], /New 4K text/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("ignores formatted blank rows when choosing the append position", () => {
  const workbook = XLSX.read(packageBuffer(), { type: "buffer" });
  workbook.Sheets.Sheet1["!ref"] = "A1:F8";
  const languagePackage = readLanguagePackage(
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    "es-ES"
  );
  assert.equal(languagePackage.sections[0].lastDataRow, 4);
});

test("Global rebase fingerprint ignores only the propagated source cell", () => {
  const packageWith = (source, translation) => readLanguagePackage(workbookBuffer([
    ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"],
    ["goods", "G1", "product_title", source, translation]
  ]), "es-ES");
  const probe = { existingKeys: ["product_title"], newKeys: [] };
  const before = workbookContentFingerprintForGlobalRebase(
    packageWith("Old source", "Anterior"),
    probe
  );
  const propagated = workbookContentFingerprintForGlobalRebase(
    packageWith("New source", "Anterior"),
    probe
  );
  const externallyChanged = workbookContentFingerprintForGlobalRebase(
    packageWith("New source", "Cambio externo"),
    probe
  );
  assert.equal(before, propagated);
  assert.notEqual(before, externallyChanged);
});

test("appends each new field only once when a package has multiple language sheets", () => {
  const workbook = XLSX.utils.book_new();
  const header = ["Category", "Serial", "Single word", "en-US", "es-ES(need translation)"];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    header,
    ["goods", "G1", "existing", "Existing", "Anterior"]
  ]), "Primary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    header,
    ["common", "C1", "shared", "Shared", "Compartido"]
  ]), "Secondary");
  const languagePackage = readLanguagePackage(
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    "es-ES"
  );
  const datasheet = parseLanguageDatasheet(workbookBuffer([
    ["Field", "Source", "Spanish"],
    ["existing", "Existing", "Actualizado"],
    ["new_field", "New source", "Nuevo"]
  ]));
  const plan = planLanguagePackageUpdates(languagePackage, datasheet, "Spanish");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "language-package-multi-"));
  try {
    const outputPath = path.join(temporaryDirectory, "es-ES.xlsx");
    const result = writeUpdatedLanguagePackage(languagePackage, plan, outputPath);
    assert.equal(result.appendedFieldCount, 1);
    const verified = readLanguagePackage(outputPath, "es-ES");
    const occurrences = verified.sections.flatMap((section) => {
      const sheet = verified.workbook.Sheets[section.sheetName];
      const found = [];
      for (let row = section.firstDataRow; row <= section.lastDataRow; row += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: section.keyColumn });
        if (sheet[address]?.v === "new_field") found.push(section.sheetName);
      }
      return found;
    });
    assert.deepEqual(occurrences, ["Primary"]);
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

test("native Global update can synchronize source and translation columns", {
  skip: process.platform !== "win32",
  timeout: 30000
}, () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "language-package-global-"));
  try {
    const inputPath = path.join(temporaryDirectory, "before.xls");
    const outputPath = path.join(temporaryDirectory, "after.xls");
    fs.writeFileSync(inputPath, workbookBuffer([
      ["Category", "Serial", "Single word", "en-US", "need translation"],
      ["goods", "G1", "product_title", "Old source", "Old translation"]
    ], "biff8"));
    const parsed = parseLanguageDatasheet(workbookBuffer([
      ["Field", "Source", "English"],
      ["product_title", "Revised English", "Revised English"]
    ]));
    const languagePackage = readLanguagePackage(inputPath, "en-US");
    const plan = planLanguagePackageUpdates(languagePackage, parsed, "English");
    const result = writeUpdatedLanguagePackageNative(
      inputPath,
      languagePackage,
      parsed,
      plan,
      outputPath,
      { syncSource: true }
    );
    const sheet = readLanguagePackage(outputPath, "en-US").workbook.Sheets.Sheet1;
    assert.equal(result.verifiedCellCount, 2);
    assert.equal(sheet.D2.v, "Revised English");
    assert.equal(sheet.E2.v, "Revised English");
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
