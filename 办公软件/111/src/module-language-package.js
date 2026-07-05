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
    output: document.getElementById("languageOutput")
  };

  if (!el.sites || !el.upload) return;
  let sites = [];

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
  el.upload.addEventListener("click", uploadLanguagePackage);

  loadSites();
})();
