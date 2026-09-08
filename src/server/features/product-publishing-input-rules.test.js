const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasCombinedPublishingSheets,
  productNameFromCombinedWorkbook
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
