const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");
const {
  generateLocalI18nDatasheet,
  extractNewProductRows,
  replaceHtmlText,
  isProductNameOnlyText,
  normalizePathDefaults,
  findProductWorkbook,
  initializeProductData,
  parseGlobalPackage,
  buildWorkbook,
  workbookProductName,
  generateTextTranslationWorkbook
} = require("./local-i18n-datasheet");

test("puts new product copy above the separator and reuses old product copy below it", () => {
  const productData = {
    headers: ["English"],
    rows: new Map([["ty1_g1_2k_1", {
      key: "TY1_G1_2K_1",
      values: { English: "Reusable old product copy" }
    }]])
  };
  const result = extractNewProductRows(
    "<p>Brand-new 3K product copy</p><p>Reusable old product copy</p>",
    "TY1 G1 3K",
    "ty1_g1_3k",
    productData,
    new Map()
  );

  assert.deepEqual(result.newRows, [{ key: "TY1_G1_3K_1", source: "Brand-new 3K product copy" }]);
  assert.deepEqual(result.reusedRows, [{ key: "TY1_G1_2K_1", source: "Reusable old product copy" }]);
  assert.equal(result.replacements.length, 2);
  assert.equal(
    replaceHtmlText("<p>Brand-new 3K product copy</p><p>Reusable old product copy</p>", result.replacements),
    "<p>{{t(&#39;goods.TY1_G1_3K_1&#39;)}}</p><p>{{t(&#39;goods.TY1_G1_2K_1&#39;)}}</p>"
  );
});

test("does not reuse copy found only in the total package or previous output", () => {
  const productData = {
    headers: ["English"],
    rows: new Map([["old_output_1", {
      key: "OLD_OUTPUT_1",
      values: { English: "Copy from a previous generated workbook" }
    }]])
  };
  const result = extractNewProductRows(
    "<p>Copy from a previous generated workbook</p><p>Copy found only in total package</p>",
    "HB9c Dual 3K+ 4G Kit",
    "hb9c_dual_3k_4g_kit",
    productData,
    new Map([["other_1", { key: "OTHER_1", source: "Copy found only in total package" }]]),
    new Map()
  );
  assert.deepEqual(result.newRows.map((row) => row.source), [
    "Copy from a previous generated workbook",
    "Copy found only in total package"
  ]);
  assert.deepEqual(result.reusedRows, []);
  assert.deepEqual(result.newRows.map((row) => row.key), [
    "HB9C_DUAL_3K_4G_KIT_1",
    "HB9C_DUAL_3K_4G_KIT_2"
  ]);
});

test("keeps the product name and its leading name segments as plain text", () => {
  assert.equal(isProductNameOnlyText("TY1", "TY1 G1 3K"), true);
  assert.equal(isProductNameOnlyText("TY1 G1", "TY1 G1 3K"), true);
  assert.equal(isProductNameOnlyText("TY1 G1 (3K)", "TY1 G1 3K"), true);
  assert.equal(isProductNameOnlyText("New TY1 camera experience", "TY1 G1 3K"), false);

  const result = extractNewProductRows(
    "<h1>TY1 G1 3K</h1><p>TY1 G1</p><b>TY1</b><p>New TY1 camera experience</p>",
    "TY1 G1 3K",
    "ty1_g1_3k",
    { headers: ["English"], rows: new Map() },
    new Map()
  );
  assert.deepEqual(result.newRows, [{ key: "TY1_G1_3K_1", source: "New TY1 camera experience" }]);
  assert.equal(result.replacements.length, 1);
});

test("converts text whose quotation mark is encoded as an HTML entity", () => {
  const html = '<p>1/2.7&quot; Progressive Scan CMOS</p>';
  const result = extractNewProductRows(
    html,
    "TY1 G1 3K",
    "ty1_g1_3k",
    { headers: ["English"], rows: new Map() },
    new Map()
  );
  assert.deepEqual(result.newRows, [{
    key: "TY1_G1_3K_1",
    source: '1/2.7" Progressive Scan CMOS'
  }]);
  assert.equal(
    replaceHtmlText(html, result.replacements),
    "<p>{{t(&#39;goods.TY1_G1_3K_1&#39;)}}</p>"
  );
});

