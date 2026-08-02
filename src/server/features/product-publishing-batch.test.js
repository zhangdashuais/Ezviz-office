const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fileKind,
  productNameFromPath,
  groupProductFiles
} = require("./product-publishing-batch");

test("recognizes Datasheet and Specifications files in a selected folder", () => {
  assert.equal(fileKind("Products/CP8/CP8 Datasheet.xlsx"), "datasheet");
  assert.equal(fileKind("Products/CP8/CP8 Specifications.xlsx"), "specification");
  assert.equal(fileKind("Products/readme.txt"), "");
  assert.equal(productNameFromPath("Products/CP8/CP8 Datasheet.xlsx"), "CP8");
  assert.equal(productNameFromPath("Products/EB3 Datasheet.xlsx"), "EB3");
});

test("groups exactly one Datasheet and Specifications workbook per product", () => {
  const files = [
    { originalname: "0000__CP8_Datasheet.xlsx", path: "a" },
    { originalname: "0001__CP8_Specifications.xlsx", path: "b" },
    { originalname: "0002__EB3_Datasheet.xlsx", path: "c" },
    { originalname: "0003__EB3_Specifications.xlsx", path: "d" }
  ];
  const manifest = [
    { uploadName: files[0].originalname, relativePath: "Products/CP8/CP8 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "Products/CP8/CP8 Specifications.xlsx" },
    { uploadName: files[2].originalname, relativePath: "Products/EB3 Datasheet.xlsx" },
    { uploadName: files[3].originalname, relativePath: "Products/EB3 Specifications.xlsx" }
  ];
  const products = groupProductFiles(files, manifest);
  assert.deepEqual(products.map((item) => item.productName), ["CP8", "EB3"]);
  assert.equal(products[0].files.datasheet.path, "a");
  assert.equal(products[0].files.specification.path, "b");
});

test("rejects an incomplete product folder", () => {
  assert.throws(() => groupProductFiles(
    [{ originalname: "0000__CP8_Datasheet.xlsx", path: "a" }],
    [{ uploadName: "0000__CP8_Datasheet.xlsx", relativePath: "Products/CP8 Datasheet.xlsx" }]
  ), /缺少 Specifications/);
});
