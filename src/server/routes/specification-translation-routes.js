function registerSpecificationTranslationRoutes(app, deps) {
  const { upload, logLine, feature, browserAuth, shopCredentials, readCampaignConfig, getCampaignSites } = deps;

  async function handle(req, res, submit) {
    const logs = [];
    try {
      const excelFile = req.file;
      if (!excelFile) throw new Error("请上传 Specification 翻译 Excel。");
      const config = readCampaignConfig();
      const sites = getCampaignSites(config);
      const siteCode = String(req.body?.siteCode || "fr").trim();
      const site = sites.find((item) => item.siteCode === siteCode);
      if (!site) throw new Error("未找到站点配置：" + siteCode);
      const page = await browserAuth.getOpenPage(await browserAuth.getShopContext());
      page.setDefaultTimeout(25000);
      const backendPage = await browserAuth.ensureShopLoggedIn(page, {
        ...(req.body || {}),
        credentialDomain: shopCredentials.domainForSite(site),
        credentialGroup: "Website"
      }, logs);
      let translations = [];
      const translationPayload = req.body?.translationsBase64
        ? Buffer.from(req.body.translationsBase64, "base64").toString("utf8")
        : req.body?.translationsJson;
      if (translationPayload) {
        const parsed = JSON.parse(translationPayload);
        if (!Array.isArray(parsed)) throw new Error("translationsJson 必须是数组。");
        translations = parsed;
      }
      const result = await feature.run(backendPage, {
        productName: String(req.body?.productName || "CP8").trim(),
        siteCode,
        locale: String(req.body?.locale || siteCode).trim(),
        submit,
        translations,
        localeHeader: String(req.body?.localeHeader || "").trim()
      }, excelFile, logs);
      res.json({ ok: true, site, logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, (submit ? "Specification 保存失败：" : "Specification 预览失败：") + message);
      res.status(500).json({ ok: false, error: message, logs });
    }
  }

  app.post("/api/specification/preview", upload.single("specExcel"), (req, res) => handle(req, res, false));
  app.post("/api/specification/submit", upload.single("specExcel"), (req, res) => handle(req, res, true));
}

module.exports = { registerSpecificationTranslationRoutes };
