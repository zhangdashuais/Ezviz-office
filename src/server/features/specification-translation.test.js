const test = require("node:test");
const assert = require("node:assert/strict");
const { replaceSpecificationTerms } = require("./specification-translation");

test("replaces singular and plural Specification with one localized term", () => {
  const result = replaceSpecificationTerms(
    "<h2>Specifications</h2><a>Specification</a><p>specification-grade</p>",
    "Spécifications"
  );
  assert.equal(result.replaced, 3);
  assert.equal(result.generatedHtml, "<h2>Spécifications</h2><a>Spécifications</a><p>Spécifications-grade</p>");
});

test("does not replace a Specification substring inside another word", () => {
  const result = replaceSpecificationTerms("<p>respecification</p>", "Datenblatt");
  assert.equal(result.replaced, 0);
});

test("requires a translated term", () => {
  assert.throws(() => replaceSpecificationTerms("Specification", "  "), /没有从参考详情页取得/);
});
