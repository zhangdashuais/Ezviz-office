/** 后台产品替换：批量只读 Details 下的 Overview 与 Specifications。 */
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
      setStatus(`已加载 ${sites.length} 个站点。请选择站点并填写一个或多个产品名称。`, "ok");
    } catch (error) {
      siteSelect.innerHTML = '<option value="">站点加载失败</option>';
      setStatus("站点加载失败：" + (error.message || error), "warn");
    } finally {
      siteSelect.disabled = false;
    }
  }

  readButton.addEventListener("click", async () => {
    const siteCode = siteSelect.value;
    const productNames = productInput.value.trim();
    if (!siteCode) {
      setStatus("请选择国家站点。", "warn");
      return;
    }
    if (!productNames) {
      setStatus("请填写至少一个产品名称。", "warn");
      return;
    }
    overviewOutput.value = "";
    specificationsOutput.value = "";
    logsOutput.value = "";
    readButton.disabled = true;
    setStatus(`正在登录 ${siteSelect.selectedOptions?.[0]?.textContent || siteCode} 后台并批量读取产品，不会保存产品...`);
    try {
      const payload = {
        sites: [siteCode],
        productNames,
        shopUsername: usernameInput?.value.trim() || "",
        shopPassword: passwordInput?.value || ""
      };
      const response = await fetch(serviceBase + "/api/product-replacement/details", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `读取失败（HTTP ${response.status}）`);
      const result = data.result;
      const completed = (result.results || []).filter((item) => item.status === "completed");
      const failed = (result.results || []).filter((item) => item.status === "failed");
      overviewOutput.value = completed.map((item) =>
        `===== ${item.productName} | Goods ID ${item.goodsId} =====\n${item.detail.overview || ""}`
      ).join("\n\n");
      specificationsOutput.value = completed.map((item) =>
        `===== ${item.productName} | Goods ID ${item.goodsId} =====\n${item.detail.specifications || ""}`
      ).join("\n\n");
      logsOutput.value = [
        `站点：${result.site.name} (${result.site.siteCode})`,
        `后台身份：${result.authenticatedIdentity}`,
        `模式：${result.mode}`,
        `请求：${result.requestedCount}，成功：${result.successCount}，失败：${result.failedCount}`,
        "",
        "产品结果：",
        ...(result.results || []).map((item) => item.status === "completed"
          ? `- 成功 | ${item.productName} | Goods ID ${item.goodsId} | ${item.editUrl}`
          : `- 失败 | ${item.productName} | ${item.error}`),
        "",
        "执行日志：",
        ...(data.logs || []).map((line) => "- " + line)
      ].join("\n");
      setStatus(
        `批量读取完成：成功 ${completed.length} 个，失败 ${failed.length} 个。`,
        failed.length ? "warn" : "ok"
      );
    } catch (error) {
      setStatus("读取失败：" + (error.message || error), "warn");
    } finally {
      readButton.disabled = false;
    }
  });

  loadSites();
})();
