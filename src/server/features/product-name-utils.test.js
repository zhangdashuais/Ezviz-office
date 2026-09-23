const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeProductNameForMatch,
  productNameSearchVariants,
  parseProductNames
} = require("./product-name-utils");

test("批量产品名称支持换行和中英文分隔符，并忽略重复项", () => {
  assert.deepEqual(
    parseProductNames("CP8\nH8c，EB3; cp8；DL05"),
    ["CP8", "H8c", "EB3", "DL05"]
  );
  assert.deepEqual(parseProductNames(["CP8", "H8c\nEB3"]), ["CP8", "H8c", "EB3"]);
});

test("产品名称匹配统一普通、全角和角标加号", () => {
  assert.equal(
    normalizeProductNameForMatch("CP1 Pro 2K\u207a"),
    normalizeProductNameForMatch("CP1  Pro  2K+")
  );
  assert.equal(normalizeProductNameForMatch("CP1 Pro 2K＋"), "cp1 pro 2k+");
  assert.equal(
    normalizeProductNameForMatch("DL50FVS Plus(5085)"),
    normalizeProductNameForMatch("DL50FVS Plus (5085)")
  );
  assert.deepEqual(productNameSearchVariants("CP1 Pro 2K+"), [
    "CP1 Pro 2K+",
    "CP1 Pro 2K\u207a"
  ]);
  assert.deepEqual(parseProductNames("CP1 Pro 2K+\nCP1 Pro 2K\u207a"), ["CP1 Pro 2K+"]);
});

test("产品名称搜索同时兼容括号前的后台空格", () => {
  assert.deepEqual(
    productNameSearchVariants("DL50FVS Plus(5085)"),
    ["DL50FVS Plus(5085)", "DL50FVS Plus (5085)"]
  );
});
