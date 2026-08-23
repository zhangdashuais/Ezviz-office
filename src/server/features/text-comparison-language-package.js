const fs = require("fs");
const XLSX = require("xlsx");

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readInputBuffer(input) {
  return Buffer.isBuffer(input) ? input : fs.readFileSync(input);
}

function cellValue(sheet, row, column) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  return cell ? (cell.v == null ? "" : cell.v) : "";
}

function isKeyHeader(value) {
  return /^(?:key|field)$|single\s*word|field\s*(?:name|key)|i18n\s*key|variable\s*name|变量名|字段名/i
    .test(normalize(value).toLowerCase());
}

function isSourceHeader(value) {
  return /^(?:value|source|original)$|^en-us\b|source\s*(?:text|value)|original\s*(?:text|value)|原文(?:内容)?/i
    .test(normalize(value).toLowerCase());
}

function normalizeLanguageKey(rawKey) {
  let key = normalize(rawKey)
    .replace(/^\{\{\s*t\(\s*(?:['"]|&#39;|&apos;|&quot;)/i, "")
    .replace(/(?:['"]|&#39;|&apos;|&quot;)\s*\)\s*\}\}$/i, "")
    .trim();
  if (!key) return null;
  key = key.replace(/^goods\./i, "");
  return {
    short: key,
    full: `goods.${key}`
  };
}

function findRequestedColumn(sheet, headerRow, range, sourceColumn, requestedColumn) {
  const requested = normalize(requestedColumn).toLowerCase();
  if (!requested || /^en-us\b|source|original|原文/.test(requested)) return sourceColumn;

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = normalize(cellValue(sheet, headerRow, column));
    const lower = header.toLowerCase();
    if (lower === requested || lower.startsWith(requested)) return column;
  }
  throw new Error(`语言包中没有找到指定替换列：${requestedColumn}。`);
}

function detectLanguagePackageSection(sheet, range, requestedColumn) {
  const lastHeaderRow = Math.min(range.e.r, range.s.r + 12);
  for (let row = range.s.r; row <= lastHeaderRow; row += 1) {
    let keyColumn = -1;
    let sourceColumn = -1;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = cellValue(sheet, row, column);
      if (keyColumn < 0 && isKeyHeader(header)) keyColumn = column;
      if (sourceColumn < 0 && isSourceHeader(header)) sourceColumn = column;
    }
    if (keyColumn >= 0 && sourceColumn >= 0) {
      return {
        headerRow: row,
        firstDataRow: row + 1,
        lastDataRow: range.e.r,
        keyColumn,
        valueColumn: findRequestedColumn(sheet, row, range, sourceColumn, requestedColumn)
      };
    }
  }
  return null;
}

function readLanguageReplacementMap(input, options = {}) {
  const buffer = readInputBuffer(input);
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: true, cellDates: true });
  const valuesByKey = new Map();
  const sections = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const section = detectLanguagePackageSection(sheet, range, options.column);
    if (!section) return;
    let rowCount = 0;
    for (let row = section.firstDataRow; row <= section.lastDataRow; row += 1) {
      const normalizedKey = normalizeLanguageKey(cellValue(sheet, row, section.keyColumn));
      const value = String(cellValue(sheet, row, section.valueColumn) ?? "");
      if (!normalizedKey || !normalize(value)) continue;
      if (!valuesByKey.has(normalizedKey.full)) valuesByKey.set(normalizedKey.full, value);
      if (!valuesByKey.has(normalizedKey.short)) valuesByKey.set(normalizedKey.short, value);
      rowCount += 1;
    }
    sections.push({
      sheetName,
      rowCount,
      valueColumn: section.valueColumn + 1
    });
  });

  if (!sections.length) {
    throw new Error("语言包 Excel 中没有识别到字段名列和 en-US 原文列。");
  }
  if (!valuesByKey.size) {
    throw new Error("语言包 Excel 中没有可用于替换的字段数据。");
  }

  return {
    valuesByKey,
    fieldCount: valuesByKey.size / 2,
    sections
  };
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function languageTokenPattern() {
  const quote = String.raw`(?:['"]|&#39;|&apos;|&quot;)`;
  return new RegExp(
    String.raw`\{\{\s*t\(\s*${quote}\s*([^'"]+?)\s*${quote}\s*\)\s*\}\}`,
    "gi"
  );
}

function replaceLanguageFieldsInHtml(htmlText, replacementMap, options = {}) {
  const missingKeys = new Set();
  const replacedKeys = new Set();
  let replacementCount = 0;
  const html = String(htmlText || "").replace(languageTokenPattern(), (full, rawKey) => {
    const normalizedKey = normalizeLanguageKey(rawKey);
    const value = normalizedKey
      ? replacementMap.get(normalizedKey.full) || replacementMap.get(normalizedKey.short)
      : "";
    if (!value) {
      if (normalizedKey) missingKeys.add(normalizedKey.full);
      return full;
    }
    replacementCount += 1;
    replacedKeys.add(normalizedKey.full);
    const escapedValue = escapeHtmlText(value);
    if (!options.annotate) return escapedValue;
    return `<span data-text-compare-language-key="${normalizedKey.full}">${escapedValue}</span>`;
  });
  return {
    html,
    replacementCount,
    replacedKeys: [...replacedKeys],
    missingKeys: [...missingKeys]
  };
}

module.exports = {
  normalize,
  normalizeLanguageKey,
  readLanguageReplacementMap,
  replaceLanguageFieldsInHtml
};
