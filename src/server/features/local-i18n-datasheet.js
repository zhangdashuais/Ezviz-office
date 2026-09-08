const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const XLSX = require("xlsx");

const HTML_ROOT = "D:\\代码存放\\产品代码\\ezviz";
const PRODUCT_ROOT = "D:\\产品";
const DOWNLOADS_ROOT = "C:\\Users\\zhangtianle7\\Downloads";
const TEMPLATE_PATH = "D:\\产品\\HB90 Dual 3K Kit\\upload\\HB90 Dual 3K Kit datasheet.xlsx";
const YELLOW = "FFFF00";

function text(value) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function copy(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function cell(sheet, row, column) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })];
}

function value(sheet, row, column) {
  return text(cell(sheet, row, column)?.v);
}

function latestGlobalPackage() {
  const files = fs.readdirSync(DOWNLOADS_ROOT, { withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => {
      const match = item.name.match(/^en-US\s*\((\d+)\)\.xlsx?$/i);
      return match ? { path: path.join(DOWNLOADS_ROOT, item.name), version: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.version - a.version || fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);
  if (!files.length) throw new Error(`未在 ${DOWNLOADS_ROOT} 找到 en-US (数字).xls/xlsx 总语言包。`);
  return files[0].path;
}

function findHtml(productName) {
  const wanted = token(productName);
  const files = [];
  const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).forEach((item) => {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) return walk(full);
    if (/\.html?$/i.test(item.name)) files.push(full);
  });
  walk(HTML_ROOT);
  const candidates = files
    .map((file) => ({ path: file, name: path.basename(file), key: token(path.basename(file, path.extname(file))) }))
    .filter((item) => item.key === wanted || item.key.includes(wanted) || wanted.includes(item.key))
    .sort((a, b) => (a.key === wanted ? -1 : 0) - (b.key === wanted ? -1 : 0) || a.name.localeCompare(b.name));
  if (!candidates.length) throw new Error(`未在 ${HTML_ROOT} 找到与“${productName}”同名的 HTML 文件。`);
  return candidates[0].path;
}

function findProductWorkbook(productName) {
  const root = path.join(PRODUCT_ROOT, productName);
  if (!fs.existsSync(root)) throw new Error(`未找到单产品文件夹：${root}`);
  const files = [];
  const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (/\.xlsx?$/i.test(entry.name) && !/^~\$/.test(entry.name)) files.push(full);
  });
  walk(root);
  const wanted = token(productName);
  const outputName = `${productName} datasheet.xlsx`.toLowerCase();
  const ranked = files.filter((file) => path.basename(file).toLowerCase() !== outputName).map((file) => {
    const name = path.basename(file, path.extname(file));
    const key = token(name);
    return {
      file,
      score: (/(^|_)datasheet($|_)/i.test(key) ? 100 : 0)
        + (key.includes(wanted) ? 20 : 0)
        + fs.statSync(file).mtimeMs / 1e15
    };
  }).sort((a, b) => b.score - a.score);
  if (!ranked.length) throw new Error(`未在 ${root} 找到单产品 Excel 文件。`);
  return ranked[0].file;
}

function parseGlobalPackage(file) {
  const workbook = XLSX.readFile(file, { cellText: true });
  const entries = new Map();
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    let keyColumn = -1;
    let englishColumn = -1;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = value(sheet, range.s.r, column).toLowerCase();
      if (/single\s*word/.test(header)) keyColumn = column;
      if (/^en-us\b/.test(header) && /cannot be modified|need translation/.test(header)) {
        if (englishColumn < 0 || /need translation/.test(header)) englishColumn = column;
      }
    }
    if (keyColumn < 0 || englishColumn < 0) return;
    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const key = value(sheet, row, keyColumn);
      if (key) entries.set(key.toLowerCase(), { key, source: value(sheet, row, englishColumn) });
    }
  });
  if (!entries.size) throw new Error("总语言包中未识别到 Single word 和 en-US 列。");
  return entries;
}

function parseProductDatasheet(file) {
  const workbook = XLSX.readFile(file, { cellStyles: true, cellText: true });
  const sheetName = workbook.SheetNames.find((name) => /datasheet/i.test(name)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.["!ref"]) throw new Error("单产品 Excel 没有可读取的工作表。");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headers = [];
  for (let column = range.s.c + 1; column <= range.e.c; column += 1) {
    const header = value(sheet, range.s.r, column);
    if (header) headers.push({ header, column });
  }
  if (!headers.length) throw new Error("单产品 Excel 未识别到 Datasheet 语种列。");
  const rows = new Map();
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const key = value(sheet, row, range.s.c);
    if (!key) continue;
    rows.set(key.toLowerCase(), {
      key,
      values: Object.fromEntries(headers.map(({ header, column }) => [header, value(sheet, row, column)]))
    });
  }
  return { headers: headers.map((item) => item.header), rows };
}

