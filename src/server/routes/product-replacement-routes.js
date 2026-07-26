function registerProductReplacementRoutes(app, deps) {
  const { feature, logLine } = deps;

  async function handleRead(req, res, reader, failureLabel) {
    const logs = [];
    try {
      const result = await reader(req.body || {}, logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, failureLabel + "：" + message);
      const status = /请填写|请选择|未找到站点|只允许选择一个/.test(message) ? 400 : 500;
      res.status(status).json({ ok: false, error: message, logs });
    }
  }

  app.post("/api/product-replacement/detail", (req, res) =>
    handleRead(req, res, feature.readDetail, "产品 Detail 读取失败"));

  app.post("/api/product-replacement/details", (req, res) =>
    handleRead(req, res, feature.readDetails, "批量产品 Detail 读取失败"));
}

module.exports = { registerProductReplacementRoutes };
