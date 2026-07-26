function registerProductRevisionSyncRoutes(app, deps) {
  const { upload, feature, logLine } = deps;

  async function handle(req, res, operation, label) {
    const logs = [];
    try {
      const specificationExcel = req.files?.specExcel?.[0];
      const languageDatasheet = req.files?.languageDatasheet?.[0];
      if (!specificationExcel) throw new Error("请上传 Specification Excel。");
      if (!languageDatasheet) throw new Error("请上传语言包 Datasheet。");
      const result = await operation(
        req.body || {},
        specificationExcel,
        languageDatasheet,
        logs
      );
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error?.message || String(error);
      logLine(logs, `${label}失败：${message}`);
      const status = /请|不能|不存在|不正确|重复|不一致|最多|没有找到|没有识别/.test(message)
        ? 400
        : 500;
      res.status(status).json({ ok: false, error: message, logs });
    }
  }

  app.post(
    "/api/product-revision-sync/preview",
    upload.fields([
      { name: "specExcel", maxCount: 1 },
      { name: "languageDatasheet", maxCount: 1 }
    ]),
    (req, res) => handle(req, res, feature.preview, "产品修订同步预览")
  );
  app.post(
    "/api/product-revision-sync/submit",
    upload.fields([
      { name: "specExcel", maxCount: 1 },
      { name: "languageDatasheet", maxCount: 1 }
    ]),
    (req, res) => handle(req, res, feature.submit, "产品修订同步")
  );
}

module.exports = { registerProductRevisionSyncRoutes };
