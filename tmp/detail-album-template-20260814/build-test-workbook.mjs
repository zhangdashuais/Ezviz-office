import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/zhangtianle7/Documents/HikLink_Files/zhangtianle7/received/Detail临时功能信息模板_已填图片地址_修订后_1.xlsx";
const outputDir = "E:/Ezviz-office/outputs/detail-album-template-20260814";
const outputPath = `${outputDir}/Detail临时功能信息模板_高清图路径或网址测试.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem("Products");
const sourceRows = sheet.getRange("A2:F51").values;
const sourceByProduct = new Map(sourceRows.map((row) => [String(row[0] || "").trim(), row]));
const imageDir = "C:\\Users\\zhangtianle7\\Desktop\\素材更正";
const products = [
  ["EP3x Pro", `${imageDir}\\EP3x Pro_高清图.jpg`],
  ["EP7", `${imageDir}\\EP7_高清图.jpg`],
  ["HP7", `${imageDir}\\HP7.jpg`],
  ["RS20 max", `${imageDir}\\RS20 max.jpg`],
  ["RS20 pro", `${imageDir}\\RS20 pro.jpg`],
];
const headers = [
  "Product_Name",
  "Old_Address_1",
  "New_Address_1",
  "Old_Address_2",
  "New_Address_2",
  "Delete_Code_Block",
  "Product_Album_Image",
];
const rows = products.map(([productName, imagePath]) => [
  ...(sourceByProduct.get(productName) || [productName, "", "", "", "", ""]),
  imagePath,
]);

sheet.getRange("A1:G51").clear({ applyTo: "contents" });
sheet.getRange("A1:G6").values = [headers, ...rows];
sheet.getRange("A1:G1").format = {
  fill: "#E8F1FB",
  font: { bold: true, color: "#1F2937" },
  borders: { preset: "outside", style: "thin", color: "#AAB7C4" },
};
sheet.getRange("A2:G6").format.borders = {
  insideHorizontal: { style: "thin", color: "#E5E7EB" },
};
sheet.getRange("A1:G6").format.verticalAlignment = "center";
sheet.getRange("A1:G6").format.wrapText = false;
sheet.getRange("A1:A6").format.columnWidth = 24;
sheet.getRange("B1:E6").format.columnWidth = 44;
sheet.getRange("F1:F6").format.columnWidth = 30;
sheet.getRange("G1:G6").format.columnWidth = 62;
sheet.freezePanes.freezeRows(1);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: "Products",
  range: "A1:G6",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/Detail临时功能信息模板_高清图路径或网址测试.png`, new Uint8Array(await preview.arrayBuffer()));

console.log((await workbook.inspect({
  kind: "table",
  range: "Products!A1:G6",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 10,
})).ndjson);
console.log((await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
})).ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
