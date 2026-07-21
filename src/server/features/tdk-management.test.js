const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const {
  parseTdkWorkbook,
  resolveSiteForRow,
  writeOfficialImportWorkbook,
  groupRowsBySite
} = require("./tdk-management");

const sites = [
  { name: "France", siteCode: "fr", url: "https://www.ezviz.com/fr", enabled: true },
  { name: "Indonesia", siteCode: "id", url: "https://www.ezviz.com/id", enabled: true }
];

function writeSourceWorkbook(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-test-"));
  const filePath = path.join(dir, "source.xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "TDK配置");
  XLSX.writeFile(workbook, filePath);
  return { dir, filePath };
}

test("resolves a site by code or exact site URL", () => {
  assert.equal(resolveSiteForRow({ "Site Code": "fr", "Site URL": "" }, sites).siteCode, "fr");
  assert.equal(resolveSiteForRow({ "Site Code": "", "Site URL": "https://www.ezviz.com/id/" }, sites).siteCode, "id");
});

test("parses, validates, and groups TDK rows by site", (t) => {
  const temp = writeSourceWorkbook([
    {
      "Record ID": "TDK-1", "Site URL": "https://www.ezviz.com/fr", "Site Code": "fr",
      Language: "fr-FR", "Page Type": "Product Detail", "Page URL": "https://www.ezviz.com/fr/product/camera/1#spec",
      Product: "Camera", Title: "Caméra | EZVIZ", Description: "Description française", Keywords: "caméra, ezviz", Action: "update", Notes: ""
    },
    {
      "Record ID": "TDK-2", "Site URL": "https://www.ezviz.com/id", "Site Code": "id",
      Language: "id-ID", "Page Type": "Home", "Page URL": "https://www.ezviz.com/id", Product: "",
      Title: "EZVIZ Indonesia", Description: "Deskripsi", Keywords: "ezviz", Action: "skip", Notes: ""
    }
  ]);
  t.after(() => fs.rmSync(temp.dir, { recursive: true, force: true }));
  const parsed = parseTdkWorkbook(temp.filePath, sites);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows[0].urlPath, "/fr/product/camera/1#spec");
  assert.equal(parsed.rows[1].action, "skip");
  const groups = groupRowsBySite(parsed.rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].site.siteCode, "fr");
});

test("rejects a Page URL that belongs to another site", (t) => {
  const temp = writeSourceWorkbook([{
    "Record ID": "TDK-3", "Site URL": "https://www.ezviz.com/fr", "Site Code": "fr",
    Language: "fr-FR", "Page Type": "Home", "Page URL": "https://www.ezviz.com/id",
    Product: "", Title: "Title", Description: "Description", Keywords: "", Action: "update", Notes: ""
  }]);
  t.after(() => fs.rmSync(temp.dir, { recursive: true, force: true }));
  const parsed = parseTdkWorkbook(temp.filePath, sites);
  assert.ok(parsed.issues.some((issue) => issue.includes("Page URL 不属于站点 fr")));
});

test("writes the official backend import schema", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-output-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outputPath = path.join(dir, "import.xlsx");
  writeOfficialImportWorkbook([{
    urlPath: "/fr/product/camera/1", title: "Title", description: "Description", keywords: "camera"
  }], outputPath);
  const workbook = XLSX.readFile(outputPath);
  const data = XLSX.utils.sheet_to_json(workbook.Sheets.Worksheet, { header: 1, defval: "" });
  assert.deepEqual(data[0].slice(0, 4), ["url", "title", "description", "keyword"]);
  assert.deepEqual(data[1].slice(0, 4), ["/fr/product/camera/1", "Title", "Description", "camera"]);
});
