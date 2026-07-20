const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

function safeCell(value) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function issueDetails(issue) {
  const ignored = new Set(["site", "product", "detailUrl", "type"]);
  const details = {};
  Object.entries(issue || {}).forEach(([key, value]) => {
    if (!ignored.has(key)) details[key] = value;
  });
  return safeCell(details);
}

function reportRows(report, job = {}) {
  const summary = [
    ["字段", "内容"],
    ["任务 ID", job.id || ""],
    ["状态", job.status || "completed"],
    ["开始时间", report.startedAt || job.startedAt || ""],
    ["结束时间", report.finishedAt || job.finishedAt || ""],
    ["每站抽样产品数", report.sampleSize || job.sampleSize || ""],
    ["巡查站点数", (report.sites || []).length],
    ["问题总数", report.issueCount || 0]
  ];

  const products = [[
    "站点", "站点 URL", "分类", "产品", "产品 URL", "标语", "预期语言", "检测语言", "语言置信度", "问题数", "问题类型"
  ]];
  for (const site of report.sites || []) {
    for (const product of site.sampledProducts || []) {
      products.push([
        site.name, site.url, product.category, product.productName, product.detailUrl, product.tagline,
        product.expectedLanguage, product.taglineLanguage?.language, product.taglineLanguage?.confidence,
        (product.issues || []).length, (product.issues || []).map((issue) => issue.type).join(", ")
      ].map(safeCell));
    }
  }

  const issues = [["站点", "产品", "产品 URL", "问题类型", "问题详情"]];
  for (const issue of report.issues || []) {
    issues.push([
      safeCell(issue.site), safeCell(issue.product), safeCell(issue.detailUrl), safeCell(issue.type), issueDetails(issue)
    ]);
  }
  if (issues.length === 1) issues.push(["", "", "", "无问题", "本次巡查未发现问题"]);
  return { summary, products, issues };
}

function setSheetLayout(sheet, widths) {
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
}

function timestamp(value = new Date()) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function writeAuditExcelReport(report, options = {}) {
  const outputDir = options.outputDir || path.resolve("outputs", "ezviz-site-audit");
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = options.filename || `ezviz-site-audit-${timestamp(report.finishedAt || new Date())}.xlsx`;
  const outputPath = path.join(outputDir, filename);
  const rows = reportRows(report, options.job);
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(rows.summary);
  const productSheet = XLSX.utils.aoa_to_sheet(rows.products);
  const issueSheet = XLSX.utils.aoa_to_sheet(rows.issues);
  setSheetLayout(summarySheet, [22, 60]);
  setSheetLayout(productSheet, [22, 34, 22, 28, 55, 55, 14, 14, 14, 10, 42]);
  setSheetLayout(issueSheet, [22, 28, 55, 38, 90]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "执行摘要");
  XLSX.utils.book_append_sheet(workbook, productSheet, "产品明细");
  XLSX.utils.book_append_sheet(workbook, issueSheet, "问题清单");
  XLSX.writeFile(workbook, outputPath, { compression: true });
  return outputPath;
}

module.exports = { safeCell, reportRows, writeAuditExcelReport };
