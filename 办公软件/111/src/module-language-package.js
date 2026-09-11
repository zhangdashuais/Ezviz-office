(function () {
  const serviceBase = "http://localhost:3217";
  const el = {
    sites: document.getElementById("languageSites"),
    reload: document.getElementById("languageReloadSitesBtn"),
    selectAll: document.getElementById("languageSelectAllBtn"),
    clearSites: document.getElementById("languageClearSitesBtn"),
    username: document.getElementById("languageShopUsernameInput"),
    password: document.getElementById("languageShopPasswordInput"),
    langCode: document.getElementById("languageCodeInput"),
    file: document.getElementById("languagePackageInput"),
    upload: document.getElementById("languageUploadBtn"),
    status: document.getElementById("languageStatus"),
    output: document.getElementById("languageOutput"),
    datasheet: document.getElementById("languageDatasheetInput"),
    datasheetInspect: document.getElementById("languageDatasheetInspectBtn"),
    datasheetMappings: document.getElementById("languageDatasheetMappings"),
    datasheetPreview: document.getElementById("languageDatasheetPreviewBtn"),
    datasheetSubmit: document.getElementById("languageDatasheetSubmitBtn"),
    datasheetStatus: document.getElementById("languageDatasheetStatus"),
    datasheetOutput: document.getElementById("languageDatasheetOutput"),
    localI18nProductName: document.getElementById("localI18nProductName"),
    localI18nGenerate: document.getElementById("localI18nGenerateBtn"),
    localI18nStatus: document.getElementById("localI18nStatus"),
    localI18nOutput: document.getElementById("localI18nOutput"),
    localI18nHtmlPath: document.getElementById("localI18nHtmlPath"),
    localI18nProductPackagePath: document.getElementById("localI18nProductPackagePath"),
    localI18nGlobalPackagePath: document.getElementById("localI18nGlobalPackagePath"),
    localI18nTemplatePath: document.getElementById("localI18nTemplatePath"),
    localI18nOutputPath: document.getElementById("localI18nOutputPath"),
    localI18nOutputFilePath: document.getElementById("localI18nOutputFilePath"),
    localI18nSyncPaths: document.getElementById("localI18nSyncPathsBtn")
  };

  if (!el.sites || !el.upload) return;
  let sites = [];
  let datasheetInfo = null;
  let datasheetPreview = null;

  function setStatus(message, type) {
    el.status.textContent = message;
    el.status.className = "status" + (type ? " " + type : "");
  }

  function writeOutput(value) {
    el.output.value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    el.output.scrollTop = 0;
  }

  function selectedSiteCodes() {
    return Array.from(el.sites.querySelectorAll("input[type='checkbox']:checked"))
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

  async function loadSites() {
    setStatus("正在加载站点配置...");
    try {
      const response = await fetch(serviceBase + "/api/campaign/sites");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "站点加载失败");
      sites = payload.sites || [];
      renderSites();
      renderDatasheetMappings();
      setStatus("站点已加载：" + sites.length + " 个。", "ok");
    } catch (error) {
      setStatus("站点加载失败：" + (error.message || error), "warn");
    }
  }

  function buildFormData() {
    const selected = selectedSiteCodes();
    if (!selected.length) throw new Error("请至少勾选一个站点。");
    const file = el.file.files && el.file.files[0];
    if (!file) throw new Error("请先选择语言包文件。");

    const formData = new FormData();
    formData.append("sites", JSON.stringify(selected));
    formData.append("shopUsername", el.username.value.trim());
    formData.append("shopPassword", el.password.value);
    formData.append("langCode", el.langCode.value.trim());
    formData.append("languagePackage", file, file.name);
    return formData;
  }

  function renderResult(payload) {
    const result = payload.result || {};
    const logs = payload.logs || [];
    const lines = [];
    lines.push("语言包上传结果");
    lines.push("");
    if (result.site) lines.push("站点：" + result.site.name + " (" + result.site.siteCode + ")");
    if (result.langCode) lines.push("语言代码：" + result.langCode);
    if (result.fileName) lines.push("文件：" + result.fileName);
    if (result.uploadUrl) lines.push("上传接口：" + result.uploadUrl);
    if (result.status) lines.push("接口状态：" + result.status);
    if (result.response) lines.push("接口返回：" + (typeof result.response === "string" ? result.response : JSON.stringify(result.response)));
    if (result.currentUrl) lines.push("后台页面：" + result.currentUrl);
    lines.push("");
    lines.push("关键日志：");
    logs.slice(-12).forEach((line) => lines.push("- " + line));
    return lines.join("\n");
  }

  async function uploadLanguagePackage() {
    el.upload.disabled = true;
    setStatus("正在上传语言包，请不要关闭自动打开的后台浏览器...");
    writeOutput("语言包上传执行中。系统会复用或登录商城后台，然后直接提交 /language/upload。");
    try {
      const response = await fetch(serviceBase + "/api/language-package/upload", {
        method: "POST",
        body: buildFormData()
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "语言包上传失败");
      writeOutput(renderResult(payload));
      setStatus("语言包上传完成。", "ok");
    } catch (error) {
      setStatus("语言包上传失败：" + (error.message || error), "warn");
      writeOutput("语言包上传失败：\n" + (error.message || error));
    } finally {
      el.upload.disabled = false;
    }
  }

  function setLocalI18nStatus(message, type) {
    if (!el.localI18nStatus) return;
    el.localI18nStatus.textContent = message;
    el.localI18nStatus.className = "status" + (type ? " " + type : "");
  }

  function localI18nPathInputs() {
    return {
      htmlFile: el.localI18nHtmlPath,
      productFile: el.localI18nProductPackagePath,
      globalFile: el.localI18nGlobalPackagePath,
      templateFile: el.localI18nTemplatePath,
      outputDir: el.localI18nOutputPath,
      outputFile: el.localI18nOutputFilePath
    };
  }

  function localI18nPathValues() {
    return Object.fromEntries(Object.entries(localI18nPathInputs()).map(([key, input]) => [key, input?.value.trim() || ""]));
  }

  function showLocalI18nPaths() {
    const productName = el.localI18nProductName?.value.trim() || "产品名称";
    el.localI18nHtmlPath.placeholder = `自动匹配 ${productName} 的 HTML`;
    el.localI18nProductPackagePath.placeholder = `自动匹配 D:\\产品\\${productName} 内的单产品 Excel`;
    el.localI18nGlobalPackagePath.placeholder = "自动使用 Downloads 中数字后缀最大的 en-US.xls/xlsx";
    el.localI18nTemplatePath.placeholder = "D:\\产品\\HB90 Dual 3K Kit\\upload\\HB90 Dual 3K Kit datasheet.xlsx";
    el.localI18nOutputPath.placeholder = `D:\\产品\\${productName}\\upload`;
    el.localI18nOutputFilePath.placeholder = `D:\\产品\\${productName}\\upload\\${productName} datasheet.xlsx`;
  }

  async function loadLocalI18nPaths() {
    try {
      const response = await fetch(serviceBase + "/api/language-package/local-i18n-paths");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "默认路径读取失败");
      const paths = payload.paths || {};
      Object.entries(localI18nPathInputs()).forEach(([key, input]) => { input.value = paths[key] || ""; });
      showLocalI18nPaths();
    } catch (error) {
      setLocalI18nStatus("默认路径读取失败：" + (error.message || error), "warn");
    }
  }

  async function syncLocalI18nPaths() {
    el.localI18nSyncPaths.disabled = true;
    try {
      const response = await fetch(serviceBase + "/api/language-package/local-i18n-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localI18nPathValues())
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "默认路径保存失败");
      Object.entries(localI18nPathInputs()).forEach(([key, input]) => { input.value = payload.paths?.[key] || ""; });
      showLocalI18nPaths();
      setLocalI18nStatus("所有默认路径已同步。", "ok");
    } catch (error) {
      setLocalI18nStatus("默认路径同步失败：" + (error.message || error), "warn");
    } finally {
      el.localI18nSyncPaths.disabled = false;
    }
  }

  async function generateLocalI18nDatasheet() {
    const productName = el.localI18nProductName?.value.trim();
    if (!productName) {
      setLocalI18nStatus("请先填写产品名称。", "warn");
      return;
    }
    el.localI18nGenerate.disabled = true;
    setLocalI18nStatus("正在生成 Datasheet、备份并替换 HTML 语言包字段...");
    el.localI18nOutput.value = "生成中...";
    try {
      const response = await fetch(serviceBase + "/api/language-package/local-i18n-datasheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, ...localI18nPathValues() })
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "生成失败");
      const result = payload.result || {};
      el.localI18nOutput.value = [
        "生成完成",
        "输出文件：" + result.outputFile,
        "HTML：" + result.htmlFile,
        "HTML 原文件备份：" + (result.htmlBackupFile || "无需备份（没有待替换文案）"),
        "HTML 字段替换：" + result.htmlReplacementCount + " 处",
        "总语言包：" + result.globalFile,
        "单产品 Excel：" + result.productFile,
        "样式模板：" + result.templateFile,
        "输出目录：" + result.outputDir,
        "本产品字段：" + result.productFieldCount,
        "需复查字段：" + result.foreignFieldCount
      ].join("\n");
      setLocalI18nStatus("Datasheet 已生成，HTML 语言包字段已替换。", "ok");
    } catch (error) {
      setLocalI18nStatus("生成失败：" + (error.message || error), "warn");
      el.localI18nOutput.value = "生成失败：\n" + (error.message || error);
    } finally {
      el.localI18nGenerate.disabled = false;
    }
  }

  function setDatasheetStatus(message, type) {
    el.datasheetStatus.textContent = message;
    el.datasheetStatus.className = "status" + (type ? " " + type : "");
  }

  function renderDatasheetMappings() {
    if (!datasheetInfo) return;
    const selected = selectedSiteCodes();
    if (!selected.length) {
      el.datasheetMappings.textContent = "请先在上方选择站点。";
      el.datasheetPreview.disabled = true;
      return;
    }
    const previous = new Map(Array.from(
      el.datasheetMappings.querySelectorAll("select[data-site-code]")
    ).map((select) => [select.dataset.siteCode, select.value]));
    el.datasheetMappings.innerHTML = "";
    selected.forEach((siteCode) => {
      const site = sites.find((item) => item.siteCode === siteCode);
      const row = document.createElement("div");
      row.className = "revision-target-row";
      const label = document.createElement("label");
      label.textContent = (site ? site.name : siteCode) + " (" + siteCode + ")";
      const select = document.createElement("select");
      select.dataset.siteCode = siteCode;
      const automatic = document.createElement("option");
      automatic.value = "";
      automatic.textContent = "自动按语种说明匹配";
      select.appendChild(automatic);
      datasheetInfo.headers.forEach((header) => {
        const option = document.createElement("option");
        option.value = header;
        option.textContent = header;
        select.appendChild(option);
      });
      select.value = previous.get(siteCode) || "";
      row.appendChild(label);
      row.appendChild(select);
      el.datasheetMappings.appendChild(row);
    });
    el.datasheetPreview.disabled = false;
  }

  function datasheetTargets() {
    return Array.from(el.datasheetMappings.querySelectorAll("select[data-site-code]"))
      .map((select) => ({
        siteCode: select.dataset.siteCode,
        languagePackageHeader: select.value
      }));
  }

  function buildDatasheetFormData(submit) {
    const file = el.datasheet.files && el.datasheet.files[0];
    if (!file) throw new Error("请先选择单产品 Datasheet。");
    const targets = datasheetTargets();
    if (!targets.length) throw new Error("请至少选择一个站点。");
    const formData = new FormData();
    formData.append("datasheet", file, file.name);
    formData.append("targets", JSON.stringify(targets));
    formData.append("skipMissingFields", "true");
    formData.append("shopUsername", el.username.value.trim());
    formData.append("shopPassword", el.password.value);
    if (submit) {
      formData.append("expectedDatasheetFingerprint", datasheetPreview.datasheet.fingerprint);
      const fingerprints = {};
      datasheetPreview.sites.forEach((item) => {
        if (item.fingerprint) fingerprints[item.site.siteCode] = item.fingerprint;
      });
      formData.append("expectedFingerprints", JSON.stringify(fingerprints));
    }
    return formData;
  }

  function formatDatasheetResult(payload) {
    const result = payload.result || {};
    const lines = [
      "Datasheet：" + (result.datasheet?.sheetName || ""),
      "字段数：" + (result.datasheet?.fieldCount || 0),
      ""
    ];
    (result.sites || []).forEach((item) => {
      const plan = item.plan || {};
      lines.push((item.site?.name || item.site?.siteCode || "站点") + "：" + item.status);
      if (item.error) lines.push("  错误：" + item.error);
      if (item.rollback) lines.push("  回滚：" + item.rollback);
      if (plan.translationHeader) lines.push("  译文列：" + plan.translationHeader);
      if (item.plan) {
        lines.push("  覆盖 " + plan.changedCellCount + "，新增 " + plan.appendedFieldCount
          + "，不变 " + plan.unchangedCellCount + "，空译文跳过 " + plan.skippedBlankCount);
        if (plan.skippedMissingFieldCount) {
          lines.push("  站点缺失 Key 跳过 " + plan.skippedMissingFieldCount + "（不安全追加）。");
        }
        if (plan.sourceMismatches?.length) {
          lines.push("  提醒：" + plan.sourceMismatches.length + " 个字段英文原文与站点语言包不同，Key 匹配结果已保留。");
        }
      }
      lines.push("");
    });
    return lines.join("\n");
  }

  async function inspectDatasheet() {
    const file = el.datasheet.files && el.datasheet.files[0];
    if (!file) return setDatasheetStatus("请先选择单产品 Datasheet。", "warn");
    const formData = new FormData();
    formData.append("datasheet", file, file.name);
    el.datasheetInspect.disabled = true;
    try {
      const response = await fetch(serviceBase + "/api/language-package/datasheet-inspect", {
        method: "POST", body: formData
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Datasheet 识别失败");
      datasheetInfo = payload.result;
      datasheetPreview = null;
      el.datasheetSubmit.disabled = true;
      renderDatasheetMappings();
      setDatasheetStatus("已识别 " + datasheetInfo.headers.length + " 个语言列、"
        + datasheetInfo.fieldCount + " 个字段。", "ok");
    } catch (error) {
      setDatasheetStatus("Datasheet 识别失败：" + (error.message || error), "warn");
    } finally {
      el.datasheetInspect.disabled = false;
    }
  }

  async function runDatasheet(action) {
    const submit = action === "submit";
    if (submit && !datasheetPreview) return;
    el.datasheetPreview.disabled = true;
    el.datasheetSubmit.disabled = true;
    setDatasheetStatus(submit ? "正在逐站更新并回读语言包..." : "正在逐站下载并预览语言包...");
    try {
      const response = await fetch(
        serviceBase + "/api/language-package/datasheet-" + action,
        { method: "POST", body: buildDatasheetFormData(submit) }
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "操作失败");
      el.datasheetOutput.value = formatDatasheetResult(payload);
      if (!submit) {
        datasheetPreview = payload.result;
        el.datasheetSubmit.disabled = payload.result.sites.some((item) => item.status === "failed")
          || !payload.result.sites.some((item) => item.status === "ready");
      }
      setDatasheetStatus(submit ? "语言包更新流程完成。" : "预览完成，请核对后确认上传。", "ok");
    } catch (error) {
      setDatasheetStatus("操作失败：" + (error.message || error), "warn");
      el.datasheetOutput.value = "操作失败：\n" + (error.message || error);
    } finally {
      el.datasheetPreview.disabled = !datasheetInfo || !selectedSiteCodes().length;
    }
  }

  el.reload.addEventListener("click", loadSites);
  el.selectAll.addEventListener("click", () => {
    el.sites.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = true;
    });
    datasheetPreview = null;
    el.datasheetSubmit.disabled = true;
    renderDatasheetMappings();
  });
  el.clearSites.addEventListener("click", () => {
    el.sites.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = false;
    });
    datasheetPreview = null;
    el.datasheetSubmit.disabled = true;
    renderDatasheetMappings();
  });
  el.upload.addEventListener("click", uploadLanguagePackage);
  el.sites.addEventListener("change", () => {
    datasheetPreview = null;
    el.datasheetSubmit.disabled = true;
    renderDatasheetMappings();
  });
  el.datasheet.addEventListener("change", () => {
    datasheetInfo = null;
    datasheetPreview = null;
    el.datasheetPreview.disabled = true;
    el.datasheetSubmit.disabled = true;
  });
  el.datasheetInspect.addEventListener("click", inspectDatasheet);
  el.datasheetMappings.addEventListener("change", () => {
    datasheetPreview = null;
    el.datasheetSubmit.disabled = true;
  });
  el.datasheetPreview.addEventListener("click", () => runDatasheet("preview"));
  el.datasheetSubmit.addEventListener("click", () => runDatasheet("submit"));

  loadSites();
  if (el.localI18nGenerate) el.localI18nGenerate.addEventListener("click", generateLocalI18nDatasheet);
  if (el.localI18nSyncPaths) el.localI18nSyncPaths.addEventListener("click", syncLocalI18nPaths);
  if (el.localI18nProductName) {
    el.localI18nProductName.addEventListener("input", () => showLocalI18nPaths());
    showLocalI18nPaths();
    loadLocalI18nPaths();
  }
})();
