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

  app.post("/api/campaign/wtb-roundtrip-test", async (req, res) => {
    const logs = [];
    try {
      const result = await wtbFeature.testWtbRoundTrip(req.body || {}, logs);
      logLine(logs, "WTB 往返测试完成，测试配置已恢复。");
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, "WTB 往返测试失败：" + message);
      res.status(500).json({ ok: false, error: message, logs });
    }
  });

  app.post("/api/campaign/wtb-restore", async (req, res) => {
    const logs = [];
    try {
      const result = await wtbFeature.restoreWtbLink(req.body || {}, logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, "WTB 链接恢复失败：" + message);
      res.status(500).json({ ok: false, error: message, logs });
    }
  });

  app.get("/api/campaign/wtb-reports/:filename", (req, res) => {
    const reportPath = wtbFeature.getReportPath(req.params.filename);
    if (!reportPath) return res.status(404).json({ ok: false, error: "WTB 执行报告不存在。" });
    res.download(reportPath);
  });
}

module.exports = { registerWtbRoutes };
