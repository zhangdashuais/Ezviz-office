function registerEcadminPlatformRoutes(app, deps) {
  const { upload, ecadminPlatformFeature, logLine } = deps;

  app.post("/api/ecadmin/run", upload.fields([
    { name: "datasheet", maxCount: 1 },
    { name: "highResImage", maxCount: 1 },
    { name: "specExcel", maxCount: 1 },
    { name: "allFiles", maxCount: 200 }
  ]), async (req, res) => {
    const logs = [];
    try {
      const files = {
        datasheet: req.files?.datasheet?.[0],
        highResImage: req.files?.highResImage?.[0],
        specExcel: req.files?.specExcel?.[0],
        allFiles: req.files?.allFiles || []
      };
      const result = await ecadminPlatformFeature.runEcadminPlatform(req.body || {}, files, logs);
      logLine(logs, "流程完成。");
      res.json({ ok: true, logs, result });
    } catch (error) {
      logLine(logs, "流程中断：" + (error && error.message ? error.message : String(error)));
      res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
    }
  });
}

module.exports = { registerEcadminPlatformRoutes };
