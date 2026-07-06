function registerWtbRoutes(app, deps) {
  const { upload, wtbFeature, logLine } = deps;

  app.post("/api/campaign/wtb-plan", upload.fields([
    { name: "excel", maxCount: 1 }
  ]), (req, res) => {
    try {
      res.json({ ok: true, plan: wtbFeature.buildWtbPlan(req.body || {}, req.files || {}) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  });

  app.post("/api/campaign/wtb-submit", upload.fields([
    { name: "excel", maxCount: 1 }
  ]), async (req, res) => {
    const logs = [];
    try {
      const result = await wtbFeature.submitWtbToBackend(req.body || {}, req.files || {}, logs);
      logLine(logs, "WTB 后台提交流程完成。");
      res.json({ ok: true, logs, result });
    } catch (error) {
      logLine(logs, "WTB 后台提交失败：" + (error && error.message ? error.message : String(error)));
      res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
    }
  });
}

module.exports = { registerWtbRoutes };
