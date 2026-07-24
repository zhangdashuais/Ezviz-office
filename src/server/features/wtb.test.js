const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { applyWtbLinksToMap, parseWtbWorkbook } = require("./wtb");

function writeWorkbook(sheets) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wtb-test-"));
  const filePath = path.join(tempDir, "wtb.xlsx");
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  });
  XLSX.writeFile(workbook, filePath);
  return { tempDir, filePath };
}

test("WTB 模板解析配置页并跳过填写说明", (t) => {
  const temp = writeWorkbook([
    {
      name: "WTB配置",
      rows: [
        ["Product", "Product Page URL", "Channel", "Purchasing Link"],
        ["H8c", "https://www.ezviz.com/id/product/h8c/1", "Shopee", "https://shopee.co.id/h8c"]
      ]
    },
    {
      name: "填写说明",
      rows: [
        ["字段", "是否必填", "填写规范"],
        ["Product", "是", "产品名称"]
      ]
    }
  ]);
  t.after(() => fs.rmSync(temp.tempDir, { recursive: true, force: true }));
  assert.deepEqual(parseWtbWorkbook(temp.filePath), [{
    sheetNumber: 1,
    sheetName: "WTB配置",
    rowNumber: 2,
    productName: "H8c",
    productPageUrl: "https://www.ezviz.com/id/product/h8c/1",
    platform: "Shopee",
    url: "https://shopee.co.id/h8c"
  }]);
});

test("WTB 非说明工作表缺少必填表头时给出清晰错误", (t) => {
  const temp = writeWorkbook([{
    name: "错误数据",
    rows: [["Product", "Channel"], ["H8c", "Shopee"]]
  }]);
  t.after(() => fs.rmSync(temp.tempDir, { recursive: true, force: true }));
  assert.throws(
    () => parseWtbWorkbook(temp.filePath),
    /工作表“错误数据”的表头需要包含 Product、Channel、Purchasing Link/
  );
});

test("WTB 直接请求只更新目标平台链接并保留排序", () => {
  const current = {
    Amazon: { href_url: "https://old.example/amazon", sort: "10" },
    "Media Markt": { href_url: "https://old.example/mm", sort: "20" }
  };
  const result = applyWtbLinksToMap(current, [
    { platform: "amazon", url: "https://new.example/amazon" },
    { platform: "media-markt", url: "https://new.example/mm" }
  ]);

  assert.deepEqual(result.whereToBuy, {
    Amazon: { href_url: "https://new.example/amazon", sort: "10" },
    "Media Markt": { href_url: "https://new.example/mm", sort: "20" }
  });
  assert.equal(current.Amazon.href_url, "https://old.example/amazon");
});

test("WTB 直接请求拒绝后台未配置的平台", () => {
  assert.throws(
    () => applyWtbLinksToMap(
      { Amazon: { href_url: "", sort: "" } },
      [{ platform: "Shopee", url: "https://shopee.example/product" }]
    ),
    /后台未配置这些购买平台：Shopee.*当前可用平台：Amazon/
  );
});

test("WTB 渠道简称可以匹配带 Shop 或 Store 的后台平台", () => {
  const result = applyWtbLinksToMap({
    "TikTok Shop": { href_url: "", sort: "10" },
    Amazon: { href_url: "", sort: "20" }
  }, [
    { platform: "TIKtok", url: "https://shop.tiktok.example/product" },
    { platform: "Amazon Store", url: "https://amazon.example/product" }
  ]);

  assert.equal(result.whereToBuy["TikTok Shop"].href_url, "https://shop.tiktok.example/product");
  assert.equal(result.whereToBuy.Amazon.href_url, "https://amazon.example/product");
  assert.deepEqual(result.applied.map((item) => item.platform), ["TikTok Shop", "Amazon"]);
});

test("WTB 渠道简称命中多个后台平台时要求填写完整名称", () => {
  assert.throws(
    () => applyWtbLinksToMap({
      "TikTok Shop": { href_url: "", sort: "" },
      "TikTok Official Shop": { href_url: "", sort: "" }
    }, [{ platform: "TikTok", url: "https://shop.tiktok.example/product" }]),
    /TikTok（TikTok Shop, TikTok Official Shop）.*请填写更完整的渠道名称/
  );
});
