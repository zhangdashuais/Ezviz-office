const path = require("path");

const MAX_BATCH_PRODUCTS = 20;

function normalize(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function parseManifest(value) {
  let manifest = value;
  if (typeof manifest === "string") {
    try {
      manifest = JSON.parse(manifest);
    } catch {
      throw new Error("产品文件夹清单格式不正确。");
    }
  }
  if (!Array.isArray(manifest) || !manifest.length) {
    throw new Error("请选择包含产品资料的文件夹。");
  }
  return manifest;
}

function fileKind(relativePath) {
  const name = path.basename(String(relativePath || "")).toLowerCase();
  if (!/\.xlsx?$/.test(name)) return "";
  if (/specifications?|(?:^|[\s_-])spec(?:[\s_.-]|$)/i.test(name)) return "specification";
  if (/datasheet/i.test(name)) return "datasheet";
  return "";
}

function productNameFromPath(relativePath) {
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length > 2) return normalize(segments[segments.length - 2]);
  const base = path.basename(normalizedPath, path.extname(normalizedPath));
  return normalize(base
    .replace(/\b(?:product[\s_-]*)?datasheet\b/ig, "")
    .replace(/\b(?:product[\s_-]*)?specifications?\b/ig, "")
    .replace(/(?:^|[\s_-])spec(?:[\s_-]|$)/ig, " ")
    .replace(/[\s_-]+$/g, ""));
}

function groupProductFiles(files, manifestValue) {
  const manifest = parseManifest(manifestValue);
  const uploadedByName = new Map((files || []).map((file) => [file.originalname, file]));
  const groups = new Map();
  manifest.forEach((entry) => {
    const uploadName = normalize(entry?.uploadName);
    const relativePath = normalize(entry?.relativePath);
    const kind = fileKind(relativePath);
    if (!kind) return;
    const file = uploadedByName.get(uploadName);
    if (!file) throw new Error(`文件夹清单中的文件没有上传成功：${relativePath}`);
    const productName = productNameFromPath(relativePath);
    if (!productName) throw new Error(`无法从文件名识别产品名称：${relativePath}`);
    const key = productName.toLowerCase();
    const group = groups.get(key) || { productName, files: {}, relativePaths: {} };
    if (group.files[kind]) {
      throw new Error(`${productName} 存在多份 ${kind === "datasheet" ? "Datasheet" : "Specifications"} 文件。`);
    }
    group.files[kind] = file;
    group.relativePaths[kind] = relativePath;
    groups.set(key, group);
  });
  const products = [...groups.values()];
  if (!products.length) {
    throw new Error("文件夹中没有识别到 Datasheet 和 Specifications Excel。");
  }
  if (products.length > MAX_BATCH_PRODUCTS) {
    throw new Error(`一次最多上架 ${MAX_BATCH_PRODUCTS} 个产品，请分批执行。`);
  }
  products.forEach((product) => {
    if (!product.files.specification || !product.files.datasheet) {
      const missing = [
        !product.files.specification ? "Specifications" : "",
        !product.files.datasheet ? "Datasheet" : ""
      ].filter(Boolean).join("、");
      throw new Error(`${product.productName} 缺少 ${missing} Excel。`);
    }
  });
  return products.sort((left, right) => left.productName.localeCompare(right.productName));
}

function createProductPublishingBatchFeature(deps) {
  const { revisionFeature, logLine } = deps;

  async function preview(body, files, logs) {
    const products = groupProductFiles(files, body?.batchManifest);
    const results = [];
    for (const product of products) {
      try {
        logLine(logs, `预览上架产品：${product.productName}`);
        const result = await revisionFeature.previewPublishing(
          { ...(body || {}), productName: product.productName },
          product.files.specification,
          product.files.datasheet,
          logs
        );
        results.push({ status: result.failedCount ? "partial" : "ready", productName: product.productName, result });
      } catch (error) {
        results.push({ status: "failed", productName: product.productName, error: error?.message || String(error) });
      }
    }
    return {
      mode: "product-publishing-batch-preview",
      productCount: products.length,
      readyCount: results.filter((item) => item.status === "ready").length,
      partialCount: results.filter((item) => item.status === "partial").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results
    };
  }

  async function submit(body, files, logs) {
    const products = groupProductFiles(files, body?.batchManifest);
    let expected;
    try {
      expected = JSON.parse(String(body?.expectedBatchPreviews || "{}"));
    } catch {
      throw new Error("批量预览校验信息格式不正确，请重新预览。");
    }
    const results = [];
    for (const product of products) {
      const previewResult = expected[product.productName];
      if (!previewResult) {
        results.push({ status: "failed", productName: product.productName, error: "缺少该产品的预览校验信息，请重新预览。" });
        continue;
      }
      try {
        logLine(logs, `执行上架产品：${product.productName}`);
        const result = await revisionFeature.submitPublishing({
          ...(body || {}),
          productName: product.productName,
          expectedSourceFingerprint: previewResult.source?.fingerprint || "",
          expectedCopySourceFingerprints: JSON.stringify(Object.fromEntries(
            (previewResult.results || [])
              .filter((item) => item.copySource?.sourceFingerprint)
              .map((item) => [item.site.siteCode, item.copySource.sourceFingerprint])
          )),
          expectedWorkbookFingerprint: previewResult.workbook?.fingerprint || "",
          expectedLanguageDatasheetFingerprint: previewResult.languageDatasheet?.fingerprint || "",
          expectedLanguagePackageFingerprints: JSON.stringify(Object.fromEntries(
            (previewResult.results || [])
              .filter((item) => item.languagePackage?.sourceFingerprint)
              .map((item) => [item.site.siteCode, item.languagePackage.sourceFingerprint])
          ))
        }, product.files.specification, product.files.datasheet, logs);
        results.push({
          status: result.failedCount ? "partial" : "completed",
          productName: product.productName,
          result
        });
      } catch (error) {
        results.push({ status: "failed", productName: product.productName, error: error?.message || String(error) });
      }
    }
    return {
      mode: "product-publishing-batch-submit",
      productCount: products.length,
      completedCount: results.filter((item) => item.status === "completed").length,
      partialCount: results.filter((item) => item.status === "partial").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results
    };
  }

  return { preview, submit };
}

module.exports = {
  MAX_BATCH_PRODUCTS,
  fileKind,
  productNameFromPath,
  groupProductFiles,
  createProductPublishingBatchFeature
};
