const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeDetailFieldName,
  readDetailFieldsFromModel
} = require("./product-replacement");

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
