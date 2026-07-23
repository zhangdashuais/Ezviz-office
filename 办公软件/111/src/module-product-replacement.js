/** 后台产品替换：当前阶段只读 Details 下的 Overview 与 Specifications。 */
(function () {
  const serviceBase = window.location.origin;
  const siteSelect = document.getElementById("productReplaceSiteSelect");
  const productInput = document.getElementById("productReplaceNameInput");
  const usernameInput = document.getElementById("productReplaceUsernameInput");
  const passwordInput = document.getElementById("productReplacePasswordInput");
  const readButton = document.getElementById("productReplaceReadDetailBtn");
  const statusElement = document.getElementById("productReplaceStatus");
  const overviewOutput = document.getElementById("productReplaceOverviewOutput");
  const specificationsOutput = document.getElementById("productReplaceSpecificationsOutput");
  const logsOutput = document.getElementById("productReplaceLogsOutput");
  if (!siteSelect || !productInput || !readButton || !statusElement
    || !overviewOutput || !specificationsOutput || !logsOutput) return;

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  async function loadSites() {
    siteSelect.disabled = true;
    try {
      const response = await fetch(serviceBase + "/api/campaign/sites");
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "站点加载失败");
      const sites = (data.sites || []).filter((site) => site.enabled !== false);
      siteSelect.innerHTML = "";
      sites.forEach((site) => {
        const option = document.createElement("option");
        option.value = site.siteCode;
        option.textContent = `${site.name} (${site.siteCode})`;
        siteSelect.appendChild(option);
      });
      if (sites.some((site) => site.siteCode === "hq")) siteSelect.value = "hq";
      setStatus(`已加载 ${sites.length} 个站点。请选择站点并填写产品名称。`, "ok");
    } catch (error) {
      siteSelect.innerHTML = '<option value="">站点加载失败</option>';
      setStatus("站点加载失败：" + (error.message || error), "warn");
    } finally {
      siteSelect.disabled = false;
    }
  }

  readButton.addEventListener("click", async () => {
    const siteCode = siteSelect.value;
    const productName = productInput.value.trim();
    if (!siteCode) {
      setStatus("请选择国家站点。", "warn");
      return;
    }
    if (!productName) {
      setStatus("请填写产品名称。", "warn");
      return;
    }
    overviewOutput.value = "";
    specificationsOutput.value = "";
    logsOutput.value = "";
    readButton.disabled = true;
    setStatus(`正在登录 ${siteSelect.selectedOptions?.[0]?.textContent || siteCode} 后台并读取 ${productName}，不会保存产品...`);
    try {
      const payload = {
        sites: [siteCode],
        productName,
        shopUsername: usernameInput?.value.trim() || "",
        shopPassword: passwordInput?.value || ""
      };
      const response = await fetch(serviceBase + "/api/product-replacement/detail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `读取失败（HTTP ${response.status}）`);
      const result = data.result;
      overviewOutput.value = result.detail.overview || "";
      specificationsOutput.value = result.detail.specifications || "";
      logsOutput.value = [
        `站点：${result.site.name} (${result.site.siteCode})`,
        `后台身份：${result.authenticatedIdentity}`,
        `产品：${result.productName}`,
        `Goods ID：${result.goodsId}`,
        `编辑页：${result.editUrl}`,
        `模式：${result.mode}`,
        "",
        "执行日志：",
        ...(data.logs || []).map((line) => "- " + line)
      ].join("\n");
      setStatus(
        `读取成功：Overview ${result.detail.overview.length} 字符，Specifications ${result.detail.specifications.length} 字符。`,
        "ok"
      );
    } catch (error) {
      setStatus("读取失败：" + (error.message || error), "warn");
    } finally {
      readButton.disabled = false;
    }
  });

  loadSites();
})();
