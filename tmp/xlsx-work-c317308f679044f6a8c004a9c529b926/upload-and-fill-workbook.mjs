import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "E:/修订部分/Ezviz Green/Detail临时功能信息模板.xlsx";
const imageRoot = "E:/Ezviz-office/tmp/hd-images-f05e22a318a449f5af5f3b36eb80560c";
const outputDir = "E:/Ezviz-office/outputs/019fdb5d-5b62-7a60-a2e8-729a17ba6bcc";
const outputPath = `${outputDir}/Detail临时功能信息模板_已填图片地址.xlsx`;
const reportPath = `${outputDir}/Detail临时功能信息模板_图片上传匹配报告.json`;
const uploadUrl = "https://fs.ezvizlife.com/upload.php";
const publicPrefix = "https://mfs.ezvizlife.com/";

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

const aliasByKey = new Map([
  [normalizeName("Solar Charging Panel-E"), normalizeName("Solar Panel-E")],
  [normalizeName("Solar Charging Panel-F"), normalizeName("Solar Panel-F")],
  [normalizeName("PSP200"), normalizeName("PSP 200")],
  [normalizeName("HB90x Dual 4G Kit"), normalizeName("HB90 4G Dual Kit")],
  [normalizeName("EP7"), normalizeName("EP7 4K")],
]);

function keysForProduct(productName) {
  const key = normalizeName(productName);
  const keys = [key];
  if (aliasByKey.has(key)) keys.push(aliasByKey.get(key));
  return keys;
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
    .map((entry) => {
      const product = productFromFile(entry.name, kind);
      return {
        fileName: entry.name,
        filePath: path.join(dir, entry.name),
        product,
        key: normalizeName(product),
      };
    });
}

function buildImageMap(images) {
  const map = new Map();
  for (const image of images) {
    if (!map.has(image.key)) map.set(image.key, image);
  }
  return map;
}

function findImage(productName, imageMap) {
  for (const key of keysForProduct(productName)) {
    const image = imageMap.get(key);
    if (image) return image;
  }
  return null;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function uploadImage(image) {
  const bytes = await fs.readFile(image.filePath);
  const form = new FormData();
  form.append("app", "service");
  form.append("flag", "img");
  form.append("quality", "100");
  form.append("ext", "jpg,png,gif");
  form.append("size", "2048");
  form.append("file", new Blob([bytes], { type: contentTypeFor(image.filePath) }), image.fileName);

  const response = await fetch(uploadUrl, { method: "POST", body: form });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Upload returned non-JSON for ${image.fileName}: ${text.slice(0, 200)}`);
  }
  if (!response.ok || !payload.status || !payload.uri) {
    throw new Error(`Upload failed for ${image.fileName}: ${text.slice(0, 300)}`);
  }
  const uri = String(payload.uri).replace(/^https?:\/\/mfs\.ezvizlife\.com\//i, "").replace(/^mfs\.ezvizlife\.com\//i, "");
  return `${publicPrefix}${uri}`;
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Products");
const used = sheet.getUsedRange();
const values = used.values;
const headers = values[0].map((value) => String(value || "").trim());

const productCol = headers.indexOf("Product_Name");
const pcTargetCol = headers.indexOf("New_Address_1");
const mobTargetCol = headers.indexOf("New_Address_2");
if (productCol < 0 || pcTargetCol < 0 || mobTargetCol < 0) {
  throw new Error(`Missing required headers. Found: ${headers.join(", ")}`);
}

const pcImages = await listImages(path.join(imageRoot, "pc端"), "pc");
const mobImages = await listImages(path.join(imageRoot, "Mob端"), "mob");
const pcMap = buildImageMap(pcImages);
const mobMap = buildImageMap(mobImages);

const uploadCache = new Map();
async function cachedUpload(image) {
  const cacheKey = image.filePath;
  if (!uploadCache.has(cacheKey)) {
    uploadCache.set(cacheKey, await uploadImage(image));
  }
  return uploadCache.get(cacheKey);
}

const updates = [];
const unmatched = [];
for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
  const productName = String(values[rowIndex][productCol] || "").replace(/\u00a0/g, " ").trim();
  if (!productName) continue;
  const pcImage = findImage(productName, pcMap);
  const mobImage = findImage(productName, mobMap);
  const rowUpdate = { rowNumber: rowIndex + 1, productName };

  if (pcImage) {
    rowUpdate.pcFile = pcImage.fileName;
    rowUpdate.pcUrl = await cachedUpload(pcImage);
    values[rowIndex][pcTargetCol] = rowUpdate.pcUrl;
  }
  if (mobImage) {
    rowUpdate.mobFile = mobImage.fileName;
    rowUpdate.mobUrl = await cachedUpload(mobImage);
    values[rowIndex][mobTargetCol] = rowUpdate.mobUrl;
  }

  if (pcImage || mobImage) updates.push(rowUpdate);
  else unmatched.push({ rowNumber: rowIndex + 1, productName });

  if ((updates.length + unmatched.length) % 10 === 0) {
    console.log(`processed ${updates.length + unmatched.length}/${values.length - 1}`);
  }
}

sheet.getRangeByIndexes(0, 0, values.length, headers.length).values = values;

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const usedPcKeys = new Set(updates.filter((row) => row.pcFile).map((row) => normalizeName(productFromFile(row.pcFile, "pc"))));
const usedMobKeys = new Set(updates.filter((row) => row.mobFile).map((row) => normalizeName(productFromFile(row.mobFile, "mob"))));
const report = {
  inputPath,
  outputPath,
  uploadedAt: new Date().toISOString(),
  counts: {
    products: values.length - 1,
    pcImages: pcImages.length,
    mobImages: mobImages.length,
    matchedRows: updates.length,
    pcFilled: updates.filter((row) => row.pcUrl).length,
    mobFilled: updates.filter((row) => row.mobUrl).length,
    unmatchedRows: unmatched.length,
  },
  unmatched,
  unusedPcImages: pcImages.filter((image) => !usedPcKeys.has(image.key)).map((image) => image.fileName),
  unusedMobImages: mobImages.filter((image) => !usedMobKeys.has(image.key)).map((image) => image.fileName),
  updates,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ outputPath, reportPath, counts: report.counts }, null, 2));
