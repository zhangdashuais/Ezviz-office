(function () {
  const referenceInput = document.getElementById("emptyLinkReferenceProduct");
  const productsInput = document.getElementById("emptyLinkProductNames");
  const detailInput = document.getElementById("emptyLinkDetailHtml");
  const previewButton = document.getElementById("emptyLinkPreview");
  const submitButton = document.getElementById("emptyLinkSubmit");
  const statusElement = document.getElementById("emptyLinkStatus");
  const outputElement = document.getElementById("emptyLinkOutput");
  if (!referenceInput || !productsInput || !detailInput || !previewButton
    || !submitButton || !statusElement || !outputElement) return;

  let preview = null;
  let previewSignature = "";

  function signature() {
    return JSON.stringify([
      referenceInput.value.trim(),
      productsInput.value.trim(),
      detailInput.value.trim()
    ]);
  }

  function invalidate() {
    preview = null;
    previewSignature = "";
    submitButton.disabled = true;
  }

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function form(extra = {}) {
    const body = new URLSearchParams({
      referenceProductName: referenceInput.value.trim(),
      productNames: productsInput.value.trim(),
      detailHtml: detailInput.value.trim(),
      ...extra
    });
    return body;
  }

  async function post(action, extra) {
    const response = await fetch(`/api/product-empty-link/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form(extra)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
      error.logs = data.logs || [];
      throw error;
    }
    return data;
  }

  function render(data) {
    const result = data.result;
    const submitting = result.mode === "product-empty-link-submit";
    const lines = [
      submitting ? "产品空链接创建结果" : "产品空链接预览（尚未创建）",
      `站点：${result.site.name} (${result.site.siteCode})`,
      `参考产品：${result.reference.productName} / Goods ID ${result.reference.goodsId}`,
      `参考配置：相册 ${result.reference.imageCount} 张，规格 ${result.reference.specificationCount} 条`,
      `PC / 移动端详情：${result.detailHtml}`,
      "Searchable：关闭",
      submitting
        ? `产品 ${result.productCount} 个：完成 ${result.completedCount}，已存在 ${result.existingCount}，失败 ${result.failedCount}`
        : `产品 ${result.productCount} 个：可创建 ${result.readyCount}，已存在 ${result.existingCount}`,
      ""
    ];
    result.results.forEach((item) => {
      const label = item.status === "ready" ? "待创建"
        : item.status === "completed" ? "创建并回读通过"
          : item.status === "already-exists" ? "跳过（已存在）" : "失败";
      lines.push(`- ${item.productName} | ${label}${item.error ? ` | ${item.error}` : ""}`);
      if (item.productUrl) lines.push(`  ${item.productUrl}`);
    });
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => `- ${line}`));
    outputElement.value = lines.join("\n");
  }

  [referenceInput, productsInput, detailInput].forEach((element) =>
    element.addEventListener("input", invalidate));

  previewButton.addEventListener("click", async () => {
    invalidate();
    previewButton.disabled = true;
    setStatus("正在登录国际站并检查参考产品、配置和重名，不会创建产品...");
    try {
      const data = await post("preview");
      preview = data.result;
      previewSignature = signature();
      render(data);
      submitButton.disabled = !preview.readyCount;
      setStatus(`预览完成：可创建 ${preview.readyCount}，已存在 ${preview.existingCount}。`, "ok");
    } catch (error) {
      outputElement.value = [error.message, ...(error.logs || [])].join("\n");
      setStatus(`预览失败：${error.message}`, "warn");
    } finally {
      previewButton.disabled = false;
    }
  });

  submitButton.addEventListener("click", async () => {
    if (!preview || signature() !== previewSignature) {
      invalidate();
      setStatus("输入内容已变化，请重新预览。", "warn");
      return;
    }
    if (!window.confirm(`将通过 Manual Add 创建 ${preview.readyCount} 个国际站产品空链接，确认继续？`)) return;
    previewButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在逐个创建并回读验证，请勿关闭页面...");
    try {
      const data = await post("submit", { previewFingerprint: preview.previewFingerprint });
      render(data);
      setStatus(
        `执行完成：成功 ${data.result.completedCount}，失败 ${data.result.failedCount}。`,
        data.result.failedCount ? "warn" : "ok"
      );
      invalidate();
    } catch (error) {
      outputElement.value = [error.message, ...(error.logs || [])].join("\n");
      setStatus(`创建失败：${error.message}`, "warn");
    } finally {
      previewButton.disabled = false;
    }
  });
})();
