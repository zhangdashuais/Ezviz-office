function registerEcadminPlatformRoutes(app, deps) {
  const { ecadminPlatformFeature, logLine } = deps;

  app.post("/api/ecadmin/local-files", (req, res) => {
    try {
      const result = ecadminPlatformFeature.inspectLocalFiles(String(req.body?.title || "").trim());
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.post("/api/ecadmin/run", async (req, res) => {
    const logs = [];
    try {
      const result = await ecadminPlatformFeature.runEcadminPlatform(req.body || {}, logs);
      logLine(logs, "流程完成。");
      res.json({ ok: true, logs, result });
    } catch (error) {
      logLine(logs, "流程中断：" + (error && error.message ? error.message : String(error)));
      res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
    }
  });
}

module.exports = { registerEcadminPlatformRoutes };
