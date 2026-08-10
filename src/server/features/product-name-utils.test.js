const test = require("node:test");
const assert = require("node:assert/strict");
const { parseProductNames } = require("./product-name-utils");

test("批量产品名称支持换行和中英文分隔符，并忽略重复项", () => {
  assert.deepEqual(
    parseProductNames("CP8\nH8c，EB3; cp8；DL05"),
    ["CP8", "H8c", "EB3", "DL05"]
  );
  assert.deepEqual(parseProductNames(["CP8", "H8c\nEB3"]), ["CP8", "H8c", "EB3"]);
});
