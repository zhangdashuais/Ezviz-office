function registerProductEmptyLinkRoutes(app, { upload, feature, logLine }) {
  async function handle(req, res, operation, label) {
    const logs = [];
    try {
      const result = await operation(req.body || {}, logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error?.message || String(error);
      logLine(logs, `${label}失败：${message}`);
      const status = /请|不能|不一致|最多|没有找到|已变化/.test(message) ? 400 : 500;
      res.status(status).json({ ok: false, error: message, logs });
    }
  }

  app.post("/api/product-empty-link/preview", upload.none(), (req, res) =>
    handle(req, res, feature.preview, "产品空链接预览"));
  app.post("/api/product-empty-link/submit", upload.none(), (req, res) =>
    handle(req, res, feature.submit, "产品空链接创建"));
}

module.exports = { registerProductEmptyLinkRoutes };