function extractHtmlKeys(html, globalEntries) {
  const candidates = new Set();
  const quoted = /["'`]([a-z][a-z0-9_]{2,})["'`]/gi;
  let match;
  while ((match = quoted.exec(html))) candidates.add(match[1].toLowerCase());
  const dotted = /\bgoods\.([a-z][a-z0-9_]{2,})\b/gi;
  while ((match = dotted.exec(html))) candidates.add(match[1].toLowerCase());
  return [...candidates].map((key) => globalEntries.get(key)).filter(Boolean);
}

function buildWorkbook({ productName, productKey, productData, globalEntries, htmlKeys }) {
  const template = XLSX.readFile(TEMPLATE_PATH, { cellStyles: true });
  const templateSheet = template.Sheets[template.SheetNames.find((name) => /datasheet/i.test(name)) || template.SheetNames[0]];
  const headers = productData.headers;
  const directRows = [...globalEntries.values()].filter((entry) => entry.key.toLowerCase().startsWith(productKey));
  // Product pages sometimes reuse an earlier resolution's fields, e.g. a 3K
  // page still references TY1_G1_2K_*. Treat that as the same product family.
  const familyKey = productKey.replace(/_(?:\d+k|\d+mp)$/i, "");
  const productFieldKey = directRows.length ? productKey : familyKey;
  const productRows = directRows.length ? directRows : [...globalEntries.values()]
    .filter((entry) => entry.key.toLowerCase().startsWith(productFieldKey));
  const seen = new Set(productRows.map((entry) => entry.key.toLowerCase()));
  const foreignRows = htmlKeys.filter((entry) => !entry.key.toLowerCase().startsWith(productFieldKey) && !seen.has(entry.key.toLowerCase()));
  const outputRows = [...productRows, ...foreignRows];
  if (!productRows.length && !foreignRows.length) throw new Error("未在总语言包或 HTML 中识别到可生成的 i18n 字段。");

  const sheet = {};
  headers.forEach((header, index) => {
    const sourceCell = cell(templateSheet, 0, index + 1);
    sheet[XLSX.utils.encode_cell({ r: 0, c: index + 1 })] = { t: "s", v: header, s: copy(sourceCell?.s) };
  });
  const addRow = (entry, rowIndex, yellow = false) => {
    const productRow = productData.rows.get(entry.key.toLowerCase());
    const items = [entry.key, ...headers.map((header, index) => index === 0
      ? (productRow?.values[header] || entry.source)
      : (productRow?.values[header] || ""))];
    items.forEach((item, column) => {
      const sourceCell = cell(templateSheet, 1, Math.min(column, 29));
      const style = copy(sourceCell?.s) || {};
      if (yellow) style.fgColor = { rgb: YELLOW };
      sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })] = { t: "s", v: item, s: style };
    });
  };
  let row = 1;
  productRows.forEach((entry) => addRow(entry, row++));
  if (foreignRows.length) {
    const note = `If you have proofread ${productKey.toUpperCase()} then no need to review the following strings.`;
    headers.forEach((_, column) => {
      const sourceCell = cell(templateSheet, 222, Math.min(column, 29)) || cell(templateSheet, 1, Math.min(column, 29));
      const style = copy(sourceCell?.s) || {};
      style.fgColor = { rgb: YELLOW };
      sheet[XLSX.utils.encode_cell({ r: row, c: column })] = { t: "s", v: column === 0 ? note : "", s: style };
    });
    row += 1;
    foreignRows.forEach((entry) => addRow(entry, row++));
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(row - 1, 1), c: headers.length } });
  sheet["!cols"] = [{ wch: 36 }, ...headers.map((_, index) => copy(templateSheet["!cols"]?.[index + 1]) || { wch: 36 })];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Datasheet");
  return { workbook, productFieldCount: productRows.length, foreignFieldCount: foreignRows.length };
}

function generateLocalI18nDatasheet({ productName, outputDir }) {
  const cleanName = text(productName);
  if (!cleanName || /[<>:"/\\|?*\x00-\x1F]/.test(cleanName)) throw new Error("请输入有效的产品名称。");
  const htmlFile = findHtml(cleanName);
  const globalFile = latestGlobalPackage();
  const productFile = findProductWorkbook(cleanName);
  const globalEntries = parseGlobalPackage(globalFile);
  const productData = parseProductDatasheet(productFile);
  const productKey = token(cleanName);
  const htmlKeys = extractHtmlKeys(fs.readFileSync(htmlFile, "utf8"), globalEntries);
  const { workbook, ...stats } = buildWorkbook({ productName: cleanName, productKey, productData, globalEntries, htmlKeys });
  const destination = outputDir || (fs.existsSync(path.join(PRODUCT_ROOT, cleanName, "upload"))
    ? path.join(PRODUCT_ROOT, cleanName, "upload")
    : path.join(PRODUCT_ROOT, cleanName));
  fs.mkdirSync(destination, { recursive: true });
  const outputFile = path.join(destination, `${cleanName} datasheet.xlsx`);
  XLSX.writeFile(workbook, outputFile, { bookType: "xlsx" });
  const styleResult = childProcess.spawnSync(
    process.env.PYTHON || "python",
    [path.join(__dirname, "local-i18n-datasheet-style.py"), TEMPLATE_PATH, outputFile],
    { encoding: "utf8" }
  );
  if (styleResult.error || styleResult.status !== 0) {
    throw new Error(`Datasheet 样式处理失败：${styleResult.stderr || styleResult.error?.message || "Python 未返回成功状态"}`);
  }
  return { outputFile, htmlFile, globalFile, productFile, ...stats };
}

module.exports = { generateLocalI18nDatasheet };
