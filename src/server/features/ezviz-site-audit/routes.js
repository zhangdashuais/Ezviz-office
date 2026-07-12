function registerEzvizSiteAuditRoutes(app, { feature }) {
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
}

module.exports = { registerEzvizSiteAuditRoutes };