test("skips standalone numbers and keeps numbers inside complete copy", () => {
  const html = "<strong>30</strong><p>Up to 30 days of battery life</p><span>30 m</span>";
  const result = extractNewProductRows(
    html,
    "TY1 G1 3K",
    "ty1_g1_3k",
    { headers: ["English"], rows: new Map() },
    new Map()
  );
  assert.deepEqual(result.newRows, [
    { key: "TY1_G1_3K_1", source: "Up to 30 days of battery life" }
  ]);
  assert.equal(
    replaceHtmlText(html, result.replacements),
    "<strong>30</strong><p>{{t(&#39;goods.TY1_G1_3K_1&#39;)}}</p><span>30 m</span>"
  );
});

test("accepts absolute custom paths and rejects relative paths", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "local-i18n-paths-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const htmlFile = path.join(folder, "product.html");
  const outputFile = path.join(folder, "final.xlsx");
  fs.writeFileSync(htmlFile, "<p>Product copy</p>");
  assert.deepEqual(normalizePathDefaults({ htmlFile, outputDir: folder, outputFile }), { htmlFile, outputDir: folder, outputFile });
  assert.throws(() => normalizePathDefaults({ htmlFile: "product.html" }), /绝对路径/);
  assert.throws(() => normalizePathDefaults({ outputFile: path.join(folder, "final.xls") }), /\.xlsx/);
});

test("missing product workbook keeps i18n conversion without reference rows", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-i18n-product-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "CB30 Dual Kit"));
  const templateFile = path.join(root, "template.xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["", "English", "French"],
    ["OLD_PRODUCT_1", "Old product copy", "Ancien texte"]
  ]), "Datasheet");
  XLSX.writeFile(workbook, templateFile);

  const productFile = findProductWorkbook("CB30 Dual Kit", root);
  const productData = initializeProductData(productFile, templateFile);
  assert.equal(productFile, "");
  assert.deepEqual(productData.headers, ["English", "French"]);
  assert.equal(productData.rows.size, 0);
});

test("uses the reference workbook product name in the review note", (t) => {
  const templateFile = path.join(os.tmpdir(), `local-i18n-reference-note-${process.pid}.xlsx`);
  t.after(() => fs.rmSync(templateFile, { force: true }));
  const template = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(template, XLSX.utils.aoa_to_sheet([
    ["", "English"],
    ["", ""]
  ]), "Datasheet");
  XLSX.writeFile(template, templateFile);
  const referenceProductName = workbookProductName(
    "D:\\产品\\HB90f Triple Kit\\CB90f Triple Kit datasheet.xlsx",
    "HB90f Triple Kit"
  );
  const { workbook } = buildWorkbook({
    productName: "HB90f Triple Kit",
    referenceProductName,
    productData: { headers: ["English"], rows: new Map() },
    globalEntries: new Map(),
    htmlKeys: [
      { key: "list", source: "List" },
      { key: "CB90F_TRIPLE_KIT_1", source: "Reference copy" }
    ],
    newProductRows: [],
    templateFile
  });

  assert.equal(
    workbook.Sheets.Datasheet.A2.v,
    "If you have proofread CB90f Triple Kit then no need to review the following strings."
  );
  assert.equal(workbook.Sheets.Datasheet.A3.v, "CB90F_TRIPLE_KIT_1");
  assert.equal(workbook.Sheets.Datasheet.A4, undefined);
});

