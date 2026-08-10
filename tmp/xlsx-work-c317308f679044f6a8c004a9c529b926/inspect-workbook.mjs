import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "E:/修订部分/Ezviz Green/Detail临时功能信息模板.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 8000,
  tableMaxRows: 8,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});
console.log(overview.ndjson);
