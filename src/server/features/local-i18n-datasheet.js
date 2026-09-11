const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const XLSX = require("xlsx");
const cheerio = require("cheerio");
const i18nRules = require("../../../办公软件/111/src/i18n-conversion-rules");

const HTML_ROOT = "D:\\代码存放\\产品代码\\ezviz";
const PRODUCT_ROOT = "D:\\产品";
const DOWNLOADS_ROOT = "C:\\Users\\zhangtianle7\\Downloads";
const DEFAULT_TEMPLATE_PATH = "D:\\产品\\HB90 Dual 3K Kit\\upload\\HB90 Dual 3K Kit datasheet.xlsx";
const PATH_CONFIG_FILE = path.resolve(__dirname, "../../../runtime/local-i18n-paths.json");
const YELLOW = "FFFF00";
const PATH_KEYS = ["htmlFile", "productFile", "globalFile", "templateFile", "outputDir", "outputFile"];

function text(value) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function copy(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function locateRawHtmlText(rawNode, source) {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  for (const candidate of [...new Set([source, escaped])]) {
    const start = rawNode.indexOf(candidate);
    if (start >= 0) return { start, length: candidate.length };
  }
  return null;
}

function isProductNameOnlyText(value, productName) {
  const normalizeName = (input) => text(input).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const source = normalizeName(value);
  const parts = normalizeName(productName).split(" ").filter(Boolean);
  return parts.some((_part, index) => source === parts.slice(0, index + 1).join(" "));
}

function normalizePathDefaults(input = {}) {
  const result = {};
  PATH_KEYS.forEach((key) => {
    const value = text(input[key]);
    if (!value) return;
    if (!path.isAbsolute(value)) throw new Error(`${key} 必须填写绝对路径。`);
    if (key === "outputFile") {
      if (!/\.xlsx$/i.test(value)) throw new Error("outputFile 必须是 .xlsx 文件路径。");
    } else if (key !== "outputDir") {
      const allowed = key === "htmlFile" ? /\.html?$/i : /\.xlsx?$/i;
      if (!allowed.test(value)) throw new Error(`${key} 文件类型不正确。`);
      if (!fs.existsSync(value) || !fs.statSync(value).isFile()) throw new Error(`${key} 文件不存在：${value}`);
    }
    result[key] = path.normalize(value);
  });
  return result;
}

function readLocalI18nPathDefaults() {
  try {
    return normalizePathDefaults(JSON.parse(fs.readFileSync(PATH_CONFIG_FILE, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function saveLocalI18nPathDefaults(input) {
  const config = normalizePathDefaults(input);
  fs.mkdirSync(path.dirname(PATH_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(PATH_CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

function configuredFile(value, fallback, label, extensionPattern) {
  const file = text(value);
  if (!file) return fallback();
  if (!path.isAbsolute(file) || !extensionPattern.test(file)) throw new Error(`${label}路径无效：${file}`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`${label}不存在：${file}`);
  return path.normalize(file);
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
  const generatedOutputPrefix = `${productName} datasheet`.toLowerCase();
  const ranked = files.filter((file) => !path.basename(file).toLowerCase().startsWith(generatedOutputPrefix)).map((file) => {
    const name = path.basename(file, path.extname(file));
    const key = token(name);
    return {
      file,
      score: (/(^|_)datasheet($|_)/i.test(key) ? 100 : 0)
        + (key.includes(wanted) ? 20 : 0)
        - (file.toLowerCase().includes(`${path.sep}upload${path.sep}`) ? 1000 : 0)
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

function mergeGeneratedOutputHistory(productData, destination, productName, outputFile) {
  const prefix = `${productName} datasheet`.toLowerCase();
  const files = fs.readdirSync(destination, { withFileTypes: true })
    .filter((entry) => entry.isFile()
      && entry.name.toLowerCase().startsWith(prefix)
      && /\.xlsx?$/i.test(entry.name))
    .map((entry) => path.join(destination, entry.name))
    .filter((file) => path.resolve(file).toLowerCase() !== path.resolve(outputFile).toLowerCase())
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  files.forEach((file) => {
    try {
      parseProductDatasheet(file).rows.forEach((entry, key) => productData.rows.set(key, entry));
    } catch {}
  });
}

function recoverRowsFromHtmlBackup(htmlFile, html, productName, productData) {
  const extension = path.extname(htmlFile);
  const prefix = `${path.basename(htmlFile, extension)}.before-i18n-`;
  const backupFile = fs.readdirSync(path.dirname(htmlFile), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(extension))
    .map((entry) => path.join(path.dirname(htmlFile), entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!backupFile) return;
  const collect = (sourceHtml) => {
    const $ = cheerio.load(sourceHtml);
    const nodes = [];
    $("body").find("*").addBack().contents().each((_index, node) => {
      if (node.type === "text" && !["script", "style", "noscript"].includes(node.parent?.name)) nodes.push(node.data);
    });
    return nodes;
  };
  const currentNodes = collect(html);
  const backupNodes = collect(fs.readFileSync(backupFile, "utf8"));
  if (currentNodes.length !== backupNodes.length) return;
  currentNodes.forEach((current, index) => {
    const match = String(current || "").match(/\{\{t\(\s*['"]goods\.([^'"]+)['"]\s*\)\}\}/);
    if (!match || productData.rows.has(match[1].toLowerCase())) return;
    const raw = text(backupNodes[index]);
    const source = i18nRules.extractTranslatableText(raw, productName);
    if (!source || isProductNameOnlyText(source, productName)) return;
    productData.rows.set(match[1].toLowerCase(), {
      key: match[1],
      values: { [productData.headers[0]]: source }
    });
  });
}

function extractHtmlKeys(html, entries) {
  const candidates = new Set();
  const quoted = /["'`]([a-z][a-z0-9_]{2,})["'`]/gi;
  let match;
  while ((match = quoted.exec(html))) candidates.add(match[1].toLowerCase());
  const dotted = /\bgoods\.([a-z][a-z0-9_]{2,})\b/gi;
  while ((match = dotted.exec(html))) candidates.add(match[1].toLowerCase());
  return [...candidates].map((key) => entries.get(key)).filter(Boolean);
}

function extractNewProductRows(html, productName, productKey, productData, globalEntries) {
  const sourceEntries = [...productData.rows.values()].map((entry) => ({
    key: entry.key,
    source: entry.values[productData.headers[0]] || ""
  })).concat([...globalEntries.values()]);
  const sourceIndex = i18nRules.buildSourceKeyIndex(sourceEntries).bySource;
  const reused = new Map();
  const newSources = new Map();
  const occurrences = new Map();
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
  $("body").find("*").addBack().contents().each((_index, node) => {
    if (node.type !== "text") return;
    if (["script", "style", "noscript"].includes(node.parent?.name)) return;
    const raw = text(node.data);
    if (!raw || raw.includes("{{t(") || !i18nRules.containsEnglishText(raw)) return;
    const source = i18nRules.extractTranslatableText(raw, productName);
    if (!source || isProductNameOnlyText(source, productName)) return;
    const normalized = i18nRules.normalize(source);
    const location = node.sourceCodeLocation;
    if (!location) return;
    const rawNode = html.slice(location.startOffset, location.endOffset);
    const rawLocation = locateRawHtmlText(rawNode, source);
    if (!rawLocation) return;
    if (!occurrences.has(normalized)) occurrences.set(normalized, []);
    occurrences.get(normalized).push({
      start: location.startOffset + rawLocation.start,
      end: location.startOffset + rawLocation.start + rawLocation.length
    });
    const existing = sourceIndex.get(normalized);
    if (existing) reused.set(existing.key.toLowerCase(), existing);
    else if (!newSources.has(normalized)) newSources.set(normalized, source);
  });
  const reserved = new Set([
    ...globalEntries.keys(),
    ...productData.rows.keys()
  ]);
  let index = 0;
  const prefix = productKey.toUpperCase();
  const newRows = [...newSources.entries()].map(([normalized, source]) => {
    let key;
    do { key = `${prefix}_${++index}`; } while (reserved.has(key.toLowerCase()));
    reserved.add(key.toLowerCase());
    return { key, source, normalized };
  });
  const keyBySource = new Map(newRows.map((entry) => [entry.normalized, entry.key]));
  reused.forEach((entry) => keyBySource.set(i18nRules.normalize(entry.source), entry.key));
  const replacements = [...occurrences.entries()].flatMap(([normalized, positions]) => {
    const key = keyBySource.get(normalized);
    return key ? positions.map((position) => ({ ...position, key })) : [];
  });
  return {
    newRows: newRows.map(({ normalized: _normalized, ...entry }) => entry),
    reusedRows: [...reused.values()],
    replacements
  };
}

function replaceHtmlText(html, replacements) {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce((result, item) => (
      result.slice(0, item.start)
      + `{{t(&#39;goods.${item.key}&#39;)}}`
      + result.slice(item.end)
    ), html);
}

function backupAndWriteHtml(htmlFile, html) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = path.extname(htmlFile);
  const backupFile = path.join(
    path.dirname(htmlFile),
    `${path.basename(htmlFile, extension)}.before-i18n-${stamp}${extension}`
  );
  fs.copyFileSync(htmlFile, backupFile, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(htmlFile, html, "utf8");
  return backupFile;
}

function buildWorkbook({ productName, productKey, productData, globalEntries, htmlKeys, newProductRows, templateFile }) {
  const template = XLSX.readFile(templateFile, { cellStyles: true });
  const templateSheet = template.Sheets[template.SheetNames.find((name) => /datasheet/i.test(name)) || template.SheetNames[0]];
  const headers = productData.headers;
  const productRows = newProductRows;
  const seen = new Set(productRows.map((entry) => entry.key.toLowerCase()));
  const foreignRows = htmlKeys.filter((entry) => !seen.has(entry.key.toLowerCase()));
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

function generateLocalI18nDatasheet(input = {}) {
  const { productName } = input;
  const cleanName = text(productName);
  if (!cleanName || /[<>:"/\\|?*\x00-\x1F]/.test(cleanName)) throw new Error("请输入有效的产品名称。");
  const defaults = readLocalI18nPathDefaults();
  const htmlFile = configuredFile(input.htmlFile || defaults.htmlFile, () => findHtml(cleanName), "HTML 文件", /\.html?$/i);
  const globalFile = configuredFile(input.globalFile || defaults.globalFile, latestGlobalPackage, "总语言包", /\.xlsx?$/i);
  const productFile = configuredFile(input.productFile || defaults.productFile, () => findProductWorkbook(cleanName), "单产品语言包", /\.xlsx?$/i);
  const templateFile = configuredFile(input.templateFile || defaults.templateFile, () => DEFAULT_TEMPLATE_PATH, "样式模板", /\.xlsx?$/i);
  const globalEntries = parseGlobalPackage(globalFile);
  const productKey = token(cleanName);
  const configuredOutputFile = text(input.outputFile || defaults.outputFile);
  if (configuredOutputFile && (!path.isAbsolute(configuredOutputFile) || !/\.xlsx$/i.test(configuredOutputFile))) {
    throw new Error("最终保存路径必须是绝对 .xlsx 文件路径。");
  }
  const configuredOutputDir = text(input.outputDir || defaults.outputDir);
  if (configuredOutputDir && !path.isAbsolute(configuredOutputDir)) throw new Error("输出目录必须填写绝对路径。");
  const destination = configuredOutputFile ? path.dirname(configuredOutputFile) : configuredOutputDir || (fs.existsSync(path.join(PRODUCT_ROOT, cleanName, "upload"))
    ? path.join(PRODUCT_ROOT, cleanName, "upload")
    : path.join(PRODUCT_ROOT, cleanName));
  if (fs.existsSync(destination) && !fs.statSync(destination).isDirectory()) throw new Error(`输出目录不是文件夹：${destination}`);
  fs.mkdirSync(destination, { recursive: true });
  let outputFile = configuredOutputFile ? path.normalize(configuredOutputFile) : path.join(destination, `${cleanName} datasheet.xlsx`);
  const productData = parseProductDatasheet(productFile);
  mergeGeneratedOutputHistory(productData, destination, cleanName, outputFile);
  if (fs.existsSync(outputFile)) {
    const previousOutput = parseProductDatasheet(outputFile);
    previousOutput.rows.forEach((entry, key) => productData.rows.set(key, entry));
  }
  recoverRowsFromHtmlBackup(htmlFile, fs.readFileSync(htmlFile, "utf8"), cleanName, productData);
  const knownEntries = new Map(globalEntries);
  productData.rows.forEach((entry, key) => knownEntries.set(key, {
    key: entry.key,
    source: entry.values[productData.headers[0]] || ""
  }));
  const html = fs.readFileSync(htmlFile, "utf8");
  const htmlKeys = extractHtmlKeys(html, knownEntries);
  const extracted = extractNewProductRows(html, cleanName, productKey, productData, globalEntries);
  const productPrefix = `${productKey.toUpperCase()}_`;
  const currentProductRows = new Map(extracted.newRows.concat(
    htmlKeys.concat(extracted.reusedRows).filter((entry) => entry.key.toUpperCase().startsWith(productPrefix))
  ).map((entry) => [entry.key.toLowerCase(), entry]));
  const reusedKeys = new Map(htmlKeys.concat(extracted.reusedRows)
    .filter((entry) => !entry.key.toUpperCase().startsWith(productPrefix))
    .map((entry) => [entry.key.toLowerCase(), entry]));
  const { workbook, ...stats } = buildWorkbook({
    productName: cleanName,
    productKey,
    productData,
    globalEntries,
    htmlKeys: [...reusedKeys.values()],
    newProductRows: [...currentProductRows.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
    templateFile
  });
  try {
    XLSX.writeFile(workbook, outputFile, { bookType: "xlsx" });
  } catch (error) {
    if (configuredOutputFile && ['EBUSY', 'EPERM'].includes(error.code)) {
      throw new Error(`最终保存文件正在被占用，请关闭 Excel 后重试：${outputFile}`);
    }
    if (!['EBUSY', 'EPERM'].includes(error.code)) throw error;
    outputFile = path.join(destination, `${cleanName} datasheet.updated.xlsx`);
    XLSX.writeFile(workbook, outputFile, { bookType: "xlsx" });
  }
  const styleResult = childProcess.spawnSync(
    process.env.PYTHON || "python",
    [path.join(__dirname, "local-i18n-datasheet-style.py"), templateFile, outputFile],
    { encoding: "utf8" }
  );
  if (styleResult.error || styleResult.status !== 0) {
    throw new Error(`Datasheet 样式处理失败：${styleResult.stderr || styleResult.error?.message || "Python 未返回成功状态"}`);
  }
  const updatedHtml = replaceHtmlText(html, extracted.replacements);
  const backupFile = updatedHtml === html ? "" : backupAndWriteHtml(htmlFile, updatedHtml);
  return {
    outputFile,
    htmlFile,
    htmlBackupFile: backupFile,
    htmlReplacementCount: extracted.replacements.length,
    globalFile,
    productFile,
    templateFile,
    outputDir: destination,
    ...stats
  };
}

module.exports = {
  generateLocalI18nDatasheet,
  extractNewProductRows,
  replaceHtmlText,
  isProductNameOnlyText,
  normalizePathDefaults,
  readLocalI18nPathDefaults,
  saveLocalI18nPathDefaults
};
