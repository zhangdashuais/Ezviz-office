import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputPath = "E:/Ezviz-office/outputs/019fdb5d-5b62-7a60-a2e8-729a17ba6bcc/Detail临时功能信息模板_已填图片地址.xlsx";
const previewPath = "E:/Ezviz-office/outputs/019fdb5d-5b62-7a60-a2e8-729a17ba6bcc/Detail临时功能信息模板_预览.png";

const input = await FileBlob.load(outputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const table = await workbook.inspect({
  kind: "table",
  sheetId: "Products",
  range: "A1:F66",
  tableMaxRows: 12,
  tableMaxCols: 6,
  tableMaxCellChars: 120,
  maxChars: 6000,
});
console.log(table.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 2000,
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Products",
  range: "A1:F30",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ previewPath }, null, 2));
