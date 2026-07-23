const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const {
  canonicalHeader,
  parseTdkWorkbook,
  validateTdkRows,
  validateTdkSitePaths,
  createTdkManagement
} = require("./tdk-management");

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

test("TDK 校验 Url Path 属于所选国家站点", () => {
  const site = { name: "France", siteCode: "fr", url: "https://www.ezviz.com/fr" };
  assert.deepEqual(validateTdkSitePaths([
    { rowNumber: 2, urlPath: "/fr/product/camera/1" }
  ], site), []);
  assert.match(validateTdkSitePaths([
    { rowNumber: 3, urlPath: "/inter/product/camera/1" }
  ], site)[0], /不属于所选站点 France/);
});

test("TDK 清单包含页面选择的国家站点", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-site-test-"));
  const filePath = path.join(tempDir, "tdk.xlsx");
  const site = { name: "France", siteCode: "fr", url: "https://www.ezviz.com/fr" };
  try {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Url Path", "Title", "Keyword", "Discription"],
      ["/fr/product/camera/1", "Caméra | EZVIZ", "caméra", "Description"]
    ]), "TDK配置");
    XLSX.writeFile(workbook, filePath);
    const management = createTdkManagement({
      fs,
      readCampaignConfig: () => ({ sites: [site] }),
      requireSingleCampaignSite: (config, body) => {
        assert.deepEqual(JSON.parse(body.sites), ["fr"]);
        return config.sites[0];
      }
    });
    const plan = management.buildPlan({ sites: JSON.stringify(["fr"]) }, {
      tdkExcel: [{ path: filePath, originalname: "tdk.xlsx" }]
    });
    assert.equal(plan.site.siteCode, "fr");
    assert.deepEqual(plan.issues, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
