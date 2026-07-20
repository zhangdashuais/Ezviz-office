const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const outputDir = path.resolve(__dirname, "..", "办公软件", "111", "templates");
const outputPath = path.join(outputDir, "TDK配置模板.xlsx");
const headers = ["Url Path", "Title", "Keyword", "Discription"];
const instructions = [
  ["字段", "是否必填", "填写规范"],
  ["Url Path", "是", "国际站相对路径，以 / 开头，例如 /inter/product/example/00000；不要填写域名"],
  ["Title", "是", "对应后台 Title 字段；建议清晰、唯一，并包含核心主题"],
  ["Keyword", "是", "对应后台 Keyword 字段；多个关键词建议使用英文逗号分隔"],
  ["Discription", "是", "对应后台 Discription 字段（沿用后台拼写）；填写页面描述"]
];

const workbook = XLSX.utils.book_new();
const dataSheet = XLSX.utils.aoa_to_sheet([headers]);
dataSheet["!cols"] = [
  { wch: 48 }, { wch: 52 }, { wch: 42 }, { wch: 72 }
];
dataSheet["!autofilter"] = { ref: "A1:D1" };
dataSheet["!freeze"] = { xSplit: 1, ySplit: 1, topLeftCell: "B2", activePane: "bottomRight", state: "frozen" };
const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
instructionSheet["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 88 }];
instructionSheet["!autofilter"] = { ref: `A1:C${instructions.length}` };
XLSX.utils.book_append_sheet(workbook, dataSheet, "TDK配置");
XLSX.utils.book_append_sheet(workbook, instructionSheet, "填写说明");

fs.mkdirSync(outputDir, { recursive: true });
XLSX.writeFile(workbook, outputPath, { compression: true });
console.log(outputPath);
