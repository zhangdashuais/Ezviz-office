function registerEzvizSiteAuditRoutes(app, { feature, scheduler }) {
  app.post("/api/ezviz-site-audit/product-taglines", async (req, res) => {
    try {
      const result = await feature.auditProductTaglineUrl(req.body?.url);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.post("/api/ezviz-site-audit/product-detail", async (req, res) => {
    try {
      const result = await feature.auditProductDetailUrl(req.body?.url);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.post("/api/ezviz-site-audit/jobs", (req, res) => {
    try {
      const job = feature.startRandomAuditJob({ sampleSize: req.body?.sampleSize });
      res.json({ ok: true, job });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.get("/api/ezviz-site-audit/jobs/:jobId", (req, res) => {
    const job = feature.getRandomAuditJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ ok: false, error: "EZVIZ 官网巡查任务不存在或已过期。" });
      return;
    }
    res.json({ ok: true, job });
  });

  app.get("/api/ezviz-site-audit/schedule", (req, res) => {
    res.json({ ok: true, schedule: scheduler?.getState() || { enabled: false } });
  });

  app.post("/api/ezviz-site-audit/schedule/run", (req, res) => {
    const job = scheduler?.runNow();
    if (!job) return res.status(409).json({ ok: false, error: "已有官网巡查任务正在运行。" });
    res.json({ ok: true, job, schedule: scheduler.getState() });
  });
}

module.exports = { registerEzvizSiteAuditRoutes };
