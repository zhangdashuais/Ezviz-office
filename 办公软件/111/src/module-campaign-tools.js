(function () {
  const serviceBase = "http://localhost:3217";
  const ids = {
    sites: "campaignSites",
    reload: "campaignReloadSitesBtn",
    selectAll: "campaignSelectAllBtn",
    clearSites: "campaignClearSitesBtn",
    status: "campaignStatus",
    output: "campaignOutput",
    shopUsername: "campaignShopUsernameInput",
    shopPassword: "campaignShopPasswordInput",
    bannerHeadline: "bannerHeadlineInput",
    bannerLink: "bannerLinkInput",
    bannerSlogan: "bannerSloganInput",
    bannerModel: "bannerModelInput",
    bannerIntro: "bannerIntroInput",
    bannerColor: "bannerColorSelect",
    bannerPosition: "bannerPositionInput",
    bannerOnline: "bannerOnlineInput",
    bannerOffline: "bannerOfflineInput",
    bannerPcImage: "bannerPcImageInput",
    bannerMobileImage: "bannerMobileImageInput",
    bannerNoMoreButton: "bannerNoMoreButtonInput",
    bannerOpenNewTab: "bannerOpenNewTabInput",
    bannerPublish: "bannerPublishInput",
    bannerBuildPlan: "bannerBuildPlanBtn",
    bannerSubmit: "bannerSubmitBtn",
    popupName: "popupNameInput",
    popupBrief: "popupBriefInput",
    popupWhere: "popupWhereInput",
    popupFrequency: "popupFrequencyInput",
    popupStart: "popupStartInput",
    popupEnd: "popupEndInput",
    popupWebUrl: "popupWebUrlInput",
    popupMobileUrl: "popupMobileUrlInput",
    popupImage: "popupImageInput",
    popupEnable: "popupEnableInput",
    popupBuildPlan: "popupBuildPlanBtn",
    popupSubmit: "popupSubmitBtn",
    wtbProductName: "wtbProductNameInput",
    wtbPlatform: "wtbPlatformInput",
    wtbUrl: "wtbUrlInput",
    wtbExcel: "wtbExcelInput",
    wtbBuildPlan: "wtbBuildPlanBtn",
    wtbSubmit: "wtbSubmitBtn",
    auditPlacement: "campaignAuditPlacementSelect",
    auditPopupWait: "campaignPopupWaitInput",
    runAudit: "campaignRunAuditBtn",
    inspectFirstLink: "campaignInspectFirstLinkBtn",
    fixBannerUtm: "campaignFixBannerUtmBtn"
  };

  const el = {};
  Object.keys(ids).forEach((key) => {
    el[key] = document.getElementById(ids[key]);
  });

  if (!el.sites || !el.output) return;

  el.wtbSites = document.getElementById("wtbSites");
  el.wtbReload = document.getElementById("wtbReloadSitesBtn");
  el.wtbSelectAll = document.getElementById("wtbSelectAllBtn");
  el.wtbClearSites = document.getElementById("wtbClearSitesBtn");
  el.wtbStatus = document.getElementById("wtbStatus");
  el.wtbOutput = document.getElementById("wtbOutput");
  el.wtbShopUsername = document.getElementById("wtbShopUsernameInput");
  el.wtbShopPassword = document.getElementById("wtbShopPasswordInput");

  let sites = [];

  function setStatus(message, type) {
    el.status.textContent = message;
    el.status.className = "status" + (type ? " " + type : "");
  }

  function writeOutput(value) {
    el.output.value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    el.output.scrollTop = 0;
  }

  function revealOutput() {
    el.status.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setWtbStatus(message, type) {
    if (!el.wtbStatus) return;
    el.wtbStatus.textContent = message;
    el.wtbStatus.className = "status" + (type ? " " + type : "");
  }

  function writeWtbOutput(value) {
    if (!el.wtbOutput) return;
    el.wtbOutput.value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    el.wtbOutput.scrollTop = 0;
  }

  function revealWtbOutput() {
    if (el.wtbStatus) el.wtbStatus.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renderAuditIssues(result) {
    const issues = result && result.issues ? result.issues : {};
    const broken = issues.brokenLinks || [];
    const invalidUtm = issues.invalidUtmLinks || [];
    const summary = issues.summary || {};
    const lines = [];

    lines.push("最终结果：");
    lines.push("检查站点：" + (summary.sitesChecked || 0)
      + "；Banner 链接：" + (summary.bannerLinksFound || 0)
      + "；Popup 链接：" + (summary.popupLinksFound || 0)
      + "；失效链接：" + broken.length
      + "；UTM 问题：" + invalidUtm.length);
    lines.push("");

    if (!broken.length && !invalidUtm.length) {
      lines.push("未发现 Banner / Popup 链接失效或 UTM 命名问题。");
      return lines.join("\n");
    }

    if (broken.length) {
      lines.push("失效链接：");
      broken.forEach((item, index) => lines.push(renderLinkIssue(item, index)));
      lines.push("");
    }

    if (invalidUtm.length) {
      lines.push("UTM 命名问题：");
      invalidUtm.forEach((item, index) => lines.push(renderLinkIssue(item, index)));
    }

    return lines.join("\n");
  }
  function renderLinkIssue(item, index) {
    const lines = [];
    lines.push((index + 1) + ". " + (item.site || item.siteCode || "未知站点")
      + " / " + (item.placement || "未知位置")
      + (item.position ? " 第 " + item.position + " 位" : ""));
    if (item.text) lines.push("   标题：" + item.text);
    if (item.status || item.error) lines.push("   状态：" + (item.status || item.error));
    if (item.utmProblems && item.utmProblems.length) lines.push("   UTM 问题：" + item.utmProblems.join("；"));
    lines.push("   链接：" + item.url);
    if (item.correctedUrl) lines.push("   修正后：" + item.correctedUrl);
    return lines.join("\n");
  }
  function renderBannerSubmitResult(payload) {
    const result = payload && payload.result ? payload.result : {};
    const logs = payload && payload.logs ? payload.logs : [];
    const audit = result.postSubmitAudit || {};
    const finalAudit = audit.final || {};
    const brokenLinks = finalAudit.brokenLinks || [];
    const invalidUtmLinks = finalAudit.invalidUtmLinks || [];
    const lines = [];
    lines.push("Banner 后台配置结果");
    lines.push("");
    lines.push("执行方式：" + (result.mode === "direct-post" ? "快路径（浏览器登录 + 接口上传/保存/发布）" : (result.mode || "页面操作")));
    if (result.site) lines.push("站点：" + result.site.name + " (" + result.site.siteCode + ")");
    if (result.insertedPosition) lines.push("新增 Banner 位置：第 " + result.insertedPosition + " 位");
    if (result.totalSlides) lines.push("当前 Banner 总数：" + result.totalSlides);
    if (result.url) lines.push("新增 Banner 链接：" + result.url);
    if (result.widget) lines.push("Banner 组件：" + result.widget.widgetId + " / tpl " + result.widget.tplId);
    if (result.editorUrl) lines.push("后台编辑页：" + result.editorUrl);
    lines.push("");
    const publishLog = logs.find((line) => line.includes("Banner 页面已发布"));
    lines.push(publishLog || "发布状态：未勾选上传后发布，已跳过发布。");
    const first = audit.first || {};
    lines.push("提交后首次巡查：坏链 " + ((first.brokenLinks || []).length) + " 条，UTM 问题 " + ((first.invalidUtmLinks || []).length) + " 条。");
    if (audit.repair) lines.push("UTM 自动修复：已执行，修复数量 " + (audit.repair.fixedCount == null ? "见日志" : audit.repair.fixedCount) + "。");
    else lines.push("UTM 自动修复：无需修复。");
    lines.push("最终巡查结果：坏链 " + brokenLinks.length + " 条，UTM 问题 " + invalidUtmLinks.length + " 条。");
    lines.push("");
    if (!brokenLinks.length && !invalidUtmLinks.length) {
      lines.push("最终结果：未发现 Banner 链接失效或 UTM 命名问题。");
    } else {
      if (brokenLinks.length) {
        lines.push("失效链接：");
        brokenLinks.forEach((item, index) => lines.push(renderLinkIssue(item, index)));
        lines.push("");
      }
      if (invalidUtmLinks.length) {
        lines.push("仍存在的 UTM 问题：");
        invalidUtmLinks.forEach((item, index) => lines.push(renderLinkIssue(item, index)));
      }
    }
    lines.push("");
    lines.push("关键日志：");
    logs.slice(-12).forEach((line) => lines.push("- " + line));
    return lines.join("\n");
  }
  function renderPopupSubmitResult(payload) {
    const result = payload && payload.result ? payload.result : {};
    const logs = payload && payload.logs ? payload.logs : [];
    const lines = [];
    lines.push("Popup 后台配置结果");
    lines.push("");
    lines.push("执行方式：" + (result.mode === "direct-post" ? "快路径（浏览器登录 + 接口上传/创建/启用）" : (result.mode || "页面操作")));
    if (result.site) lines.push("站点：" + result.site.name + " (" + result.site.siteCode + ")");
    if (result.name) lines.push("Popup 名称：" + result.name);
    if (result.configNo) lines.push("配置编号：" + result.configNo);
    if (result.configType) lines.push("展示范围：" + result.configType);
    if (result.frequency) lines.push("展示频率：" + result.frequency);
    if (result.webUrl) lines.push("Web 链接：" + result.webUrl);
    if (result.mobileUrl) lines.push("Mobile 链接：" + result.mobileUrl);
    if (result.image) lines.push("图片地址：" + result.image);
    lines.push("启用状态：" + (result.enabled ? "已启用" : "已创建，未启用"));
    if (result.slotCleanup) {
      const previous = result.slotCleanup.previous || {};
      if (result.slotCleanup.action === "deleted-expired") {
        lines.push("资源位处理：已删除过期旧 Popup");
        if (previous.name) lines.push("旧 Popup：" + previous.name);
        if (previous.configNo) lines.push("旧编号：" + previous.configNo);
        if (previous.endTime) lines.push("旧下线时间：" + previous.endTime);
      } else {
        lines.push("资源位处理：未发现需要删除的旧 Popup");
      }
    }
    if (result.currentUrl) lines.push("后台当前页面：" + result.currentUrl);
    lines.push("");
    lines.push("关键日志：");
    logs.slice(-12).forEach((line) => lines.push("- " + line));
    return lines.join("\n");
  }
  function renderWtbSubmitResult(payload) {
    const result = payload && payload.result ? payload.result : {};
    const logs = payload && payload.logs ? payload.logs : [];
    const lines = [];
    lines.push("WTB 产品购买链接配置结果");
    lines.push("");
    if (result.site) lines.push("站点：" + result.site.name + " (" + result.site.siteCode + ")");
    lines.push("产品数：" + (result.productCount || 0));
    lines.push("成功：" + (result.successCount || 0));
    lines.push("失败/跳过：" + (result.failedCount || 0));
    lines.push("链接数：" + (result.linkCount || 0));
    if (result.report && result.report.reportUrl) lines.push("执行报告：" + location.origin + result.report.reportUrl);
    lines.push("");
    (result.results || []).forEach((item, index) => {
      lines.push((index + 1) + ". " + item.productName);
      lines.push("   状态：" + (item.status === "completed" ? "成功" : "失败/已跳过"));
      if (item.error) lines.push("   错误：" + item.error);
      if (item.editUrl) lines.push("   后台编辑页：" + item.editUrl);
      (item.links || []).forEach((link) => lines.push("   " + link.platform + "：" + link.url));
      if (item.save) {
        lines.push("   保存接口：" + item.save.requestUrl);
        lines.push("   保存状态：" + (item.save.responseStatus || "已发送"));
      }
      if (item.frontendCheck) {
        const check = item.frontendCheck;
        const label = check.status === "passed" ? "通过" : check.status === "failed" ? "未通过" : "未执行";
        lines.push("   前台复查：" + label);
        if (check.productUrl) lines.push("   前台页面：" + check.productUrl);
        if (check.reason) lines.push("   复查说明：" + check.reason);
        (check.checkedUrls || []).slice(0, 3).forEach((checked) => {
          lines.push("   已检查：" + checked.url + (checked.status ? " / " + checked.status : ""));
          if (checked.missing && checked.missing.length) {
            lines.push("   缺失：" + checked.missing.map((link) => link.platform).join(", "));
          }
        });
      }
      lines.push("");
    });
    lines.push("关键日志：");
    logs.slice(-16).forEach((line) => lines.push("- " + line));
    return lines.join("\n");
  }
  function renderAuditJob(job) {
    const lines = [];
    lines.push("巡查任务：" + job.id);
    lines.push("状态：" + job.status);
    lines.push("站点：" + (job.selectedSites || []).map((site) => site.siteCode + "/" + site.name).join(", "));
    lines.push("");
    lines.push("进度：");
    (job.logs || []).forEach((item) => {
      const time = item.at ? item.at.slice(11, 19) : "";
      lines.push("[" + time + "] " + item.message);
    });
    if (job.result) {
      lines.push("");
      lines.push(renderAuditIssues(job.result));
    }
    return lines.join("\n");
  }
  function writeProgress(value) {
    el.output.value = value;
    el.output.scrollTop = el.output.scrollHeight;
  }

  function selectedSiteCodes() {
    return Array.from(el.sites.querySelectorAll("input[type='checkbox']:checked"))
      .map((input) => input.value);
  }

  function selectedWtbSiteCodes() {
    if (!el.wtbSites) return [];
    return Array.from(el.wtbSites.querySelectorAll("input[type='checkbox']:checked"))
      .map((input) => input.value);
  }

  function renderSites() {
    if (!sites.length) {
      el.sites.textContent = "没有读取到站点。";
      return;
    }

    el.sites.innerHTML = "";
    sites.forEach((site) => {
      const label = document.createElement("label");
      label.className = "site-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = site.siteCode;
      input.checked = !!site.enabled;

      const name = document.createElement("span");
      name.className = "site-name";
      name.textContent = site.name + " (" + site.siteCode + ")";

      const url = document.createElement("span");
      url.className = "site-url";
      url.textContent = site.url;

      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(url);
      el.sites.appendChild(label);
    });
  }

  function renderWtbSites() {
    if (!el.wtbSites) return;
    if (!sites.length) {
      el.wtbSites.textContent = "没有读取到站点。";
      return;
    }
    el.wtbSites.innerHTML = "";
    sites.forEach((site) => {
      const label = document.createElement("label");
      label.className = "site-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = site.siteCode;
      input.checked = !!site.enabled;

      const name = document.createElement("span");
      name.className = "site-name";
      name.textContent = site.name + " (" + site.siteCode + ")";

      const url = document.createElement("span");
      url.className = "site-url";
      url.textContent = site.url;

      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(url);
      el.wtbSites.appendChild(label);
    });
  }

  async function loadSites() {
    setStatus("正在加载站点配置...");
    setWtbStatus("正在加载站点配置...");
    try {
      const response = await fetch(serviceBase + "/api/campaign/sites");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "站点加载失败");
      sites = payload.sites || [];
      renderSites();
      renderWtbSites();
      setStatus("站点已加载：" + sites.length + " 个。", "ok");
      setWtbStatus("站点已加载：" + sites.length + " 个。", "ok");
    } catch (error) {
      setStatus("站点加载失败：" + (error.message || error), "warn");
      setWtbStatus("站点加载失败：" + (error.message || error), "warn");
    }
  }
  function appendSites(formData) {
    const selected = selectedSiteCodes();
    if (!selected.length) {
      throw new Error("请至少勾选一个站点。");
    }
    formData.append("sites", JSON.stringify(selected));
  }

  function appendFile(formData, key, input) {
    const file = input.files && input.files[0];
    if (file) formData.append(key, file, file.name);
  }

  function normalizeDateTime(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return trimmed.replace("T", " ") + (trimmed.length === 16 ? ":00" : "");
  }

  function appendShopLogin(formData) {
    formData.append("shopUsername", el.shopUsername.value.trim());
    formData.append("shopPassword", el.shopPassword.value);
  }

  function appendWtbSites(formData) {
    const selected = selectedWtbSiteCodes();
    formData.append("sites", JSON.stringify(selected));
  }

  function appendWtbShopLogin(formData) {
    formData.append("shopUsername", el.wtbShopUsername ? el.wtbShopUsername.value.trim() : "");
    formData.append("shopPassword", el.wtbShopPassword ? el.wtbShopPassword.value : "");
  }

  function bannerFormData() {
    const formData = new FormData();
    appendSites(formData);
    appendShopLogin(formData);
    formData.append("headline", el.bannerHeadline.value.trim());
    formData.append("link", el.bannerLink.value.trim());
    formData.append("slogan", el.bannerSlogan.value.trim());
    formData.append("model", el.bannerModel.value.trim());
    formData.append("introduction", el.bannerIntro.value.trim());
    formData.append("color", el.bannerColor.value);
    formData.append("position", el.bannerPosition.value || "1");
    formData.append("onlineAtUtc", normalizeDateTime(el.bannerOnline.value));
    formData.append("offlineAtUtc", normalizeDateTime(el.bannerOffline.value));
    formData.append("noMoreButton", el.bannerNoMoreButton.checked ? "1" : "0");
    formData.append("openNewTab", el.bannerOpenNewTab.checked ? "1" : "0");
    formData.append("publishAfterUpload", el.bannerPublish.checked ? "1" : "0");
    appendFile(formData, "pcImage", el.bannerPcImage);
    appendFile(formData, "mobileImage", el.bannerMobileImage);
    return formData;
  }

  function popupFormData() {
    const formData = new FormData();
    appendSites(formData);
    appendShopLogin(formData);
    formData.append("name", el.popupName.value.trim());
    formData.append("brief", el.popupBrief.value.trim());
    formData.append("whereToShow", el.popupWhere.value);
    formData.append("frequency", el.popupFrequency.value);
    formData.append("startAt", normalizeDateTime(el.popupStart.value));
    formData.append("endAt", normalizeDateTime(el.popupEnd.value));
    formData.append("webUrl", el.popupWebUrl.value.trim());
    formData.append("mobileUrl", el.popupMobileUrl.value.trim());
    formData.append("enableAfterSubmit", el.popupEnable.checked ? "1" : "0");
    appendFile(formData, "image", el.popupImage);
    return formData;
  }

  function wtbFormData() {
    const formData = new FormData();
    appendWtbSites(formData);
    appendWtbShopLogin(formData);
    formData.append("productName", el.wtbProductName.value.trim());
    formData.append("platform", el.wtbPlatform.value.trim());
    formData.append("url", el.wtbUrl.value.trim());
    appendFile(formData, "excel", el.wtbExcel);
    return formData;
  }

  async function postForm(url, formData) {
    const response = await fetch(serviceBase + url, {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "鎺ュ彛鎵ц澶辫触");
    return payload;
  }

  async function buildBannerPlan() {
    el.bannerBuildPlan.disabled = true;
    setStatus("正在生成 Banner 清单，不会提交后台...");
    revealOutput();
    try {
      const payload = await postForm("/api/campaign/banner-plan", bannerFormData());
      writeOutput(payload.plan);
      setStatus("Banner 清单已生成：" + payload.plan.items.length + " 个站点，未提交后台。", "ok");
      revealOutput();
    } catch (error) {
      setStatus("Banner 清单生成失败：" + (error.message || error), "warn");
      revealOutput();
    } finally {
      el.bannerBuildPlan.disabled = false;
    }
  }
  async function submitBanner() {
    el.bannerSubmit.disabled = true;
    setStatus("正在执行 Banner 后台配置。会先用真实浏览器登录，再用接口快速保存...");
    writeOutput("Banner 后台配置执行中。若浏览器停在登录页，请登录后再点击一次执行；进入后台后会用接口上传、保存和发布。");
    revealOutput();
    try {
      const payload = await postForm("/api/campaign/banner-submit", bannerFormData());
      writeOutput(renderBannerSubmitResult(payload));
      setStatus("Banner 后台配置完成。", "ok");
      revealOutput();
    } catch (error) {
      setStatus("Banner 后台配置失败：" + (error.message || error), "warn");
      writeOutput("Banner 后台配置失败：\n" + (error.message || error));
      revealOutput();
    } finally {
      el.bannerSubmit.disabled = false;
    }
  }
  async function buildPopupPlan() {
    el.popupBuildPlan.disabled = true;
    setStatus("正在生成 Popup 清单，不会提交后台...");
    revealOutput();
    try {
      const payload = await postForm("/api/campaign/popup-plan", popupFormData());
      writeOutput(payload.plan);
      setStatus("Popup 清单已生成：" + payload.plan.items.length + " 个站点，未提交后台。", "ok");
      revealOutput();
    } catch (error) {
      setStatus("Popup 清单生成失败：" + (error.message || error), "warn");
      revealOutput();
    } finally {
      el.popupBuildPlan.disabled = false;
    }
  }
  async function submitPopup() {
    el.popupSubmit.disabled = true;
    setStatus("正在执行 Popup 后台配置。真实浏览器会打开，请不要关闭...");
    writeOutput("Popup 后台配置执行中。若浏览器停在登录页，请登录后再点击一次执行。");
    revealOutput();
    try {
      const payload = await postForm("/api/campaign/popup-submit", popupFormData());
      writeOutput(renderPopupSubmitResult(payload));
      setStatus("Popup 后台配置完成。", "ok");
      revealOutput();
    } catch (error) {
      setStatus("Popup 后台配置失败：" + (error.message || error), "warn");
      writeOutput("Popup 后台配置失败：\n" + (error.message || error));
      revealOutput();
    } finally {
      el.popupSubmit.disabled = false;
    }
  }
  async function buildWtbPlan() {
    el.wtbBuildPlan.disabled = true;
    setWtbStatus("正在生成 WTB 清单，不会提交后台...");
    revealWtbOutput();
    try {
      const payload = await postForm("/api/campaign/wtb-plan", wtbFormData());
      writeWtbOutput(payload.plan);
      setWtbStatus("WTB 清单已生成：产品 " + payload.plan.productCount + " 个，链接 " + payload.plan.linkCount + " 条。", "ok");
      revealWtbOutput();
    } catch (error) {
      setWtbStatus("WTB 清单生成失败：" + (error.message || error), "warn");
      writeWtbOutput("WTB 清单生成失败：\n" + (error.message || error));
      revealWtbOutput();
    } finally {
      el.wtbBuildPlan.disabled = false;
    }
  }
  async function submitWtb() {
    el.wtbSubmit.disabled = true;
    setWtbStatus("正在执行 WTB 后台配置。保存后会自动打开前台页面复查，请不要关闭浏览器...");
    writeWtbOutput("WTB 后台配置执行中。系统会按产品名称找到编辑页，填写购买平台链接并保存；保存后会自动二次检查前台是否能看到对应平台或链接。");
    revealWtbOutput();
    try {
      const payload = await postForm("/api/campaign/wtb-submit", wtbFormData());
      writeWtbOutput(renderWtbSubmitResult(payload));
      const result = (payload || {}).result || {};
      if (result.report?.reportUrl) {
        const link = document.createElement("a");
        link.href = result.report.reportUrl;
        link.download = result.report.filename || "WTB执行报告.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      const checks = (((payload || {}).result || {}).results || []).map((item) => item.frontendCheck?.status).filter(Boolean);
      if (result.failedCount > 0) {
        setWtbStatus(`WTB 批量配置完成：成功 ${result.successCount || 0} 个，失败/跳过 ${result.failedCount} 个；执行报告已下载。`, "warn");
      } else if (checks.includes("failed")) {
        setWtbStatus("WTB 已保存，但前台复查有未通过项，请查看结果。", "warn");
      } else if (checks.includes("skipped")) {
        setWtbStatus("WTB 已保存，但有产品未能定位前台页复查，请查看结果。", "warn");
      } else {
        setWtbStatus("WTB 后台配置完成，前台复查通过。", "ok");
      }
      revealWtbOutput();
    } catch (error) {
      setWtbStatus("WTB 后台配置失败：" + (error.message || error), "warn");
      writeWtbOutput("WTB 后台配置失败：\n" + (error.message || error));
      revealWtbOutput();
    } finally {
      el.wtbSubmit.disabled = false;
    }
  }
  async function runAudit() {
    const selected = selectedSiteCodes();
    if (!selected.length) {
      setStatus("请至少勾选一个站点。", "warn");
      return;
    }
    el.runAudit.disabled = true;
    setStatus("正在运行巡查，站点较多时会花几分钟...");
    writeProgress("巡查任务启动中...");
    try {
      const response = await fetch(serviceBase + "/api/campaign/audit-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sites: selected,
          placement: el.auditPlacement.value,
          popupWaitMs: el.auditPopupWait.value || "5000"
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "巡查启动失败");
      let job = payload.job;
      writeProgress(renderAuditJob(job));
      while (job.status === "running") {
        await wait(1000);
        const pollResponse = await fetch(serviceBase + "/api/campaign/audit-job/" + encodeURIComponent(job.id));
        const pollPayload = await pollResponse.json();
        if (!pollResponse.ok || !pollPayload.ok) throw new Error(pollPayload.error || "读取巡查进度失败");
        job = pollPayload.job;
        writeProgress(renderAuditJob(job));
      }
      if (job.status !== "completed") throw new Error(job.error || job.result?.stderr || "巡查失败");
      setStatus("巡查完成。", "ok");
    } catch (error) {
      setStatus("巡查失败：" + (error.message || error), "warn");
    } finally {
      el.runAudit.disabled = false;
    }
  }
  function renderFirstLinkResult(result) {
    const lines = [];
    lines.push("首个活动跳转链接");
    lines.push("站点：" + result.site.name + " (" + result.site.siteCode + ")");
    lines.push("首页：" + result.renderedUrl);
    lines.push("");
    (result.results || []).forEach((item) => {
      lines.push((item.placement === "banner" ? "Banner" : "Popup") + "：");
      if (!item.found) {
        lines.push("未找到当前可用的跳转链接。");
        lines.push("");
        return;
      }
      if (item.position) lines.push("位置：第 " + item.position + " 位");
      if (item.text) lines.push("文案：" + item.text);
      lines.push("跳转链接：" + item.href);
      if (item.availability) {
        lines.push("链接状态：" + (item.availability.ok ? "可用" : "不可用")
          + (item.availability.status ? "（HTTP " + item.availability.status + "）" : ""));
        if (item.availability.finalUrl && item.availability.finalUrl !== item.href) {
          lines.push("最终地址：" + item.availability.finalUrl);
        }
        if (item.availability.error) lines.push("访问错误：" + item.availability.error);
      }
      if (item.utm) {
        if (!item.utm.required) lines.push("UTM：外部链接，不要求配置 EZVIZ UTM");
        else lines.push("UTM：" + (item.utm.valid ? "配置正确" : "配置错误"));
        (item.utm.problems || []).forEach((problem) => lines.push("- " + problem));
        if (item.utm.correctedUrl) lines.push("建议修正：" + item.utm.correctedUrl);
      }
      lines.push("");
    });
    return lines.join("\n");
  }
  async function inspectFirstLink() {
    const selected = selectedSiteCodes();
    if (selected.length !== 1) {
      setStatus("读取首个活动链接时请只勾选一个站点。", "warn");
      return;
    }
    el.inspectFirstLink.disabled = true;
    setStatus("正在读取首页首个活动跳转链接...");
    writeOutput("正在打开所选站点首页并检查链接，请稍候...");
    revealOutput();
    try {
      const response = await fetch(serviceBase + "/api/campaign/first-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sites: selected,
          placement: el.auditPlacement.value,
          popupWaitMs: el.auditPopupWait.value || "5000"
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "读取首个活动链接失败");
      writeOutput(renderFirstLinkResult(payload.result));
      setStatus("首个活动跳转链接读取完成。", "ok");
    } catch (error) {
      setStatus("读取首个活动链接失败：" + (error.message || error), "warn");
      writeOutput({ ok: false, error: error.message || String(error) });
    } finally {
      el.inspectFirstLink.disabled = false;
    }
  }
  async function fixBannerUtm() {
    const selected = selectedSiteCodes();
    if (selected.length !== 1) {
      setStatus("修复 Banner UTM 请只勾选一个站点。", "warn");
      return;
    }
    el.fixBannerUtm.disabled = true;
    setStatus("正在修复 Banner UTM，会进入后台保存并发布...");
    writeOutput("Banner UTM 修复执行中，请不要关闭浏览器。");
    revealOutput();
    try {
      const response = await fetch(serviceBase + "/api/campaign/banner-fix-utm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sites: selected,
          username: el.shopUsername.value.trim(),
          password: el.shopPassword.value,
          publishAfterFix: "1"
        })
      });
      const payload = await response.json();
      writeOutput(payload);
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "修复失败");
      setStatus("Banner UTM 修复完成。", "ok");
    } catch (error) {
      setStatus("Banner UTM 修复失败：" + (error.message || error), "warn");
    } finally {
      el.fixBannerUtm.disabled = false;
    }
  }
  el.reload.addEventListener("click", loadSites);
  el.selectAll.addEventListener("click", () => {
    el.sites.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = true;
    });
  });
  el.clearSites.addEventListener("click", () => {
    el.sites.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = false;
    });
  });
  if (el.wtbReload) el.wtbReload.addEventListener("click", loadSites);
  if (el.wtbSelectAll) el.wtbSelectAll.addEventListener("click", () => {
    el.wtbSites.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = true;
    });
  });
  if (el.wtbClearSites) el.wtbClearSites.addEventListener("click", () => {
    el.wtbSites.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = false;
    });
  });
  el.bannerBuildPlan.addEventListener("click", buildBannerPlan);
  el.bannerSubmit.addEventListener("click", submitBanner);
  el.popupBuildPlan.addEventListener("click", buildPopupPlan);
  el.popupSubmit.addEventListener("click", submitPopup);
  el.wtbBuildPlan.addEventListener("click", buildWtbPlan);
  el.wtbSubmit.addEventListener("click", submitWtb);
  el.runAudit.addEventListener("click", runAudit);
  el.inspectFirstLink.addEventListener("click", inspectFirstLink);
  el.fixBannerUtm.addEventListener("click", fixBannerUtm);

  loadSites();
})();





