const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashBuffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readInputBuffer(input) {
  return Buffer.isBuffer(input) ? input : fs.readFileSync(input);
}

function cellValue(sheet, row, column) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  return cell ? (cell.v == null ? "" : cell.v) : "";
}

function parseLanguageDatasheet(input) {
  const buffer = readInputBuffer(input);
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("语言包 Datasheet 中没有工作表。");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.["!ref"]) throw new Error("语言包 Datasheet 的第一个工作表为空。");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.e.c < 2) {
    throw new Error("语言包 Datasheet 至少需要三列：字段名、原文和一种译文。");
  }

  const headers = [];
  for (let column = range.s.c + 2; column <= range.e.c; column += 1) {
    const header = normalize(cellValue(sheet, range.s.r, column));
    if (header) headers.push({ header, column });
  }
  if (!headers.length) throw new Error("语言包 Datasheet 中没有识别到译文列。");

  const rows = [];
  const byKey = new Map();
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const key = normalize(cellValue(sheet, row, range.s.c));
    const source = normalize(cellValue(sheet, row, range.s.c + 1));
    if (!key && !source) continue;
    if (!key) throw new Error(`语言包 Datasheet 第 ${row + 1} 行缺少字段名。`);
    if (!source) {
      const hasTranslation = headers.some(({ column }) =>
        normalize(cellValue(sheet, row, column))
      );
      if (!hasTranslation) continue;
      throw new Error(`语言包 Datasheet 第 ${row + 1} 行缺少原文。`);
    }
    if (byKey.has(key)) {
      throw new Error(
        `语言包 Datasheet 字段名重复：${key}（第 ${byKey.get(key)}、${row + 1} 行）。`
      );
    }
    byKey.set(key, row + 1);
    const translations = {};
    headers.forEach(({ header, column }) => {
      const value = cellValue(sheet, row, column);
      translations[header] = value == null ? "" : String(value);
    });
    rows.push({ key, source, rowNumber: row + 1, translations });
  }
  if (!rows.length) throw new Error("语言包 Datasheet 中没有可处理的数据行。");

  return {
    sheetName,
    fingerprint: hashBuffer(buffer),
    headers: headers.map((item) => item.header),
    rows
  };
}

function resolveDatasheetLanguage(parsedDatasheet, target, siteLanguageNeedles) {
  const requested = normalize(target?.languagePackageHeader).toLowerCase();
  if (requested) {
    const exact = parsedDatasheet.headers.find(
      (header) => header.toLowerCase() === requested
    );
    if (!exact) {
      throw new Error(
        `${target.siteCode} 指定的语言包 Datasheet 译文列不存在：`
        + `${target.languagePackageHeader}`
      );
    }
    return exact;
  }
  const needles = siteLanguageNeedles[target.siteCode] || [target.siteCode];
  const matches = parsedDatasheet.headers.filter((header) => {
    const normalizedHeader = header.toLowerCase();
    return needles.some((needle) =>
      normalizedHeader.includes(String(needle).toLowerCase()));
  });
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `${target.siteCode} 自动匹配到多个语言包 Datasheet 译文列，请手工选择。`
        : `${target.siteCode} 没有自动匹配到语言包 Datasheet 译文列，请手工选择。`
    );
  }
  return matches[0];
}

function findLanguagePackageSections(workbook, langCode) {
  const sections = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const lastHeaderRow = Math.min(range.e.r, range.s.r + 10);
    for (let row = range.s.r; row <= lastHeaderRow; row += 1) {
      let keyColumn = -1;
      let sourceColumn = -1;
      let targetColumn = -1;
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const header = normalize(cellValue(sheet, row, column));
        const lower = header.toLowerCase();
        if (/single\s*word/.test(lower)) keyColumn = column;
        if (/^en-us\b/.test(lower)) sourceColumn = column;
        if (/\bneed\s*translation\b/.test(lower)) targetColumn = column;
        if (langCode && lower.startsWith(String(langCode).toLowerCase())) {
          targetColumn = column;
        }
      }
      if (keyColumn >= 0 && sourceColumn >= 0 && targetColumn >= 0) {
        sections.push({
          sheetName,
          headerRow: row,
          firstDataRow: row + 1,
          lastDataRow: range.e.r,
          keyColumn,
          sourceColumn,
          targetColumn,
          targetHeader: normalize(cellValue(sheet, row, targetColumn))
        });
        break;
      }
    }
  });
  if (!sections.length) {
    throw new Error(
      "当前语言包中没有识别到字段名、en-US 原文和 need translation 目标列。"
    );
  }
  return sections;
}

function workbookContentFingerprint(workbook) {
  const content = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName] || {};
    const cells = Object.keys(sheet)
      .filter((address) => !address.startsWith("!"))
      .sort()
      .map((address) => {
        const cell = sheet[address] || {};
        return [address, cell.t || "", cell.v ?? "", cell.f || ""];
      });
    return [sheetName, sheet["!ref"] || "", cells];
  });
  return hashBuffer(Buffer.from(JSON.stringify(content), "utf8"));
}

function normalizeSourceForComparison(value) {
  return normalize(value).toLocaleLowerCase().replace(/\s+/g, "");
}

