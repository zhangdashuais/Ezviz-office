const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { inspectTargetField, removeTimingOptions, targetPackageFingerprint, writeTargetFieldUpdate } = require("./language-package-targeted-edit");

test("removes only the requested HG2 timing options from column E", () => {
  assert.equal(removeTimingOptions("15s / 18s / 20s"), "");
  assert.equal(removeTimingOptions("Keep / 15s / 18s / 20s"), "Keep");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hg2-language-"));
  const source = path.join(dir, "source.xlsx");
  const output = path.join(dir, "output.xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Category", "Unused", "Single Word", "en-US", "Need Translation"],
    ["Product", "", "HG2_400_4", "15s / 18s / 20s", "Keep / 15s / 18s / 20s"]
  ]), "Language");
  XLSX.writeFile(workbook, source);
  assert.equal(targetPackageFingerprint(source), targetPackageFingerprint(fs.readFileSync(source)));
  const result = writeTargetFieldUpdate(source, output);
  assert.equal(result.targetAddress, "E2");
  assert.equal(inspectTargetField(output).before, "Keep");
});
