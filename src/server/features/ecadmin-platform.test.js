const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createEcadminPlatformFeature } = require("./ecadmin-platform");

test("language extension can run without creating download material", async () => {
  let visitedUrl = "";
  const existingPage = {
    url() { return "about:blank"; },
    setDefaultTimeout() {}
  };
  const extensionPage = {
    async goto(url) { visitedUrl = url; },
    async waitForTimeout() {},
    async close() {}
  };
  const context = {
    pages: () => [existingPage],
    async newPage() { return extensionPage; }
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
    ensureLoggedIn() {},
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

  const url = new URL(visitedUrl);
  assert.equal(url.searchParams.get("language_title"), "EP8 Ultra");
  assert.equal(url.searchParams.has("download_id"), false);
  assert.equal(result.extendUrl, visitedUrl);
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
