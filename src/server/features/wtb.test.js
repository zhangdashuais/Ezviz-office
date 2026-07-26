const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const {
  applyWtbLinksToMap,
  parseWtbWorkbook,
  createWtbFeature
} = require("./wtb");

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

function createPlanFeature() {
  const config = {
    sites: [
      { name: "Viet Nam", siteCode: "vn", url: "https://www.ezviz.com/vn", enabled: true },
      { name: "Indonesia", siteCode: "id", url: "https://www.ezviz.com/id", enabled: true }
    ]
  };
  return createWtbFeature({
    fs,
    path,
    readCampaignConfig: () => config,
    requireSingleCampaignSite(currentConfig, body) {
      const codes = Array.isArray(body.sites) ? body.sites : JSON.parse(body.sites || "[]");
      if (codes.length !== 1) throw new Error("WTB 一次只允许选择一个站点。");
      return currentConfig.sites.find((site) => site.siteCode === codes[0]);
    }
  });
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

test("WTB 使用下拉框选择的单个站点，并校验 Product Page URL 与其一致", (t) => {
  const temp = writeWorkbook([{
    name: "WTB配置",
    rows: [
      ["Product", "Product Page URL", "Channel", "Purchasing Link"],
      ["H8c", "https://www.ezviz.com/vn/product/h8c/1", "TikTok Shop", "https://shop.example/h8c"]
    ]
  }]);
  t.after(() => fs.rmSync(temp.tempDir, { recursive: true, force: true }));
  const feature = createPlanFeature();

  const plan = feature.buildWtbPlan(
    { sites: JSON.stringify(["vn"]) },
    { excel: [{ path: temp.filePath }] }
  );
  assert.equal(plan.site.siteCode, "vn");
  assert.equal(plan.siteSource, "manual-selection-validated-by-product-page-url");

  assert.throws(
    () => feature.buildWtbPlan(
      { sites: JSON.stringify(["id"]) },
      { excel: [{ path: temp.filePath }] }
    ),
    /Product Page URL 属于 Viet Nam \(vn\).*与下拉框选择的 Indonesia \(id\) 不一致/
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

test("WTB 前台平台跳转允许同域重定向路径但拒绝错误电商域名", () => {
  const { retailerTargetMatches } = createPlanFeature()._test;
  assert.equal(
    retailerTargetMatches(
      "https://shop.tiktok.com/view/product/123",
      "https://shop.tiktok.com/view/product/123?region=VN"
    ),
    true
  );
  assert.equal(
    retailerTargetMatches(
      "https://www.lazada.vn/products/example.html",
      "https://www.tiki.vn/products/example.html"
    ),
    false
  );
});

test("WTB 重复行相同时跳过，冲突链接只跳过对应产品", () => {
  const { groupWtbRows } = createPlanFeature()._test;
  const products = groupWtbRows([
    {
      productName: "H1c",
      productPageUrl: "https://www.ezviz.com/vn/product/h1c/1",
      platform: "TikTok Shop",
      url: "https://shop.tiktok.com/product/1",
      rowNumber: 2
    },
    {
      productName: "H1c",
      productPageUrl: "",
      platform: "tiktok-shop",
      url: "https://shop.tiktok.com/product/1",
      rowNumber: 3
    },
    {
      productName: "H1c",
      productPageUrl: "",
      platform: "TikTok",
      url: "https://shop.tiktok.com/product/2",
      rowNumber: 4
    },
    {
      productName: "TY1 Pro 2K",
      productPageUrl: "",
      platform: "Lazada",
      url: "https://www.lazada.vn/products/ty1.html",
      rowNumber: 5
    }
  ]);
  assert.equal(products.length, 2);
  assert.equal(products[0].links.length, 1);
  assert.equal(products[0].duplicateRowsSkipped.length, 1);
  assert.equal(products[0].inputErrors.length, 1);
  assert.equal(products[1].inputErrors.length, 0);
});

test("WTB 错误分类区分产品缺失、平台缺失、超时和保存错误", () => {
  const { classifyWtbProductError } = createPlanFeature()._test;
  assert.equal(classifyWtbProductError("没有在产品列表中找到产品：H1c"), "product-not-found");
  assert.equal(classifyWtbProductError("后台未配置这些购买平台：Tiki"), "platform-not-available");
  assert.equal(classifyWtbProductError("Timeout 30000ms exceeded"), "timeout");
  assert.equal(classifyWtbProductError("产品保存接口返回异常"), "save-error");
});
