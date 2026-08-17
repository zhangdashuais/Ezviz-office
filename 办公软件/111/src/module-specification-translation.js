(function () {
  const byId = (id) => document.getElementById(id);
  const site = byId("specTranslationSite");
  const referenceUrl = byId("specTranslationReferenceUrl");
  const preview = byId("specTranslationPreview");
  const submit = byId("specTranslationSubmit");
  const status = byId("specTranslationStatus");
  const output = byId("specTranslationHtml");
  const logs = byId("specTranslationLogs");
  if (!preview) return;
  let previewFingerprint = "";

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status" + (type ? " " + type : "");
  }

  function fingerprint() {
    return JSON.stringify({ siteCode: site.value, referenceUrl: referenceUrl.value.trim() });
  }

  function invalidatePreview() {
    previewFingerprint = "";
    submit.disabled = true;
  }

  async function loadSites() {
    try {
      const response = await fetch("/api/campaign/sites");
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "站点加载失败");
      const sites = (data.sites || []).filter((item) => item.enabled !== false);
      site.innerHTML = sites.map((item) => `<option value="${item.siteCode}">${item.name || item.siteName || item.siteCode} (${item.siteCode})</option>`).join("");
      setStatus("请选择站点，并填写该站点一个已翻译的产品详情页地址。");
    } catch (error) {
      setStatus("站点加载失败：" + error.message, "warn");
    }
  }

  async function run(endpoint) {
    if (!site.value) throw new Error("请选择站点。");
    if (!/^https:\/\//i.test(referenceUrl.value.trim())) throw new Error("请填写已翻译详情页的 HTTPS 地址。");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteCode: site.value, referenceUrl: referenceUrl.value.trim() })
    });
    const data = await response.json();
    logs.value = (data.logs || []).join("\n");
    if (!response.ok || !data.ok) throw new Error(data.error || "请求失败。");
    const result = data.result;
    output.value = [
      `取得译文：${result.translatedTerm}`,
      `产品总数：${result.total}`,
      `有命中产品：${result.changed}`,
      `替换总数：${result.replacements}`,
      "",
      ...result.results.map((item) => `${item.name || item.goodsId || "未命名产品"}\t${item.status}\t${item.replaced} 处${item.reason ? `\t${item.reason}` : ""}`)
    ].join("\n");
    return result;
  }

  site.addEventListener("change", invalidatePreview);
  referenceUrl.addEventListener("input", invalidatePreview);

  preview.addEventListener("click", async () => {
    preview.disabled = true;
    invalidatePreview();
    setStatus("正在读取译文并扫描当前站点全部产品…");
    try {
      const result = await run("/api/specification/preview");
      previewFingerprint = fingerprint();
      submit.disabled = result.changed === 0;
      setStatus(`预览完成：译文“${result.translatedTerm}”，${result.changed}/${result.total} 个产品共命中 ${result.replacements} 处。`, "ok");
    } catch (error) {
      setStatus("预览失败：" + error.message, "warn");
    } finally {
      preview.disabled = false;
    }
  });

  submit.addEventListener("click", async () => {
    if (previewFingerprint !== fingerprint()) return invalidatePreview();
    submit.disabled = true;
    setStatus("正在逐个保存并记录批量替换结果…");
    try {
      const result = await run("/api/specification/submit");
      previewFingerprint = "";
      setStatus(`批量替换完成：已处理 ${result.changed} 个产品，共替换 ${result.replacements} 处。`, "ok");
    } catch (error) {
      setStatus("批量替换失败：" + error.message, "warn");
      submit.disabled = false;
    }
  });

  loadSites();
})();
