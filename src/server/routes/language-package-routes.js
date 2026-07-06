function registerLanguagePackageRoutes(app, deps) {
  const { upload, languagePackageFeature, logLine } = deps;

  app.post("/api/language-package/upload", upload.fields([
    { name: "languagePackage", maxCount: 1 }
  ]), async (req, res) => {
    const logs = [];
    try {
      const result = await languagePackageFeature.submitLanguagePackageToBackend(req.body || {}, req.files || {}, logs);
      logLine(logs, "语言包上传流程完成。");
      res.json({ ok: true, logs, result });
    } catch (error) {
      logLine(logs, "语言包上传失败：" + (error && error.message ? error.message : String(error)));
      res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
    }
  });
}

module.exports = { registerLanguagePackageRoutes };
