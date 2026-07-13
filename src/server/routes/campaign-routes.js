function registerCampaignRoutes(app, deps) {
  const {
    upload, logLine, normalizeBool, readCampaignConfig, getCampaignSites,
    getShopContext, getOpenPage, ensureShopLoggedIn, credentialDomainForSite,
    banner, product, popup, wtbProbe, languagePackageFeature,
    buildBannerPlan, buildPopupPlan, runCampaignAudit, campaignAuditIssues,
    startCampaignAuditJob, campaignAuditJobs
  } = deps;
  const errorMessage = (error) => error && error.message ? error.message : String(error);

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/campaign/sites", (req, res) => {
    try { res.json({ ok: true, sites: getCampaignSites(readCampaignConfig()) }); }
    catch (error) { res.status(500).json({ ok: false, error: errorMessage(error) }); }
  });

  app.post("/api/campaign/shop-login-check", async (req, res) => {
    const logs = [];
    try {
      const config = readCampaignConfig();
      const sites = getCampaignSites(config);
      const site = sites.find((item) => item.siteCode === String(req.body?.siteCode || "hq")) || sites[0];
      const page = await getOpenPage(await getShopContext());
      page.setDefaultTimeout(25000);
      const targetUrl = String(req.body?.targetUrl || "").trim();
      if (targetUrl && !/^https:\/\/(shop|new-shop)\.ezvizlife\.com\//.test(targetUrl)) {
        throw new Error("登录检查目标地址必须是 shop/new-shop 后台地址。");
      }
      let backendPage = await ensureShopLoggedIn(page, {
        ...(req.body || {}), credentialDomain: credentialDomainForSite(site), credentialGroup: "Website"
      }, logs);
      if (normalizeBool(req.body?.openBannerEditor)) backendPage = await banner.openEditor(backendPage, logs);
      let bannerDiagnostic = null;
      if (normalizeBool(req.body?.openBannerDialog)) {
        await banner.openDialog(backendPage, logs);
        await banner.waitForForm(backendPage, logs);
        if (normalizeBool(req.body?.addSlideForDiagnostics)) {
          await banner.clickByText(backendPage, "Add new slide").catch(() => banner.clickByText(backendPage, "Add").catch(() => {}));
          await backendPage.waitForTimeout(1000);
        }
        if (req.body?.moveBannerPosition) await banner.moveSlide(backendPage, Number(req.body.moveBannerPosition), logs);
        bannerDiagnostic = await banner.diagnoseForm(backendPage);
      }
      if (targetUrl) {
        logLine(logs, "登录检查额外打开目标页：" + targetUrl);
        await backendPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        await backendPage.waitForTimeout(4000);
      }
      if (normalizeBool(req.body?.openFirstProductEdit)) await product.openFirstEdit(backendPage, logs);
      if (normalizeBool(req.body?.openAdditionalInformation)) await product.openAdditionalInformation(backendPage, logs);
      const whereToBuyProbe = normalizeBool(req.body?.probeWhereToBuySettings)
        ? await wtbProbe(backendPage, logs, { clickComplete: req.body?.clickCompleteForProbe }) : null;
      const productKeywordSnapshot = normalizeBool(req.body?.productKeywordSnapshot) ? await product.keywordSnapshot(backendPage) : null;
      const languageUploadProbe = normalizeBool(req.body?.probeLanguageUpload)
        ? await languagePackageFeature.probeLanguagePackageUpload(backendPage, String(req.body?.languagePackagePath || "").trim(), logs) : null;
      if (req.body?.intGoodsCategoryValue !== undefined && req.body?.intGoodsCategoryValue !== null
        && (normalizeBool(req.body?.inspectIntGoodsCopy) || normalizeBool(req.body?.copyIntGoodsProduct))) {
        await backendPage.locator("select").nth(1).selectOption(String(req.body.intGoodsCategoryValue));
        await backendPage.waitForTimeout(1500);
      }
      const intGoodsCopySnapshot = normalizeBool(req.body?.inspectIntGoodsCopy) ? await product.inspectCopyPage(backendPage) : null;
      const intGoodsCopyResult = normalizeBool(req.body?.copyIntGoodsProduct)
        ? await product.copy(backendPage, req.body?.productName, logs) : null;
      const accountText = await backendPage.evaluate(() => document.querySelector(".clearfix.login-bar")?.innerText
        || document.querySelector(".login-bar")?.innerText || document.body.innerText.slice(0, 500)).catch(() => "");
      res.json({ ok: true, site, logs, currentUrl: backendPage.url(), accountText, bannerDiagnostic,
        wtbProbe: whereToBuyProbe, productKeywordSnapshot, languageUploadProbe, intGoodsCopySnapshot, intGoodsCopyResult });
    } catch (error) {
      logLine(logs, "商城登录检查失败：" + errorMessage(error));
      res.status(500).json({ ok: false, error: errorMessage(error), logs });
    }
  });

  app.post("/api/campaign/banner-plan", upload.fields([{ name: "pcImage", maxCount: 1 }, { name: "mobileImage", maxCount: 1 }]),
    (req, res) => { try { res.json({ ok: true, plan: buildBannerPlan(req.body || {}, req.files || {}) }); } catch (error) { res.status(500).json({ ok: false, error: errorMessage(error) }); } });
  app.post("/api/campaign/popup-plan", upload.fields([{ name: "image", maxCount: 1 }]),
    (req, res) => { try { res.json({ ok: true, plan: buildPopupPlan(req.body || {}, req.files || {}) }); } catch (error) { res.status(500).json({ ok: false, error: errorMessage(error) }); } });

  app.post("/api/campaign/banner-submit", upload.fields([{ name: "pcImage", maxCount: 1 }, { name: "mobileImage", maxCount: 1 }]), async (req, res) => {
    const logs = [];
    try { const result = await banner.submit(req.body || {}, req.files || {}, logs); logLine(logs, "Banner 后台提交流程完成。"); res.json({ ok: true, logs, result }); }
    catch (error) { logLine(logs, "Banner 后台提交失败：" + errorMessage(error)); res.status(500).json({ ok: false, error: errorMessage(error), logs }); }
  });
  app.post("/api/campaign/banner-fix-utm", async (req, res) => {
    const logs = [];
    try { const result = await banner.fixUtm(req.body || {}, logs); logLine(logs, "Banner UTM repair flow completed."); res.json({ ok: true, logs, result }); }
    catch (error) { logLine(logs, "Banner UTM repair failed: " + errorMessage(error)); res.status(500).json({ ok: false, error: errorMessage(error), logs }); }
  });
  app.post("/api/campaign/popup-submit", upload.fields([{ name: "image", maxCount: 1 }]), async (req, res) => {
    const logs = [];
    try { const result = await popup.submit(req.body || {}, req.files || {}, logs); logLine(logs, "Popup 后台提交流程完成。"); res.json({ ok: true, logs, result }); }
    catch (error) { logLine(logs, "Popup 后台提交失败：" + errorMessage(error)); res.status(500).json({ ok: false, error: errorMessage(error), logs }); }
  });

  app.post("/api/campaign/audit", async (req, res) => {
    try { const result = await runCampaignAudit(req.body || {}); result.issues = campaignAuditIssues(result); res.status(result.ok ? 200 : 500).json(result); }
    catch (error) { res.status(500).json({ ok: false, error: errorMessage(error) }); }
  });
  const jobView = (job) => job && ({ id: job.id, status: job.status, startedAt: job.startedAt, finishedAt: job.finishedAt,
    selectedSites: job.selectedSites, tempConfigPath: job.tempConfigPath, logs: job.logs, error: job.error, result: job.result });
  app.post("/api/campaign/audit-job", (req, res) => {
    try { res.json({ ok: true, job: jobView(startCampaignAuditJob(req.body || {})) }); }
    catch (error) { res.status(500).json({ ok: false, error: errorMessage(error) }); }
  });
  app.get("/api/campaign/audit-job/:jobId", (req, res) => {
    const job = campaignAuditJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: "巡查任务不存在或已过期。" });
    res.json({ ok: true, job: jobView(job) });
  });
}

module.exports = { registerCampaignRoutes };
