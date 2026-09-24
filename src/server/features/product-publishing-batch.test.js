const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fileKind,
  productNameFromPath,
  uploadSequence,
  groupProductFiles,
  createProductPublishingBatchFeature
} = require("./product-publishing-batch");

test("recognizes Datasheet and Specifications files in a selected folder", () => {
  assert.equal(fileKind("Products/CP8/CP8 Datasheet.xlsx"), "datasheet");
  assert.equal(fileKind("Products/CP8/CP8 Specifications.xlsx"), "specification");
  assert.equal(fileKind("Products/readme.txt"), "");
  assert.equal(productNameFromPath("Products/CP8/CP8 Datasheet.xlsx"), "CP8");
  assert.equal(productNameFromPath("Products/DL50/DL50FVS Plus(5085)_datasheet.xlsx"), "DL50FVS Plus(5085)");
  assert.equal(productNameFromPath("Products/DL50/DL50FVS Plus(5085)_spec.xlsx"), "DL50FVS Plus(5085)");
  assert.equal(productNameFromPath("Products/EB3 Datasheet.xlsx"), "EB3");
  assert.equal(productNameFromPath("Products/ignored-folder/EB3 Spec_VN_revised.xlsx"), "EB3");
});

test("pairs workbooks by the normalized product name in each filename", () => {
  const files = [
    { originalname: "0000__CB90 Dual 3K Kit datasheet.xlsx", path: "a" },
    { originalname: "0001__CB90 Dual 3K Kit spec.xlsx", path: "b" }
  ];
  const products = groupProductFiles(files, [
    { uploadName: files[0].originalname, relativePath: "Folder A/CB90 Dual 3K Kit datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "Folder B/CB90 Dual 3K Kit spec.xlsx" }
  ]);
  assert.equal(products.length, 1);
  assert.equal(products[0].productName, "CB90 Dual 3K Kit");
});

test("pairs regional suffixes and reordered product words", () => {
  const files = [
    { originalname: "0000__CB90 Dual 3K Kit datasheet_VN_revised.xlsx", path: "a" },
    { originalname: "0001__CB90 Dual Kit 3K Spec_VN_revised.xlsx", path: "b" }
  ];
  const products = groupProductFiles(files, [
    { uploadName: files[0].originalname, relativePath: files[0].originalname.slice(6) },
    { uploadName: files[1].originalname, relativePath: files[1].originalname.slice(6) }
  ]);
  assert.equal(products.length, 1);
  assert.equal(products[0].productName, "CB90 Dual 3K Kit");
});

test("groups exactly one Datasheet and Specifications workbook per product", () => {
  const files = [
    { originalname: "0000__CP8_Datasheet.xlsx", path: "a" },
    { originalname: "0001__CP8_Specifications.xlsx", path: "b" },
    { originalname: "0002__EB3_Datasheet.xlsx", path: "c" },
    { originalname: "0003__EB3_Specifications.xlsx", path: "d" }
  ];
  const manifest = [
    { uploadName: files[0].originalname, relativePath: "Products/CP8/CP8 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "Products/CP8/CP8 Specifications.xlsx" },
    { uploadName: files[2].originalname, relativePath: "Products/EB3 Datasheet.xlsx" },
    { uploadName: files[3].originalname, relativePath: "Products/EB3 Specifications.xlsx" }
  ];
  const products = groupProductFiles(files, manifest);
  assert.deepEqual(products.map((item) => item.productName), ["CP8", "EB3"]);
  assert.equal(products[0].files.datasheet.path, "a");
  assert.equal(products[0].files.specification.path, "b");
});

test("rejects an incomplete product folder", () => {
  assert.throws(() => groupProductFiles(
    [{ originalname: "0000__CP8_Datasheet.xlsx", path: "a" }],
    [{ uploadName: "0000__CP8_Datasheet.xlsx", relativePath: "Products/CP8 Datasheet.xlsx" }]
  ), /缺少 Specifications/);
});

test("batch preview enables submission when at least one target is executable", async () => {
  const feature = createProductPublishingBatchFeature({
    logLine() {},
    revisionFeature: {
      async previewPublishing() {
        return { readyCount: 1, failedCount: 1 };
      }
    }
  });
  const files = [
    { originalname: "0000__S10_Datasheet.xlsx", path: "a" },
    { originalname: "0001__S10_Specifications.xlsx", path: "b" }
  ];
  const manifest = JSON.stringify([
    { uploadName: files[0].originalname, relativePath: "S10/S10 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "S10/S10 Specifications.xlsx" }
  ]);
  const result = await feature.preview({ batchManifest: manifest }, files, []);
  assert.equal(result.readyCount, 1);
  assert.equal(result.partialCount, 1);
  assert.equal(result.results[0].status, "partial");
});

test("batch preview stays disabled when every target failed", async () => {
  const feature = createProductPublishingBatchFeature({
    logLine() {},
    revisionFeature: {
      async previewPublishing() {
        return { readyCount: 0, failedCount: 1 };
      }
    }
  });
  const files = [
    { originalname: "0000__S10_Datasheet.xlsx", path: "a" },
    { originalname: "0001__S10_Specifications.xlsx", path: "b" }
  ];
  const manifest = JSON.stringify([
    { uploadName: files[0].originalname, relativePath: "S10/S10 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "S10/S10 Specifications.xlsx" }
  ]);
  const result = await feature.preview({ batchManifest: manifest }, files, []);
  assert.equal(result.readyCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.results[0].status, "failed");
});

test("groups plus and superscript-plus filenames as one product", () => {
  const files = [
    { originalname: "data.xlsx", path: "a" },
    { originalname: "spec.xlsx", path: "b" }
  ];
  const products = groupProductFiles(files, [
    { uploadName: "data.xlsx", relativePath: "Products/CP1 Pro 2K+/CP1 Pro 2K+ Datasheet.xlsx" },
    { uploadName: "spec.xlsx", relativePath: "Products/CP1 Pro 2K\u207a/CP1 Pro 2K\u207a Spec.xlsx" }
  ]);
  assert.equal(products.length, 1);
  assert.equal(products[0].productName, "CP1 Pro 2K+");
  assert.ok(products[0].files.datasheet);
  assert.ok(products[0].files.specification);
});

test("matches uploaded Unicode filenames by their stable upload sequence", () => {
  const files = [
    { originalname: "0000__CP1 Pro 2Kâº datasheet.xlsx", path: "a" },
    { originalname: "0001__CP1 Pro 2Kâº spec.xlsx", path: "b" }
  ];
  const products = groupProductFiles(files, [
    {
      uploadName: "0000__CP1 Pro 2K\u207a datasheet.xlsx",
      relativePath: "test/CP1 Pro 2K\u207a datasheet.xlsx"
    },
    {
      uploadName: "0001__CP1 Pro 2K\u207a spec.xlsx",
      relativePath: "test/CP1 Pro 2K\u207a spec.xlsx"
    }
  ]);
  assert.equal(uploadSequence(files[0].originalname), "0000");
  assert.equal(products.length, 1);
  assert.equal(products[0].productName, "CP1 Pro 2K\u207a");
  assert.equal(products[0].files.datasheet.path, "a");
  assert.equal(products[0].files.specification.path, "b");
});

test("batch submit uploads one merged language package before publishing products", async () => {
  const calls = [];
  const feature = createProductPublishingBatchFeature({
    logLine() {},
    revisionFeature: {
      async submitPublishingLanguagePackageBatch(body, entries, fingerprints) {
        calls.push(["language", body.productName, entries.map((entry) => entry.productName), fingerprints]);
      },
      async submitPublishingWithoutLanguagePackage(body) {
        calls.push(["product", body.productName]);
        return { failedCount: 0 };
      }
    }
  });
  const files = [
    { originalname: "0000__CP8_Datasheet.xlsx", path: "a" },
    { originalname: "0001__CP8_Specifications.xlsx", path: "b" },
    { originalname: "0002__HP8_Datasheet.xlsx", path: "c" },
    { originalname: "0003__HP8_Specifications.xlsx", path: "d" }
  ];
  const batchManifest = JSON.stringify([
    { uploadName: files[0].originalname, relativePath: "Products/CP8/CP8 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "Products/CP8/CP8 Specifications.xlsx" },
    { uploadName: files[2].originalname, relativePath: "Products/HP8/HP8 Datasheet.xlsx" },
    { uploadName: files[3].originalname, relativePath: "Products/HP8/HP8 Specifications.xlsx" }
  ]);
  const preview = (productName) => ({
    workbook: { fingerprint: `${productName}-spec` },
    languageDatasheet: { fingerprint: `${productName}-data` },
    results: [{
      site: { siteCode: "fr" },
      copySource: { sourceFingerprint: `${productName}-source` },
      languagePackage: { sourceFingerprint: "fr-package" }
    }]
  });
  await feature.submit({
    batchManifest,
    expectedBatchPreviews: JSON.stringify({ CP8: preview("CP8"), HP8: preview("HP8") })
  }, files, []);
  assert.deepEqual(calls, [
    ["language", "CP8", ["CP8", "HP8"], { fr: "fr-package" }],
    ["product", "CP8"],
    ["product", "HP8"]
  ]);
});

test("batch submit continues product publishing when language package processing fails", async () => {
  const calls = [];
  const feature = createProductPublishingBatchFeature({
    logLine() {},
    revisionFeature: {
      async submitPublishingLanguagePackageBatch() {
        throw new Error("one cell could not be updated");
      },
      async submitPublishingWithoutLanguagePackage(body) {
        calls.push(body.productName);
        return { failedCount: 0 };
      }
    }
  });
  const files = [
    { originalname: "0000__CP8_Datasheet.xlsx", path: "a" },
    { originalname: "0001__CP8_Specifications.xlsx", path: "b" }
  ];
  const batchManifest = JSON.stringify([
    { uploadName: files[0].originalname, relativePath: "CP8/CP8 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "CP8/CP8 Specifications.xlsx" }
  ]);
  const result = await feature.submit({
    batchManifest,
    expectedBatchPreviews: JSON.stringify({
      CP8: { workbook: {}, languageDatasheet: {}, results: [] }
    })
  }, files, []);
  assert.deepEqual(calls, ["CP8"]);
  assert.equal(result.completedCount, 1);
  assert.match(result.warnings[0].message, /继续执行/);
});

test("batch submit retries once when the shop browser closes", async () => {
  let attempts = 0;
  const feature = createProductPublishingBatchFeature({
    logLine() {},
    revisionFeature: {
      async submitPublishingLanguagePackageBatch() {},
      async submitPublishingWithoutLanguagePackage() {
        attempts += 1;
        if (attempts === 1) throw new Error("Target page, context or browser has been closed");
        return { failedCount: 0 };
      }
    }
  });
  const files = [
    { originalname: "0000__CP8_Datasheet.xlsx", path: "a" },
    { originalname: "0001__CP8_Specifications.xlsx", path: "b" }
  ];
  const batchManifest = JSON.stringify([
    { uploadName: files[0].originalname, relativePath: "CP8/CP8 Datasheet.xlsx" },
    { uploadName: files[1].originalname, relativePath: "CP8/CP8 Specifications.xlsx" }
  ]);
  const result = await feature.submit({
    batchManifest,
    expectedBatchPreviews: JSON.stringify({ CP8: { workbook: {}, languageDatasheet: {}, results: [] } })
  }, files, []);
  assert.equal(attempts, 2);
  assert.equal(result.completedCount, 1);
});
