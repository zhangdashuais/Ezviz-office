const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  buildProductNameTemplate
} = require("./detail-address-replacement-routes");

test("Detail temporary operation template contains all supported columns", () => {
  const workbook = XLSX.read(buildProductNameTemplate(), { type: "buffer" });
  assert.deepEqual(workbook.SheetNames, ["Products"]);
  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets.Products,
    { header: 1, defval: "" }
  );
  assert.deepEqual(rows[0], [
    "Product_Name",
    "Old_Address_1",
    "New_Address_1",
    "Old_Address_2",
    "New_Address_2",
    "Delete_Code_Block"
  ]);
  assert.equal(rows.length, 1);
});
