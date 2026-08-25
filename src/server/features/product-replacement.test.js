const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeDetailFieldName,
  readDetailFieldsFromModel,
  parseProductNames
} = require("./product-replacement");

test("批量产品名称支持换行和中英文分隔符，并忽略重复项", () => {
  assert.deepEqual(
    parseProductNames("CP8\nH8c，EB3; cp8；DL05"),
    ["CP8", "H8c", "EB3", "DL05"]
  );
  assert.deepEqual(parseProductNames(["CP8", "H8c\nEB3"]), ["CP8", "H8c", "EB3"]);
});

test("Detail 字段名匹配忽略大小写、空格和连接符", () => {
  assert.equal(normalizeDetailFieldName("  Specifi-cations "), "specifications");
  assert.equal(normalizeDetailFieldName("SPECIFICATIONS"), "specifications");
});

test("只读取 Detail 的 Overview 和 Specifications", () => {
  const result = readDetailFieldsFromModel({
    pcView: {
      summary: "<section>Overview HTML</section>",
      functionality: "<p>不应返回</p>",
      detail: "<p>不应作为 Specifications 返回</p>",
      customs: [
        { name: "FAQ", value: "<p>FAQ</p>" },
        { name: "Specifications", value: "<table><tr><td>Spec</td></tr></table>" }
      ]
    },
    mobileView: {
      summary: "<p>Mobile Overview 不应返回</p>"
    }
  });

  assert.deepEqual(result, {
    overview: "<section>Overview HTML</section>",
    specifications: "<table><tr><td>Spec</td></tr></table>",
    overviewFound: true,
    specificationsFound: true,
    specificationsFieldName: "Specifications"
  });
});

test("Specifications 不存在时不回退到其他 Detail 字段", () => {
  const result = readDetailFieldsFromModel({
    pcView: {
      summary: "<p>Overview</p>",
      detail: "<p>Detailed Parameters</p>",
      customs: [{ name: "FAQ", value: "<p>FAQ</p>" }]
    }
  });
  assert.equal(result.specifications, "");
  assert.equal(result.specificationsFound, false);
});

test("Detail 规格字段兼容单数并优先复数命名", () => {
  const singular = readDetailFieldsFromModel({
    pcView: { summary: "", customs: [{ name: "Specification", value: "single" }] }
  });
  assert.equal(singular.specifications, "single");
  assert.equal(singular.specificationsFieldName, "Specification");

  const both = readDetailFieldsFromModel({
    pcView: { customs: [
      { name: "Specification", value: "single" },
      { name: "Specifications", value: "plural" }
    ] }
  });
  assert.equal(both.specifications, "plural");
  assert.equal(both.specificationsFieldName, "Specifications");
});

test("Detail 规格字段兼容已记录的本地化命名", () => {
  const result = readDetailFieldsFromModel({
    pcView: {
      summary: "",
      customs: [{ name: "Spécifications", value: "contenu" }]
    }
  });
  assert.equal(result.specificationsFound, true);
  assert.equal(result.specifications, "contenu");
  assert.equal(result.specificationsFieldName, "Spécifications");
});
