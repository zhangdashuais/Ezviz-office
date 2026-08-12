function registerProductRevisionSyncRoutes(app, deps) {
  const { upload, feature, batchFeature, delistingFeature, logLine } = deps;

  const excelArgs = (req) => {
    const specificationExcel = req.files?.specExcel?.[0];
    const languageDatasheet = req.files?.languageDatasheet?.[0];
    if (!specificationExcel) throw new Error("请上传 Specification Excel。");
    if (!languageDatasheet) throw new Error("请上传语言包 Datasheet。");
    return [req.body || {}, specificationExcel, languageDatasheet];
  };
  const batchArgs = (req) => [req.body || {}, req.files || []];
  const delistingArgs = (req) => [req.body || {}];

  async function handle(req, res, operation, label, buildArgs, allowServerError) {
    const logs = [];
    try {
      const result = await operation(...buildArgs(req), logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error?.message || String(error);
      logLine(logs, `${label}失败：${message}`);
      const status = allowServerError
        && !/请|不能|不存在|不正确|重复|不一致|最多|没有找到|没有识别/.test(message)
        ? 500 : 400;
      res.status(status).json({ ok: false, error: message, logs });
    }
  }

  const excelUpload = upload.fields([
    { name: "specExcel", maxCount: 1 },
    { name: "languageDatasheet", maxCount: 1 }
  ]);

  [
    ["/api/product-revision-sync/preview", excelUpload, feature.preview, "产品修订同步预览", excelArgs, true],
    ["/api/product-revision-sync/submit", excelUpload, feature.submit, "产品修订同步", excelArgs, true],
    ["/api/product-revision/preview", upload.none(), feature.previewDirectRevision, "产品局部修订预览", delistingArgs, true],
    ["/api/product-revision/submit", upload.none(), feature.submitDirectRevision, "产品局部修订", delistingArgs, true],
    ["/api/product-publishing/preview", excelUpload, feature.previewPublishing, "产品上架预览", excelArgs, true],
    ["/api/product-publishing/submit", excelUpload, feature.submitPublishing, "产品上架", excelArgs, true],
    ["/api/product-publishing/batch-preview", upload.array("productFiles", 40), batchFeature.preview, "批量产品上架预览", batchArgs],
    ["/api/product-publishing/batch-submit", upload.array("productFiles", 40), batchFeature.submit, "批量产品上架", batchArgs],
    ["/api/product-delisting/preview", upload.none(), delistingFeature.preview, "产品下架预览", delistingArgs],
    ["/api/product-delisting/submit", upload.none(), delistingFeature.submit, "产品下架", delistingArgs]
  ].forEach(([path, middleware, operation, label, buildArgs, allowServerError]) => {
    app.post(path, middleware, (req, res) =>
      handle(req, res, operation, label, buildArgs, allowServerError));
  });
}

module.exports = { registerProductRevisionSyncRoutes };
