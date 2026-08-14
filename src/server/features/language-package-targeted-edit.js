const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");
const XLSX = require("xlsx");

function text(value) {
  return String(value == null ? "" : value).trim();
}

function removeTimingOptions(value) {
  return String(value == null ? "" : value)
    .split(/\s*\/\s*/)
    .map((part) => part.replace(/\b(?:15|18|20)\s*s\b/gi, "").trim())
    .filter(Boolean)
    .join(" / ");
}

function inspectTargetField(input, fieldKey = "HG2_400_4") {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellStyles: true,
    cellDates: true,
    cellNF: true,
    cellText: true
  });
  const matches = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (text(sheet[address]?.v) === fieldKey) matches.push({ sheetName, row, column });
      }
    }
  });
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? `${fieldKey} 在语言包中出现 ${matches.length} 次，不能安全修改。`
      : `语言包中没有找到 ${fieldKey}。`);
  }
  const match = matches[0];
  const sheet = workbook.Sheets[match.sheetName];
  const targetAddress = XLSX.utils.encode_cell({ r: match.row, c: 4 });
  const before = String(sheet[targetAddress]?.v ?? "");
  const after = removeTimingOptions(before);
  return {
    workbook,
    fieldKey,
    sheetName: match.sheetName,
    rowNumber: match.row + 1,
    keyAddress: XLSX.utils.encode_cell({ r: match.row, c: match.column }),
    targetAddress,
    before,
    after,
    blank: !text(before),
    changed: before !== after
  };
}

function targetPackageFingerprint(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellNF: true });
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
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function inspectTargetFieldNative(inputPath, fieldKey = "HG2_400_4") {
  const scriptPath = path.resolve("scripts", "inspect-language-package-cell.ps1");
  const result = childProcess.spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-InputPath", path.resolve(inputPath),
    "-FieldKey", fieldKey
  ], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Excel 原生读取失败：${result.error?.message || result.stderr || result.stdout}`.trim());
  }
  const parsed = JSON.parse(String(result.stdout).trim());
  return {
    fieldKey,
    sheetName: parsed.SheetName,
    rowNumber: Number(parsed.RowNumber),
    targetAddress: parsed.TargetAddress,
    before: String(parsed.Before ?? ""),
    after: String(parsed.After ?? ""),
    blank: !text(parsed.Before),
    changed: String(parsed.Before ?? "") !== String(parsed.After ?? "")
  };
}

function targetRevisionFingerprint(inspected) {
  return crypto.createHash("sha256").update(JSON.stringify([
    inspected.fieldKey,
    inspected.sheetName,
    inspected.rowNumber,
    inspected.before
  ])).digest("hex");
}

function writeTargetFieldUpdate(input, outputPath, fieldKey = "HG2_400_4") {
  const inspected = inspectTargetField(input, fieldKey);
  if (!inspected.changed) return inspected;
  const sheet = inspected.workbook.Sheets[inspected.sheetName];
  const existing = sheet[inspected.targetAddress] || {};
  sheet[inspected.targetAddress] = {
    ...existing,
    t: "s",
    v: inspected.after,
    w: inspected.after
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(inspected.workbook, outputPath, {
    bookType: path.extname(outputPath).toLowerCase() === ".xls" ? "biff8" : "xlsx",
    cellStyles: true
  });
  const verified = inspectTargetField(outputPath, fieldKey);
  if (verified.before !== inspected.after) {
    throw new Error(`${fieldKey} 修改文件回读不一致。`);
  }
  return { ...inspected, outputPath };
}

function writeTargetFieldUpdateNative(inputPath, outputPath, fieldKey = "HG2_400_4") {
  const scriptPath = path.resolve("scripts", "update-language-package-cell.ps1");
  const result = childProcess.spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-InputPath", path.resolve(inputPath),
    "-OutputPath", path.resolve(outputPath),
    "-FieldKey", fieldKey
  ], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Excel 原生保存失败：${result.error?.message || result.stderr || result.stdout}`.trim());
  }
  const verified = inspectTargetField(outputPath, fieldKey);
  if (verified.changed) throw new Error(`${fieldKey} 经 Excel 保存后仍含目标秒数。`);
  return { ...verified, outputPath };
}

module.exports = {
  inspectTargetField,
  inspectTargetFieldNative,
  removeTimingOptions,
  targetPackageFingerprint,
  targetRevisionFingerprint,
  writeTargetFieldUpdate,
  writeTargetFieldUpdateNative
};
