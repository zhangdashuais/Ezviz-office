const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasCombinedPublishingSheets,
  productNameFromCombinedWorkbook,
  publishingWorkbookInfo,
  publishingProductMatchKey
} = require("../../../办公软件/111/src/product-publishing-input-rules");

test("detects and names a combined Europe-drive publishing workbook", () => {
  assert.equal(hasCombinedPublishingSheets(["Datasheet", "Specification"]), true);
  assert.equal(hasCombinedPublishingSheets(["Notes", "Datasheet", "Specifications"]), true);
  assert.equal(hasCombinedPublishingSheets(["Datasheet"]), false);
  assert.equal(productNameFromCombinedWorkbook("TY1 G1 3K 网站翻译表.xlsx"), "TY1 G1 3K");
  assert.equal(
    productNameFromCombinedWorkbook("CB90f Triple Kit 3K - Website.xlsx"),
    "CB90f Triple Kit 3K"
  );
});

test("parses batch workbook type and product name from the filename", () => {
  assert.deepEqual(publishingWorkbookInfo("Folder/CP8 datasheet.xlsx"), {
    kind: "datasheet", productName: "CP8"
  });
  assert.deepEqual(publishingWorkbookInfo("Folder/CP8 spec.xlsx"), {
    kind: "specification", productName: "CP8"
  });
  assert.deepEqual(publishingWorkbookInfo("CP8 Specifications_VN_revised.xlsx"), {
    kind: "specification", productName: "CP8"
  });
  assert.deepEqual(publishingWorkbookInfo("Spectra datasheet.xlsx"), {
    kind: "datasheet", productName: "Spectra"
  });
  assert.deepEqual(publishingWorkbookInfo("readme.txt"), { kind: "", productName: "" });
  assert.equal(
    publishingProductMatchKey("CB90 Dual 3K Kit"),
    publishingProductMatchKey("CB90 Dual Kit 3K")
  );
});
