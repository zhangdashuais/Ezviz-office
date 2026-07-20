function registerTdkRoutes(app, deps) {
  const { upload, tdkManagement, logLine } = deps;
  const fields = [{ name: "tdkExcel", maxCount: 1 }];

  app.post("/api/tdk/plan", upload.fields(fields), (req, res) => {
    try {
      const plan = tdkManagement.buildPlan(req.body || {}, req.files || {});
      res.json({ ok: true, plan });
    } catch (error) {
      res.status(400).json({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  });

  app.post("/api/tdk/submit", upload.fields(fields), async (req, res) => {
    const logs = [];
    try {
      const result = await tdkManagement.submit(req.body || {}, req.files || {}, logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, "TDK 后台提交失败：" + message);
      res.status(500).json({ ok: false, error: message, logs });
    }
  });
}

module.exports = { registerTdkRoutes };
