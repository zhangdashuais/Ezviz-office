function registerSpecificationTranslationRoutes(app, deps) {
  const { logLine, feature, browserAuth, shopCredentials, readCampaignConfig, getCampaignSites } = deps;

  async function handle(req, res, submit) {
    const logs = [];
    try {
      const siteCode = String(req.body?.siteCode || "").trim();
      const referenceUrl = String(req.body?.referenceUrl || "").trim();
      if (!siteCode) throw new Error("请选择站点。");
      if (!/^https:\/\//i.test(referenceUrl)) throw new Error("请填写该站点一个已翻译产品详情页的 HTTPS 地址。");
      const site = getCampaignSites(readCampaignConfig()).find((item) => item.siteCode === siteCode);
      if (!site) throw new Error("未找到站点配置：" + siteCode);
      const page = await browserAuth.getOpenPage(await browserAuth.getShopContext());
      page.setDefaultTimeout(25000);
      const backendPage = await browserAuth.ensureShopLoggedIn(page, {
        ...(req.body || {}), credentialDomain: shopCredentials.domainForSite(site), credentialGroup: "Website"
      }, logs);
      const result = await feature.run(backendPage, { referenceUrl, submit }, logs);
      res.json({ ok: true, site, logs, result });
    } catch (error) {
      const message = error?.message || String(error);
      logLine(logs, `${submit ? "批量保存" : "批量预览"}失败：${message}`);
      res.status(/请选择|请填写|未找到站点/.test(message) ? 400 : 500).json({ ok: false, error: message, logs });
    }
  }

  app.post("/api/specification/preview", (req, res) => handle(req, res, false));
  app.post("/api/specification/submit", (req, res) => handle(req, res, true));
}

module.exports = { registerSpecificationTranslationRoutes };
