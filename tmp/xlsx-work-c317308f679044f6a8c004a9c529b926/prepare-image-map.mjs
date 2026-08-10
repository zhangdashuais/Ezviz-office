import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "E:/修订部分/Ezviz Green/Detail临时功能信息模板.xlsx";
const imageRoot = "E:/Ezviz-office/tmp/hd-images-f05e22a318a449f5af5f3b36eb80560c";
const outputPath = "E:/Ezviz-office/tmp/xlsx-work-c317308f679044f6a8c004a9c529b926/image-match-preview.json";

function normalizeName(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s*\(AOV Version\)\s*/gi, " ")
    .replace(/\bPC\b/gi, " ")
    .replace(/\bMOB\b/gi, " ")
    .replace(/\bMO\b/gi, " ")
    .replace(/\bbanner\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function productFromFile(fileName, kind) {
  let base = path.basename(fileName, path.extname(fileName));
  if (kind === "pc") {
    base = base
      .replace(/[_\s-]*pc[_\s-]*banner$/i, "")
      .replace(/[_\s-]*pc$/i, "")
      .replace(/\s+PC$/i, "");
  } else {
    base = base
      .replace(/[_\s-]*mo[_\s-]*banner$/i, "")
      .replace(/[_\s-]*mob[_\s-]*banner$/i, "")
      .replace(/[_\s-]*mob$/i, "")
      .replace(/\s+mo$/i, "");
  }
  return base.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

async function listImages(dir, kind) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(jpg|jpeg|png|gif)$/i.test(entry.name))
    .map((entry) => ({
      fileName: entry.name,
      filePath: path.join(dir, entry.name),
      product: productFromFile(entry.name, kind),
      key: normalizeName(productFromFile(entry.name, kind)),
    }));
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Products");
const values = sheet.getUsedRange().values;
const headers = values[0].map((value) => String(value || "").trim());
const productCol = headers.indexOf("Product_Name");
const products = values.slice(1).map((row, index) => ({
  rowNumber: index + 2,
  productName: String(row[productCol] || "").replace(/\u00a0/g, " ").trim(),
  key: normalizeName(row[productCol]),
}));

const pcImages = await listImages(path.join(imageRoot, "pc端"), "pc");
const mobImages = await listImages(path.join(imageRoot, "Mob端"), "mob");
const pcByKey = new Map(pcImages.map((item) => [item.key, item]));
const mobByKey = new Map(mobImages.map((item) => [item.key, item]));

const rows = products.map((product) => ({
  ...product,
  pc: pcByKey.get(product.key) || null,
  mob: mobByKey.get(product.key) || null,
}));

const result = {
  headers,
  counts: {
    products: products.length,
    pcImages: pcImages.length,
    mobImages: mobImages.length,
    pcMatched: rows.filter((row) => row.pc).length,
    mobMatched: rows.filter((row) => row.mob).length,
  },
  unmatchedProducts: rows
    .filter((row) => !row.pc && !row.mob)
    .map((row) => ({ rowNumber: row.rowNumber, productName: row.productName })),
  pcOnly: rows.filter((row) => row.pc && !row.mob).map((row) => row.productName),
  mobOnly: rows.filter((row) => !row.pc && row.mob).map((row) => row.productName),
  unusedPcImages: pcImages
    .filter((image) => !products.some((product) => product.key === image.key))
    .map((image) => image.fileName),
  unusedMobImages: mobImages
    .filter((image) => !products.some((product) => product.key === image.key))
    .map((image) => image.fileName),
  rows,
};

await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result.counts, null, 2));
console.log(JSON.stringify({
  pcOnly: result.pcOnly,
  mobOnly: result.mobOnly,
  unusedPcImages: result.unusedPcImages,
  unusedMobImages: result.unusedMobImages,
}, null, 2));
