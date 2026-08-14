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