test("copies the first-row format from the header reference workbook", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "local-i18n-header-style-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const templateFile = path.join(folder, "template.xlsx");
  const headerFile = path.join(folder, "header.xlsx");
  const outputFile = path.join(folder, "output.xlsx");
  const fixtureResult = childProcess.spawnSync(process.env.PYTHON || "python", ["-c", [
    "from openpyxl import Workbook",
    "from openpyxl.styles import PatternFill",
    `files = [(r'${templateFile}', 'FF0000', 20), (r'${headerFile}', '123456', 36), (r'${outputFile}', '00FF00', 24)]`,
    "for file, color, height in files:",
    "    book = Workbook()",
    "    sheet = book.active",
    "    sheet.title = 'Datasheet'",
    "    sheet.append(['', 'English'])",
    "    sheet.append(['KEY', 'Copy'])",
    "    sheet['B1'].fill = PatternFill(fill_type='solid', fgColor=color)",
    "    sheet.row_dimensions[1].height = height",
    "    book.save(file)"
  ].join("\n")], { encoding: "utf8" });
  assert.equal(fixtureResult.status, 0, fixtureResult.stderr);

  const result = childProcess.spawnSync(
    process.env.PYTHON || "python",
    [path.join(__dirname, "local-i18n-datasheet-style.py"), templateFile, outputFile, headerFile],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const styledSheet = XLSX.readFile(outputFile, { cellStyles: true }).Sheets.Datasheet;
  assert.equal(styledSheet.B1.s.fgColor.rgb, "123456");
  assert.equal(styledSheet["!rows"][0].hpt, 36);
});

test("generates the text-translation workbook with the reference header and no list row", (t) => {
  const result = generateTextTranslationWorkbook({
    prefix: "HB90f Triple Kit",
    generatedRows: [{ key: "HB90F_1", value: "New copy" }],
    alignedRows: [{ key: "goods.list", value: "List" }, { key: "CB90F_1", value: "Reference copy" }],
    existingRows: [{ key: "list", value: "List", matched: true }]
  });
  t.after(() => fs.rmSync(result.outputDir, { recursive: true, force: true }));
  const workbook = XLSX.readFile(result.outputFile, { cellStyles: true });
  const generatedSheet = workbook.Sheets["新语言包字段"];
  const alignedSheet = workbook.Sheets["产品包复用字段"];

  assert.equal(generatedSheet.A1.s.fgColor.theme, 0);
  assert.equal(generatedSheet.A1.s.fgColor.tint, -0.3499862666707358);
  assert.equal(generatedSheet["!rows"][0].hpt, 36);
  assert.deepEqual(XLSX.utils.sheet_to_json(alignedSheet, { header: 1 }), [
    ["字段名", "单产品语言包英文原文"],
    ["CB90F_1", "Reference copy"]
  ]);
  assert.equal(workbook.Sheets["已有字段原文"], undefined);
});

