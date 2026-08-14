const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../../../办公软件/111/src/language-column-filter-rules.js");

test("detects datasheet and specification language blocks", () => {
  const datasheet = rules.detectLanguageBlocks(["", "1_English (English-英文)", "2_Русский (Russian-俄语)"], "datasheet");
  const specification = rules.detectLanguageBlocks(["1_English (English-英文)", "", "2_Русский (Russian-俄语)", ""], "specification");
  assert.deepEqual(rules.selectedColumns("datasheet", datasheet.english, datasheet.blocks[1]), [0, 1, 2]);
  assert.deepEqual(rules.selectedColumns("specification", specification.english, specification.blocks[1]), [0, 1, 2, 3]);
});

test("recognizes the standalone OK status row", () => {
  assert.equal(rules.isStatusRow(["OK", "OK"]), true);
  assert.equal(rules.isStatusRow(["OK", "Caméra"]), false);
  assert.equal(rules.isStatusRow(["", ""]), false);
});
