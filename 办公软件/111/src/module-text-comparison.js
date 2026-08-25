(function () {
  const $ = (id) => document.getElementById(id);
  const elements = {
    pdf: $("textComparePdfInput"),
    html: $("textCompareHtmlInput"),
    languagePackage: $("textCompareLanguageInput"),
    languageColumn: $("textCompareLanguageColumn"),
    compare: $("textCompareRunBtn"),
    clear: $("textCompareClearBtn"),
    download: $("textCompareDownloadBtn"),
    downloadFieldEdits: $("textCompareDownloadFieldEditsBtn"),
    status: $("textCompareStatus"),
    summary: $("textCompareSummary"),
    recommendations: $("textCompareRecommendations"),
    recommendationList: $("textCompareRecommendationList"),
    modifiedHtmlPanel: $("textCompareModifiedHtmlPanel"),
    modifiedHtmlMeta: $("textCompareModifiedHtmlMeta"),
    modifiedHtmlOutput: $("textCompareModifiedHtmlOutput"),
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
    const languageReplacement = lastResult?.languageReplacement || null;
    const cards = [
      summaryCard("PDF 页数", summary.pdfPages),
      summaryCard("已排除 Specification", `${summary.excludedSpecificationPages || 0} 页 / ${summary.excludedSpecificationSegments || 0} 条`),
      summaryCard("HTML 已包含", summary.match, "is-match"),
      summaryCard("HTML 未包含", summary.missing, "is-missing"),
      summaryCard("数值/单位风险", summary.critical, "is-critical"),
      summaryCard("字段修改建议", summary.languageFieldSuggestionCount || 0, summary.languageFieldSuggestionCount ? "is-changed" : ""),
      summaryCard("PDF 包含率", `${summary.matchRate}%`),
      summaryCard("核验结论", {
        pass: "通过",
        warning: "需确认",
        fail: "需修正"
      }[summary.verdict] || "-")
    ];
    if (languageReplacement) {
      cards.splice(2, 0, summaryCard(
        "语言字段还原",
        `${languageReplacement.replacementCount || 0} 处 / 缺 ${languageReplacement.missingFieldCount || 0}`,
        languageReplacement.missingFieldCount ? "is-changed" : "is-match"
      ));
    }
    elements.summary.replaceChildren(
      ...cards
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
      match: "HTML 已包含",
      missing: "HTML 未包含"
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

      const sectionCell = document.createElement("td");
      sectionCell.textContent = item.htmlSection || "-";

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
      similarityCell.textContent = item.type === "match" ? "包含" : "未包含";
      const suggestionCell = document.createElement("td");
      suggestionCell.textContent = item.suggestion || "-";
      if (item.languageFieldSuggestions?.length) {
        suggestionCell.textContent = "";
        item.languageFieldSuggestions.forEach((fieldSuggestion) => {
          const key = document.createElement("small");
          key.textContent = `${fieldSuggestion.key} ->`;
          const value = document.createElement("div");
          value.textContent = fieldSuggestion.suggestedText || item.pdfText || "-";
          suggestionCell.append(key, value);
        });
      }
      row.append(
        typeCell,
        pageCell,
        sectionCell,
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
    if (elements.downloadFieldEdits) elements.downloadFieldEdits.disabled = true;
    elements.summary.hidden = true;
    elements.recommendations.hidden = true;
    elements.modifiedHtmlPanel.hidden = true;
    elements.filters.hidden = true;
    elements.tableBody.replaceChildren();
    elements.empty.hidden = true;
    try {
      setStatus("正在上传文件，服务器将自动提取并核验文字...");
      const formData = new FormData();
      formData.append("pdfFile", pdfFile, pdfFile.name);
      formData.append("htmlFile", htmlFile, htmlFile.name);
      const languagePackageFile = elements.languagePackage?.files?.[0];
      if (languagePackageFile) {
        formData.append("languagePackageFile", languagePackageFile, languagePackageFile.name);
        formData.append("languageColumn", elements.languageColumn?.value || "");
      }
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
      if (elements.downloadFieldEdits) {
        elements.downloadFieldEdits.disabled = collectLanguageFieldEdits(lastResult).length === 0;
      }
      if (lastResult.modifiedHtml) {
        elements.modifiedHtmlOutput.value = lastResult.modifiedHtml;
        elements.modifiedHtmlMeta.textContent = `已按 PDF 建议替换 ${lastResult.modifiedHtmlReplacementCount || 0} 处字段，可直接全选复制。`;
        elements.modifiedHtmlPanel.hidden = false;
      }
      const differenceCount = lastResult.summary.missing;
      const languageReplacement = lastResult.languageReplacement;
      const languageMessage = languageReplacement
        ? `语言字段已先还原 ${languageReplacement.replacementCount || 0} 处`
          + (languageReplacement.missingFieldCount ? `，缺失 ${languageReplacement.missingFieldCount} 个字段` : "")
          + "；"
        : "";
      setStatus(
        `${languageMessage}${lastResult.summary.verdictText} 共发现 ${differenceCount} 条未包含片段，其中 ${lastResult.summary.critical} 条包含数值或单位风险。`,
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
    if (elements.languagePackage) elements.languagePackage.value = "";
    if (elements.languageColumn) elements.languageColumn.value = "";
    elements.summary.hidden = true;
    elements.recommendations.hidden = true;
    elements.modifiedHtmlPanel.hidden = true;
    elements.modifiedHtmlOutput.value = "";
    elements.filters.hidden = true;
    elements.tableBody.replaceChildren();
    elements.empty.hidden = true;
    elements.download.disabled = true;
    if (elements.downloadFieldEdits) elements.downloadFieldEdits.disabled = true;
    setStatus("请选择需要对比的 PDF 和 HTML 文件。");
  }

  function downloadResult() {
    if (!lastResult) return;
    const { modifiedHtml, ...report } = lastResult;
    const blob = new Blob(
      [JSON.stringify(report, null, 2)],
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

  function collectLanguageFieldEdits(result) {
    const byKey = new Map();
    (result?.items || []).forEach((item) => {
      (item.languageFieldSuggestions || []).forEach((suggestion) => {
        if (!suggestion.key || !suggestion.suggestedText) return;
        const existing = byKey.get(suggestion.key);
        const score = Number(suggestion.similarity || 0);
        if (existing && Number(existing.similarity || 0) >= score) return;
        byKey.set(suggestion.key, {
          key: suggestion.key,
          currentText: suggestion.currentText || "",
          suggestedText: suggestion.suggestedText || "",
          page: item.page || "",
          critical: item.critical ? "数值/单位风险" : "",
          similarity: score
        });
      });
    });
    return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  function safeSheetName(value) {
    return String(value || "字段英文修订")
      .replace(/[\\/?*[\]:]/g, " ")
      .slice(0, 31) || "字段英文修订";
  }

  function downloadFieldEdits() {
    const edits = collectLanguageFieldEdits(lastResult);
    if (!edits.length) {
      setStatus("当前对比结果没有可导出的语言字段修改建议。", "warn");
      return;
    }
    if (!window.XLSX) {
      setStatus("缺少 XLSX 表格库，无法生成字段英文修订表。", "warn");
      return;
    }

    const rows = [
      ["字段名", "当前语言包文案", "建议英文文案", "PDF 页码", "风险类型", "相似度"],
      ...edits.map((item) => [
        item.key,
        item.currentText,
        item.suggestedText,
        item.page,
        item.critical,
        Number(item.similarity || 0).toFixed(3)
      ])
    ];
    const workbook = window.XLSX.utils.book_new();
    const sheet = window.XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 42 },
      { wch: 72 },
      { wch: 72 },
      { wch: 12 },
      { wch: 18 },
      { wch: 10 }
    ];
    sheet["!autofilter"] = {
      ref: window.XLSX.utils.encode_range(
        { r: 0, c: 0 },
        { r: rows.length - 1, c: rows[0].length - 1 }
      )
    };
    window.XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName("字段英文修订"));
    const baseName = `${lastResult?.files?.pdf || "PDF"}-vs-${lastResult?.files?.html || "HTML"}`
      .replace(/[\\/:*?"<>|]/g, "-");
    window.XLSX.writeFile(workbook, `${baseName}-字段英文修订表.xlsx`);
  }

  elements.compare.addEventListener("click", runComparison);
  elements.clear.addEventListener("click", clearResult);
  elements.download.addEventListener("click", downloadResult);
  elements.downloadFieldEdits?.addEventListener("click", downloadFieldEdits);
  elements.typeFilter.addEventListener("change", renderTable);
  elements.search.addEventListener("input", renderTable);
})();
