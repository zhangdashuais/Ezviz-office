const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { writeAuditExcelReport } = require("./excel-report");

test("writes audit summary, product details and issue sheets", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ezviz-audit-"));
  const report = {
    startedAt: "2026-07-15T00:00:00.000Z",
    finishedAt: "2026-07-15T01:00:00.000Z",
    sampleSize: 5,
    issueCount: 1,
    sites: [{
      name: "Indonesia",
      url: "https://www.ezviz.com/id",
      sampledProducts: [{
        category: "Smart Home",
        productName: "RS20 Pro",
        detailUrl: "https://www.ezviz.com/id/product/rs20-pro/65169",
        tagline: "Test",
        expectedLanguage: "id",
        taglineLanguage: { language: "en", confidence: 0.9 },
        issues: [{ type: "product-tagline-language-mismatch" }]
      }]
    }],
    issues: [{ site: "Indonesia", product: "RS20 Pro", detailUrl: "https://www.ezviz.com/id/product/rs20-pro/65169", type: "product-tagline-language-mismatch" }]
  };
  const outputPath = writeAuditExcelReport(report, { outputDir, job: { id: "test-job", status: "completed" } });
  assert.ok(fs.statSync(outputPath).size > 0);
  const workbook = XLSX.readFile(outputPath);
  assert.deepEqual(workbook.SheetNames, ["执行摘要", "产品明细", "问题清单"]);
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets["产品明细"])[0]["产品"], "RS20 Pro");
  fs.rmSync(outputDir, { recursive: true, force: true });
});
