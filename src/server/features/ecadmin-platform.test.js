const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
    fs,
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
  });

  const result = await feature.runEcadminPlatform({
    title: "EP8 Ultra",
    createDownload: "0",
    extendLanguages: "1",
    updateProductImage: "0",
  }, []);

  assert.deepEqual(fills, [["search", "EP8 Ultra"], ["languageTitle", "EP8 Ultra"]]);
  assert.equal(result.languageCompletion.count, 3);
  assert.equal(result.languageCompletion.title, "EP8 Ultra");
  assert.match(result.languageCompletion.listUrl, /SupportDownloadInfoList/);
});

test("local upload files are selected from the matching product folder", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecadmin-product-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const upload = path.join(root, "TY1 G1 3K", "upload");
  fs.mkdirSync(upload, { recursive: true });
  fs.writeFileSync(path.join(upload, "TY1 G1 3K-Datasheet.pdf"), "pdf");
  fs.writeFileSync(path.join(upload, "高清图.png"), "png");
  fs.writeFileSync(path.join(upload, "pc_banner.png"), "banner");
  const feature = createEcadminPlatformFeature({
    fs,
    path,
    logLine() {},
    normalizeBool(value) { return value === true || value === "1"; },
    productRoot: root
  });

  const files = feature.inspectLocalFiles("ty1 g1 3k");
  assert.equal(files.datasheet.originalname, "TY1 G1 3K-Datasheet.pdf");
  assert.equal(files.highResImage.originalname, "高清图.png");
  assert.equal(files.allFiles.length, 3);
});
