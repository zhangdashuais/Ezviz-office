const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createEcadminPlatformFeature } = require("./ecadmin-platform");

test("language completion can run without creating download material", async () => {
  let visitedUrl = "";
  const fills = [];
  const response = {
    url() { return "https://ecadmin-api.ys7.com/api/route/euJavaApi/json/support/ecadmin/download_info_extend/batch_create"; },
    ok() { return true; },
    status() { return 200; },
    async text() { return JSON.stringify({ code: 200, data: { count: 3 } }); }
  };
  const searchInput = {
    async count() { return 1; },
    async fill(value) { fills.push(["search", value]); }
  };
  const languageTitleInput = {
    async count() { return 1; },
    async fill(value) { fills.push(["languageTitle", value]); }
  };
  const extendButton = {
    async count() { return 1; },
    async click() {}
  };
  const dialog = {
    async count() { return 1; },
    locator() { return { first: () => languageTitleInput }; },
    getByRole() { return { async click() {} }; }
  };
  const row = {
    async innerText() { return "EP8 Ultra Product Datasheet 启用"; },
    getByRole() { return extendButton; }
  };
  const existingPage = {
    url() { return "https://ecadmin.ys7.com/"; },
    setDefaultTimeout() {},
    async goto(url) { visitedUrl = url; },
    async waitForTimeout() {},
    locator(selector) {
      if (selector === 'input[placeholder="标题"]') return { first: () => searchInput };
      if (selector === "tr") {
        return {
          async evaluateAll() { return 0; },
          nth() { return row; }
        };
      }
      if (selector.includes("el-dialog")) return { last: () => dialog };
      throw new Error("Unexpected locator: " + selector);
    },
    getByRole() { return { async click() {} }; },
    async waitForResponse() { return response; }
  };
  const context = {
    pages: () => [existingPage],
    async newPage() { return existingPage; }
  };
  const feature = createEcadminPlatformFeature({
    path,
    logLine(logs, message) { logs.push(message); },
    normalizeBool(value) { return value === true || value === "1"; },
    visibleText() {},
    clickFormSelect() {},
    clickVisibleOption() {},
    formItemText() {},
    setFileByLabel() {},
    async ensureLoggedIn() {},
    async getContext() { return context; },
    SHAREPOINT_DEFAULTS: { translationRoot: "translation", materialRoot: "material" }
  });

  const result = await feature.runEcadminPlatform({
    title: "EP8 Ultra",
    createDownload: "0",
    extendLanguages: "1",
    updateProductImage: "0",
    sharePoint: "0"
  }, { allFiles: [] }, []);

  assert.deepEqual(fills, [["search", "EP8 Ultra"], ["languageTitle", "EP8 Ultra"]]);
  assert.equal(result.languageCompletion.count, 3);
  assert.equal(result.languageCompletion.title, "EP8 Ultra");
  assert.match(result.languageCompletion.listUrl, /SupportDownloadInfoList/);
});

test("SharePoint archive rejects a material category outside the fixed list", async () => {
  const feature = createEcadminPlatformFeature({
    path,
    logLine() {},
    normalizeBool(value) { return value === true || value === "1"; },
    getContext() { throw new Error("不应打开浏览器"); },
    SHAREPOINT_DEFAULTS: { translationRoot: "translation", materialRoot: "material" }
  });

  await assert.rejects(() => feature.runEcadminPlatform({
    title: "EP8 Ultra",
    sharePoint: "1",
    materialCategory: "05_Other"
  }, { allFiles: [] }, []), /素材类目不在允许范围/);
});
