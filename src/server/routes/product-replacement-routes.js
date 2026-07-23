function registerProductReplacementRoutes(app, deps) {
  const { feature, logLine } = deps;

  app.post("/api/product-replacement/detail", async (req, res) => {
    const logs = [];
    try {
      const result = await feature.readDetail(req.body || {}, logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, "产品 Detail 读取失败：" + message);
      const status = /请填写|请选择|未找到站点|只允许选择一个/.test(message) ? 400 : 500;
      res.status(status).json({ ok: false, error: message, logs });
    }
  });
}

module.exports = { registerProductReplacementRoutes };
