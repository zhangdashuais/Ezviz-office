(function () {
  const $ = (id) => document.getElementById(id);
  const elements = {
    pdf: $("textComparePdfInput"),
    html: $("textCompareHtmlInput"),
    compare: $("textCompareRunBtn"),
    clear: $("textCompareClearBtn"),
    download: $("textCompareDownloadBtn"),
    status: $("textCompareStatus"),
    summary: $("textCompareSummary"),
    recommendations: $("textCompareRecommendations"),
    recommendationList: $("textCompareRecommendationList"),
    filters: $("textCompareFilters"),
    typeFilter: $("textCompareTypeFilter"),
    search: $("textCompareSearchInput"),
    tableBody: $("textCompareTableBody"),
    empty: $("textCompareEmpty")
  };

  if (!elements.compare) return;

  let lastResult = null;

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = "status" + (type ? " " + type : "");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/\u00a0/g, " ")
      .replace(/\ufb00/g, "ff")
      .replace(/\ufb01/g, "fi")
      .replace(/\ufb02/g, "fl")
      .replace(/\ufb03/g, "ffi")
      .replace(/\ufb04/g, "ffl")
      .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function summaryCard(label, value, className) {
    const card = document.createElement("div");
    card.className = "text-compare-summary-card " + (className || "");
    const number = document.createElement("strong");
    number.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = label;
    card.append(number, caption);
    return card;
  }

  function renderSummary(summary) {
    elements.summary.replaceChildren(
      summaryCard("PDF 页数", summary.pdfPages),
      summaryCard("完全/近似一致", summary.match, "is-match"),
      summaryCard("文字有修改", summary.changed, "is-changed"),
      summaryCard("HTML 缺少", summary.missing, "is-missing"),
      summaryCard("HTML 多出", summary.extra, "is-extra"),
      summaryCard("数值/单位风险", summary.critical, "is-critical"),
      summaryCard("PDF 匹配率", `${summary.matchRate}%`),
      summaryCard("核验结论", {
        pass: "通过",
        warning: "需确认",
        fail: "需修正"
      }[summary.verdict] || "-")
    );
    elements.summary.hidden = false;
  }

  function renderRecommendations(result) {
    const fragment = document.createDocumentFragment();
    const verdict = document.createElement("p");
    verdict.className = `text-compare-verdict is-${result.summary.verdict}`;
    verdict.textContent = result.summary.verdictText;
    fragment.appendChild(verdict);
    (result.recommendations || []).forEach((recommendation) => {
      const item = document.createElement("div");
      item.className = `text-compare-recommendation is-${recommendation.level}`;
      item.textContent = recommendation.message;
      fragment.appendChild(item);
    });
    elements.recommendationList.replaceChildren(fragment);
    elements.recommendations.hidden = false;
  }

  function typeLabel(item) {
    if (item.critical) return "数值/单位风险";
    return {
      match: "一致",
      changed: "文字有修改",
      missing: "HTML 缺少",
      extra: "HTML 多出"
    }[item.type] || item.type;
  }

  function renderTable() {
    if (!lastResult) return;
    const selected = elements.typeFilter.value;
    const query = normalizeText(elements.search.value).toLocaleLowerCase();
    const items = lastResult.items.filter((item) => {
      if (selected === "differences" && item.type === "match") return false;
      if (selected === "critical" && !item.critical) return false;
      if (!["all", "differences", "critical"].includes(selected) && item.type !== selected) return false;
      if (!query) return true;
      return `${item.pdfText} ${item.htmlText}`.toLocaleLowerCase().includes(query);
    });

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const row = document.createElement("tr");
      row.className = `text-compare-row type-${item.type}${item.critical ? " is-critical" : ""}`;

      const typeCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "text-compare-badge";
      badge.textContent = typeLabel(item);
      typeCell.appendChild(badge);

      const pageCell = document.createElement("td");
      pageCell.textContent = item.page ? `第 ${item.page} 页` : "-";

      const pdfCell = document.createElement("td");
      pdfCell.textContent = item.pdfText || "-";

      const htmlCell = document.createElement("td");
      htmlCell.textContent = item.htmlText || "-";
      if (item.htmlTag) {
        const tag = document.createElement("small");
        tag.textContent = `<${item.htmlTag}>`;
        htmlCell.prepend(tag);
      }

      const similarityCell = document.createElement("td");
      similarityCell.textContent = item.similarity
        ? `${Math.round(item.similarity * 100)}%`
        : "-";
      const suggestionCell = document.createElement("td");
      suggestionCell.textContent = item.suggestion || "-";
      row.append(
        typeCell,
        pageCell,
        pdfCell,
        htmlCell,
        similarityCell,
        suggestionCell
      );
      fragment.appendChild(row);
    });
    elements.tableBody.replaceChildren(fragment);
    elements.empty.hidden = items.length > 0;
  }

  async function runComparison() {
    const pdfFile = elements.pdf.files?.[0];
    const htmlFile = elements.html.files?.[0];
    if (!pdfFile || !htmlFile) {
      setStatus("请同时选择一份 PDF 和一份 HTML 文件。", "warn");
      return;
    }

    elements.compare.disabled = true;
    elements.download.disabled = true;
    elements.summary.hidden = true;
    elements.recommendations.hidden = true;
    elements.filters.hidden = true;
    elements.tableBody.replaceChildren();
    elements.empty.hidden = true;
    try {
      setStatus("正在上传文件，服务器将自动提取并核验文字...");
      const formData = new FormData();
      formData.append("pdfFile", pdfFile, pdfFile.name);
      formData.append("htmlFile", htmlFile, htmlFile.name);
      const response = await fetch("/api/text-comparison/verify", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      lastResult = payload.result;
      renderSummary(lastResult.summary);
      renderRecommendations(lastResult);
      elements.filters.hidden = false;
      elements.typeFilter.value = "differences";
      elements.search.value = "";
      renderTable();
      elements.download.disabled = false;
      const differenceCount = lastResult.summary.changed
        + lastResult.summary.missing
        + lastResult.summary.extra;
      setStatus(
        `${lastResult.summary.verdictText} 共发现 ${differenceCount} 条文字差异，其中 ${lastResult.summary.critical} 条包含数值或单位风险。`,
        lastResult.summary.verdict === "pass" ? "ok" : "warn"
      );
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), "warn");
    } finally {
      elements.compare.disabled = false;
    }
  }

  function clearResult() {
    lastResult = null;
    elements.pdf.value = "";
    elements.html.value = "";
    elements.summary.hidden = true;
    elements.recommendations.hidden = true;
    elements.filters.hidden = true;
    elements.tableBody.replaceChildren();
    elements.empty.hidden = true;
    elements.download.disabled = true;
    setStatus("请选择需要对比的 PDF 和 HTML 文件。");
  }

  function downloadResult() {
    if (!lastResult) return;
    const blob = new Blob(
      [JSON.stringify(lastResult, null, 2)],
      { type: "application/json;charset=utf-8" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${lastResult.files.pdf || "PDF"}-vs-${lastResult.files.html || "HTML"}-文字对比.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  elements.compare.addEventListener("click", runComparison);
  elements.clear.addEventListener("click", clearResult);
  elements.download.addEventListener("click", downloadResult);
  elements.typeFilter.addEventListener("change", renderTable);
  elements.search.addEventListener("input", renderTable);
})();
