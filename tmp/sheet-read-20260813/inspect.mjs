import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "E:/修订部分/Ezviz Green/Detail临时功能信息模板_已填图片地址.xlsx";
const outputPath = "E:/Ezviz-office/outputs/green-detail-images/Detail临时功能信息模板_已填图片地址_修订后.xlsx";
const uploads = JSON.parse((await fs.readFile("E:/Ezviz-office/tmp/green-image-uploads-20260813.json", "utf8")).replace(/^\uFEFF/, ""));
const url = Object.fromEntries(uploads.map((item) => [item.Name, item.Url]));
const replacements = {
  "CB90 Dual Kit": [url["CB90_DUAL_Kit_PC_1200x600.jpg"], url["CB90_DUAL_Kit_Mob_750x1000.jpg"]],
  "HB90 Dual Kit": [url["HB90_Dual_Kit_PC_1200x600.jpg"], url["HB90_DUAL_Kit_Mob_750x1000.jpg"]],
  "HB90x Dual 4G Kit": [url["HB90x_no_icons_1200x600.jpg"], url["HB90X_MOB_750x1000_HQ.jpg"]],
  "CB90x Dual 4G Kit": [url["CB90x_no_icons_1200x600.jpg"], url["CB90X_MOB_750x1000_HQ.jpg"]],
  "EP7": [url["EP7_PC_1200x600_HQ.jpg"], url["EP7_MOB_750x1000_HQ.jpg"]],
  "RS20 Max": [url["RS20MAX_1200x600_HQ.jpg"], url["RS20MAX_MOB_750x1000_HQ.jpg"]],
  "EZVIZ 400W Solar Starter Kit": [url["400W_PC_1200x600_HQ.jpg"], url["400W_MOB_750x1000_HQ.jpg"]]
};

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem("Products");
const values = sheet.getRange("A1:F51").values;
let changed = 0;
for (let row = 1; row < values.length; row += 1) {
  const name = String(values[row][0] || "").trim();
  if (!replacements[name]) continue;
  sheet.getRange(`C${row + 1}`).values = [[replacements[name][0]]];
  sheet.getRange(`E${row + 1}`).values = [[replacements[name][1]]];
  changed += 1;
}
if (changed !== 7) throw new Error(`Expected 7 matched products, got ${changed}`);

await fs.mkdir("E:/Ezviz-office/outputs/green-detail-images", { recursive: true });
await (await SpreadsheetFile.exportXlsx(workbook)).save(outputPath);
const preview = await workbook.render({ sheetName: "Products", range: "A20:F51", scale: 1.25, format: "png" });
await fs.writeFile("updated-preview.png", new Uint8Array(await preview.arrayBuffer()));
console.log((await workbook.inspect({
  kind: "match",
  searchTerm: "mall/static/20260813",
  options: { maxResults: 30 },
  maxChars: 10000
})).ndjson);
console.log((await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 3000
})).ndjson);
