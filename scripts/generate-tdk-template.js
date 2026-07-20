const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const outputDir = path.resolve(__dirname, "..", "办公软件", "111", "templates");
const outputPath = path.join(outputDir, "TDK配置模板.xlsx");
const headers = [
  "Record ID", "Site URL", "Site Code", "Language", "Page Type", "Page URL",
  "Product", "Title", "Description", "Keywords", "Action", "Notes"
];
const example = [
  "TDK-0001", "https://www.ezviz.com/id", "id", "id-ID", "Product Detail",
  "https://www.ezviz.com/id/product/example/00000", "Example Product",
  "Example Product | EZVIZ", "Describe the page in the site language.",
  "example product, ezviz", "update", "示例行，正式填写时请删除"
];
const instructions = [
  ["字段", "是否必填", "填写规范"],
  ["Record ID", "是", "每行唯一且长期稳定，例如 TDK-0001"],
  ["Site URL", "是", "站点首页 URL，用于识别目标站点"],
  ["Site Code", "否", "站点代码；未知时可留空，后续优先按 Site URL 识别"],
  ["Language", "是", "页面语言代码，例如 en-US、id-ID、tr-TR"],
  ["Page Type", "是", "建议：Home、Category、Product Detail、Support、Campaign、Other"],
  ["Page URL", "是", "需要配置 TDK 的完整页面 URL"],
  ["Product", "否", "产品页填写产品名，其他页面可留空"],
  ["Title", "是", "页面 Title；建议清晰、唯一，并包含核心主题"],
  ["Description", "是", "页面描述；使用对应站点语言，避免与其他页面重复"],
  ["Keywords", "否", "关键词用英文逗号分隔；后台不需要时可留空"],
  ["Action", "否", "create、update 或 skip；默认按 update 处理"],
  ["Notes", "否", "特殊要求、人工确认事项或错误说明"]
];

const workbook = XLSX.utils.book_new();
const dataSheet = XLSX.utils.aoa_to_sheet([headers, example]);
dataSheet["!cols"] = [
  { wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 48 },
  { wch: 22 }, { wch: 42 }, { wch: 60 }, { wch: 34 }, { wch: 12 }, { wch: 34 }
];
dataSheet["!autofilter"] = { ref: "A1:L2" };
dataSheet["!freeze"] = { xSplit: 1, ySplit: 1, topLeftCell: "B2", activePane: "bottomRight", state: "frozen" };
const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
instructionSheet["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 72 }];
instructionSheet["!autofilter"] = { ref: `A1:C${instructions.length}` };
XLSX.utils.book_append_sheet(workbook, dataSheet, "TDK配置");
XLSX.utils.book_append_sheet(workbook, instructionSheet, "填写说明");

fs.mkdirSync(outputDir, { recursive: true });
XLSX.writeFile(workbook, outputPath, { compression: true });
console.log(outputPath);
