const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  extractNewProductRows,
  replaceHtmlText,
  isProductNameOnlyText,
  normalizePathDefaults
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
