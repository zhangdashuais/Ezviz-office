/** 只读搜索产品已上线的 EZVIZ 国家站点。 */
(() => {
  "use strict";

  const productNameInput = document.getElementById("availabilityProductName");
  const searchButton = document.getElementById("availabilitySearchButton");
  const statusElement = document.getElementById("availabilityStatus");
  const outputElement = document.getElementById("availabilityOutput");
  if (!productNameInput || !searchButton || !statusElement || !outputElement) return;

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function render(result) {
    const lines = [
      "产品已上线站点搜索结果",
      `产品：${result.productName}`,
      `匹配规则：${result.matchRule}`,
      `官网站点 ${result.siteCount}：命中 ${result.matchedCount}，未找到 ${result.notFoundCount}，失败 ${result.failedCount}`,
      "",
      "命中站点："
    ];
    const matched = result.results.filter((item) => item.status === "matched");
    if (!matched.length) lines.push("- 无");
    matched.forEach((item) => {
      lines.push(`- ${item.site.name} (${item.site.siteCode})`);
      item.matches.forEach((match) => lines.push(`  ${match.name} | ${match.url}`));
    });
    const candidates = result.results.filter((item) => item.candidates?.length);
    if (candidates.length) {
      lines.push("", "未精确匹配但官网返回了候选：");
      candidates.forEach((item) => {
        lines.push(`- ${item.site.name} (${item.site.siteCode})`);
        item.candidates.slice(0, 5).forEach((candidate) =>
          lines.push(`  ${candidate.name} | ${candidate.url}`));
      });
    }
    const failed = result.results.filter((item) => item.status === "failed");
    if (failed.length) {
      lines.push("", "搜索失败站点：");
      failed.forEach((item) => lines.push(`- ${item.site.name} (${item.site.siteCode}) | ${item.error}`));
    }
    outputElement.value = lines.join("\n");
  }

  async function search() {
    const productName = productNameInput.value.trim();
    if (!productName) {
      setStatus("请填写产品名称。", "warn");
      productNameInput.focus();
      return;
    }
    searchButton.disabled = true;
    outputElement.value = "";
    setStatus("正在搜索全部国家官网...");
    try {
      const form = new FormData();
      form.append("productName", productName);
      const response = await fetch("/api/product-availability/search", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "搜索失败");
      render(data.result);
      setStatus(`搜索完成：命中 ${data.result.matchedCount}/${data.result.siteCount} 个站点，失败 ${data.result.failedCount}。`,
        data.result.failedCount ? "warn" : "ok");
    } catch (error) {
      setStatus(`搜索失败：${error?.message || String(error)}`, "warn");
    } finally {
      searchButton.disabled = false;
    }
  }

  searchButton.addEventListener("click", search);
  productNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") search();
  });
})();
