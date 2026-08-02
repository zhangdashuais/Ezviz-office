const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseProductNames,
  parseSiteCodes,
  stateFingerprint
} = require("./product-delisting");

test("product delisting accepts multiple de-duplicated products and sites", () => {
  assert.deepEqual(parseProductNames("CP8\nEB3，cp8"), ["CP8", "EB3"]);
  assert.deepEqual(parseSiteCodes('[{"siteCode":"fr"},{"siteCode":"de"}]'), ["fr", "de"]);
});

test("product delisting fingerprint changes with either backend field", () => {
  const initial = stateFingerprint({ goodsId: "1", isSearchable: true, whenType: 2 });
  assert.notEqual(initial, stateFingerprint({ goodsId: "1", isSearchable: false, whenType: 2 }));
  assert.notEqual(initial, stateFingerprint({ goodsId: "1", isSearchable: true, whenType: 0 }));
});
