const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { canonicalHeader, parseTdkWorkbook, validateTdkRows } = require("./tdk-management");

test("TDK 表头兼容后台拼写和常见 Description 拼写", () => {
  assert.equal(canonicalHeader("Url Path"), "urlPath");
  assert.equal(canonicalHeader("Discription"), "description");
  assert.equal(canonicalHeader("Description"), "description");
  assert.equal(canonicalHeader("Keywords"), "keyword");
});

test("TDK 工作簿解析四个后台字段", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-test-"));
  const filePath = path.join(tempDir, "tdk.xlsx");
  try {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Url Path", "Title", "Keyword", "Discription"],
      ["/inter/test", "Test | EZVIZ", "test, ezviz", "Test description"]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "TDK配置");
    XLSX.writeFile(workbook, filePath);

    const parsed = parseTdkWorkbook(filePath);
    assert.equal(parsed.rows.length, 1);
    assert.deepEqual(parsed.rows[0], {
      rowNumber: 2,
      urlPath: "/inter/test",
      title: "Test | EZVIZ",
      keyword: "test, ezviz",
      description: "Test description"
    });
    assert.deepEqual(validateTdkRows(parsed.rows, parsed.headerIssues), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("TDK 校验缺值、绝对网址和重复路径", () => {
  const issues = validateTdkRows([
    { rowNumber: 2, urlPath: "https://www.ezviz.com/inter/a", title: "A", keyword: "a", description: "" },
    { rowNumber: 3, urlPath: "https://www.ezviz.com/inter/a", title: "B", keyword: "b", description: "B" }
  ]);
  assert.ok(issues.some((issue) => issue.includes("第 2 行缺少 Discription")));
  assert.equal(issues.filter((issue) => issue.includes("相对路径")).length, 2);
  assert.ok(issues.some((issue) => issue.includes("重复")));
});
