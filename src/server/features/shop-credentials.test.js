const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { createShopCredentials } = require("./shop-credentials");

test("credential reader skips sparse blank rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shop-credentials-"));
  const workbookPath = path.join(dir, "网站账号密码.xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Website"],
    ["www.ezviz.com", "global", "secret"],
    [],
    ["www.ezviz.com/cn", "china", "secret"]
  ]), "Sheet1");
  XLSX.writeFile(workbook, workbookPath);
  const credentials = createShopCredentials({ desktopRoot: dir });
  assert.equal(credentials.read("Website", "www.ezviz.com/cn").account, "china");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("credential reader finds the newest workbook in HikLink received files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shop-credentials-"));
  try {
    const received = path.join(dir, "Documents", "HikLink_Files", "tester", "received");
    fs.mkdirSync(received, { recursive: true });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Website"],
      ["www.ezviz.com", "global", "secret"]
    ]), "Sheet1");
    const oldPath = path.join(received, "网站账号密码_1.xlsx");
    const newPath = path.join(received, "网站账号密码_2.xlsx");
    XLSX.writeFile(workbook, oldPath);
    XLSX.writeFile(workbook, newPath);
    fs.utimesSync(oldPath, new Date("2025-01-01"), new Date("2025-01-01"));
    fs.utimesSync(newPath, new Date("2026-01-01"), new Date("2026-01-01"));
    const credentials = createShopCredentials({
      desktopRoot: path.join(dir, "Desktop"),
      userProfileRoot: dir
    });
    assert.equal(credentials.findWorkbook(), newPath);
    assert.equal(credentials.read("Website", "www.ezviz.com").account, "global");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