function readLanguagePackage(input, langCode) {
  const buffer = readInputBuffer(input);
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellStyles: true,
    cellDates: true,
    cellNF: true,
    cellText: true
  });
  return {
    workbook,
    fingerprint: hashBuffer(buffer),
    contentFingerprint: workbookContentFingerprint(workbook),
    sections: findLanguagePackageSections(workbook, langCode)
  };
}

function planLanguagePackageUpdates(packageInfo, parsedDatasheet, translationHeader) {
  if (!parsedDatasheet.headers.includes(translationHeader)) {
    throw new Error(`语言包 Datasheet 译文列不存在：${translationHeader}`);
  }
  const candidatesByKey = new Map();
  packageInfo.sections.forEach((section) => {
    const sheet = packageInfo.workbook.Sheets[section.sheetName];
    for (let row = section.firstDataRow; row <= section.lastDataRow; row += 1) {
      const key = normalize(cellValue(sheet, row, section.keyColumn));
      if (!key) continue;
      const candidates = candidatesByKey.get(key) || [];
      candidates.push({
        sheetName: section.sheetName,
        row,
        rowNumber: row + 1,
        targetColumn: section.targetColumn,
        source: normalize(cellValue(sheet, row, section.sourceColumn)),
        current: String(cellValue(sheet, row, section.targetColumn) ?? "")
      });
      candidatesByKey.set(key, candidates);
    }
  });

  const updates = [];
  const missing = [];
  const sourceMismatches = [];
  const skippedBlank = [];
  const unchanged = [];
  parsedDatasheet.rows.forEach((entry) => {
    const translation = String(entry.translations[translationHeader] ?? "");
    if (!normalize(translation)) {
      skippedBlank.push({ key: entry.key, datasheetRow: entry.rowNumber });
      return;
    }
    const candidates = candidatesByKey.get(entry.key) || [];
    if (!candidates.length) {
      missing.push({ key: entry.key, source: entry.source, datasheetRow: entry.rowNumber });
      return;
    }
    const sourceMatches = candidates.filter(
      (candidate) => normalizeSourceForComparison(candidate.source)
        === normalizeSourceForComparison(entry.source)
    );
    if (!sourceMatches.length) {
      sourceMismatches.push({
        key: entry.key,
        datasheetRow: entry.rowNumber,
        expectedSource: entry.source,
        packageSources: [...new Set(candidates.map((candidate) => candidate.source))]
      });
    }
    candidates.forEach((candidate) => {
      const item = { ...candidate, key: entry.key, translation };
      if (candidate.current === translation) unchanged.push(item);
      else updates.push(item);
    });
  });

  return {
    translationHeader,
    safe: missing.length === 0,
    requestedCount: parsedDatasheet.rows.length - skippedBlank.length,
    matchedFieldCount: new Set(
      updates.concat(unchanged).map((item) => item.key)
    ).size,
    changedCellCount: updates.length,
    unchangedCellCount: unchanged.length,
    skippedBlankCount: skippedBlank.length,
    missing,
    sourceMismatches,
    skippedBlank,
    updates
  };
}

function assertSafePlan(plan) {
  if (plan.safe) return;
  const parts = [];
  if (plan.missing.length) parts.push(`缺少字段 ${plan.missing.length} 个`);
  if (plan.sourceMismatches.length) {
    parts.push(`原文不一致 ${plan.sourceMismatches.length} 个`);
  }
  throw new Error(`语言包预检未通过：${parts.join("，")}。请查看预览明细。`);
}

function writeUpdatedLanguagePackage(packageInfo, plan, outputPath) {
  assertSafePlan(plan);
  plan.updates.forEach((update) => {
    const sheet = packageInfo.workbook.Sheets[update.sheetName];
    const address = XLSX.utils.encode_cell({
      r: update.row,
      c: update.targetColumn
    });
    const existing = sheet[address] || {};
    sheet[address] = { ...existing, t: "s", v: update.translation, w: update.translation };
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const extension = path.extname(outputPath).toLowerCase();
  XLSX.writeFile(packageInfo.workbook, outputPath, {
    bookType: extension === ".xls" ? "biff8" : "xlsx",
    cellStyles: true
  });

  const verified = readLanguagePackage(outputPath);
  const failures = [];
  plan.updates.forEach((update) => {
    const sheet = verified.workbook.Sheets[update.sheetName];
    const actual = String(cellValue(sheet, update.row, update.targetColumn) ?? "");
    if (actual !== update.translation) {
      failures.push({
        key: update.key,
        sheetName: update.sheetName,
        rowNumber: update.rowNumber,
        expected: update.translation,
        actual
      });
    }
  });
  if (failures.length) {
    throw new Error(`语言包生成后回读失败：${failures.length} 个单元格不一致。`);
  }
  return {
    filePath: outputPath,
    fileName: path.basename(outputPath),
    size: fs.statSync(outputPath).size,
    sha256: verified.fingerprint,
    verifiedCellCount: plan.updates.length
  };
}

module.exports = {
  normalize,
  parseLanguageDatasheet,
  resolveDatasheetLanguage,
  findLanguagePackageSections,
  normalizeSourceForComparison,
  workbookContentFingerprint,
  readLanguagePackage,
  planLanguagePackageUpdates,
  assertSafePlan,
  writeUpdatedLanguagePackage
};