test("generates a styled local Datasheet end to end without the list row", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "local-i18n-end-to-end-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const htmlFile = path.join(folder, "HB90f Triple Kit.html");
  const productFile = path.join(folder, "CB90f Triple Kit datasheet.xlsx");
  const globalFile = path.join(folder, "en-US.xlsx");
  const templateFile = path.join(folder, "template.xlsx");
  const outputFile = path.join(folder, "HB90f Triple Kit datasheet.xlsx");
  fs.writeFileSync(htmlFile, "<p>New security copy</p><p>Copy in total package only</p><p>{{t('goods.list')}}</p><p>{{t('goods.CB90F_1')}}</p><p>{{t('goods.HB90F_TRIPLE_KIT_99')}}</p><p>{{t('goods.FOREIGN_1')}}</p>");

  const writeSheet = (file, rows, name = "Datasheet") => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    XLSX.writeFile(workbook, file);
  };
  writeSheet(productFile, [["", "English", "French"], ["CB90F_1", "Reference copy", "Texte validé"]]);
  writeSheet(templateFile, [["", "English", "French"], ["", "", ""]]);
  writeSheet(outputFile, [["", "English", "French"], ["HB90F_TRIPLE_KIT_99", "Current product source", "Current product translation"], ["FOREIGN_1", "Old output source", "Incorrect old translation"]]);
  writeSheet(globalFile, [
    ["Category (cannot be modified)", "Serial number (cannot be modified)", "Single word (cannot be modified)", "en-US(cannot be modified)", "en-US(need translation)"],
    ["goods", "1", "list", "List", ""],
    ["goods", "2", "CB90F_1", "Reference copy", ""],
    ["goods", "3", "OTHER_1", "Copy in total package only", ""],
    ["goods", "4", "FOREIGN_1", "Foreign source in total package only", ""]
  ], "Sheet1");

  generateLocalI18nDatasheet({
    productName: "HB90f Triple Kit",
    htmlFile,
    productFile,
    globalFile,
    templateFile,
    outputFile
  });
  const workbook = XLSX.readFile(outputFile, { cellStyles: true });
  const sheet = workbook.Sheets.Datasheet;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  assert.equal(sheet.B1.s.fgColor.theme, 0);
  assert.equal(sheet["!rows"][0].hpt, 36);
  assert.equal(rows.some((row) => String(row[0]).toLowerCase() === "list"), false);
  assert.equal(rows.some((row) => row[0] === "If you have proofread CB90f Triple Kit then no need to review the following strings."), true);
  const separator = rows.findIndex((row) => String(row[0]).startsWith("If you have proofread"));
  assert.equal(rows.slice(1, separator).some((row) => row[1] === "Copy in total package only"), true);
  assert.equal(rows.slice(1, separator).some((row) => row[0] === "HB90F_TRIPLE_KIT_99" && row[2] === "Current product translation"), true);
  const rekeyed = rows.slice(1, separator).find((row) => row[1] === "Old output source");
  assert.match(rekeyed[0], /^HB90F_TRIPLE_KIT_\d+$/);
  assert.equal(rekeyed[2], "");
  assert.equal(fs.readFileSync(htmlFile, "utf8").includes("goods.FOREIGN_1"), false);
  assert.equal(fs.readFileSync(htmlFile, "utf8").includes(`goods.${rekeyed[0]}`), true);
  assert.equal(rows.slice(separator + 1).some((row) => row[0] === "CB90F_1" && row[2] === "Texte validé"), true);
});

test("uses the immutable en-US column as the total-package source", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "local-i18n-global-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const globalFile = path.join(folder, "en-US.xls");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Category (cannot be modified)", "Serial number (cannot be modified)", "Single word (cannot be modified)", "en-US(cannot be modified)", "en-US(need translation)"],
    ["goods", "G1", "CB90_1", "Original copy from total package", "{{t('goods.CB90_1')}}"]
  ]), "Sheet1");
  XLSX.writeFile(workbook, globalFile);

  assert.deepEqual(parseGlobalPackage(globalFile).get("cb90_1"), {
    key: "CB90_1",
    source: "Original copy from total package"
  });
});

test("total-package source overrides a token stored in the single-product workbook", () => {
  const template = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(template, XLSX.utils.aoa_to_sheet([
    ["", "English"],
    ["", ""]
  ]), "Datasheet");
  const templateFile = path.join(os.tmpdir(), `local-i18n-template-${process.pid}.xlsx`);
  XLSX.writeFile(template, templateFile);
  try {
    const { workbook } = buildWorkbook({
      productName: "CB90",
      productKey: "cb90",
      productData: {
        headers: ["English"],
        rows: new Map([["cb90_1", {
          key: "CB90_1",
          values: { English: "{{t('goods.CB90_1')}}" }
        }]])
      },
      globalEntries: new Map([["cb90_1", {
        key: "CB90_1",
        source: "Original copy from total package"
      }]]),
      htmlKeys: [],
      newProductRows: [{ key: "CB90_1", source: "{{t('goods.CB90_1')}}" }],
      templateFile
    });
    assert.equal(workbook.Sheets.Datasheet.B2.v, "Original copy from total package");
  } finally {
    fs.rmSync(templateFile, { force: true });
  }
});
