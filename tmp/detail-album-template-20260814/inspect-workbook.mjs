import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "E:/Ezviz-office/outputs/detail-album-template-20260814/Detail临时功能信息模板_高清图路径或网址测试.xlsx";
const outputDir = "E:/Ezviz-office/tmp/detail-album-template-20260814";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const products = workbook.worksheets.getItem("Products");

console.log((await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 10000,
  tableMaxRows: 30,
  tableMaxCols: 15,
  tableMaxCellChars: 200,
})).ndjson);
console.log(JSON.stringify(products.getRange("A1:G10").values));
console.log(JSON.stringify(products.tables.items.map((table) => ({ name: table.name, style: table.style }))));

for (const sheet of workbook.worksheets.items) {
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(
    `${outputDir}/${sheet.name.replace(/[^a-z0-9_-]/gi, "_") || "sheet"}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}
