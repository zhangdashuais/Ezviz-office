/**
 * TDK 配置通道（第一阶段）
 * 当前只负责读取模板、校验数据和生成预览，不向业务后台提交。
 */
(function () {
  const excelInput = document.getElementById("tdkExcelInput");
  const validateButton = document.getElementById("tdkValidateBtn");
  const statusElement = document.getElementById("tdkStatus");
  const outputElement = document.getElementById("tdkOutput");
  if (!excelInput || !validateButton || !statusElement || !outputElement) return;

  const REQUIRED_HEADERS = ["Record ID", "Site URL", "Language", "Page Type", "Page URL", "Title", "Description"];

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function validHttpUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function validateRows(rows) {
    const issues = [];
    const seenIds = new Set();
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const recordId = text(row["Record ID"]);
      REQUIRED_HEADERS.forEach((header) => {
        if (!text(row[header])) issues.push(`第 ${rowNumber} 行缺少 ${header}`);
      });
      if (recordId && seenIds.has(recordId)) issues.push(`第 ${rowNumber} 行 Record ID 重复：${recordId}`);
      if (recordId) seenIds.add(recordId);
      if (text(row["Site URL"]) && !validHttpUrl(text(row["Site URL"]))) issues.push(`第 ${rowNumber} 行 Site URL 不是有效网址`);
      if (text(row["Page URL"]) && !validHttpUrl(text(row["Page URL"]))) issues.push(`第 ${rowNumber} 行 Page URL 不是有效网址`);
      const action = text(row.Action).toLowerCase();
      if (action && !["create", "update", "skip"].includes(action)) issues.push(`第 ${rowNumber} 行 Action 应为 create、update 或 skip`);
    });
    return issues;
  }

  function renderPreview(sheetName, rows, issues) {
    const lines = [`工作表：${sheetName}`, `有效数据行：${rows.length}`, `校验问题：${issues.length}`, "", "数据预览（最多 20 行）："];
    rows.slice(0, 20).forEach((row, index) => {
      lines.push(`${index + 1}. [${text(row["Record ID"]) || "无 ID"}] ${text(row["Page Type"]) || "未分类"} / ${text(row.Product) || "非产品页"}`);
      lines.push(`   ${text(row["Page URL"])}`);
      lines.push(`   Title: ${text(row.Title)}`);
      lines.push(`   Description: ${text(row.Description)}`);
      lines.push(`   Keywords: ${text(row.Keywords) || "（空）"}`);
    });
    if (rows.length > 20) lines.push(`...其余 ${rows.length - 20} 行未在预览中展开`);
    if (issues.length) {
      lines.push("", "问题清单：");
      issues.forEach((issue) => lines.push(`- ${issue}`));
    }
    outputElement.value = lines.join("\n");
  }

  validateButton.addEventListener("click", async () => {
    const file = excelInput.files && excelInput.files[0];
    if (!file) {
      setStatus("请选择 TDK Excel 文件。", "warn");
      return;
    }
    if (typeof XLSX === "undefined") {
      setStatus("Excel 读取组件尚未加载，请刷新页面后重试。", "warn");
      return;
    }

    validateButton.disabled = true;
    setStatus("正在读取并校验 TDK 数据...");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames.find((name) => name === "TDK配置") || workbook.SheetNames[0];
      if (!sheetName) throw new Error("Excel 中没有工作表。");
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
      const headers = rows.length ? Object.keys(rows[0]) : [];
      const issues = REQUIRED_HEADERS.filter((header) => !headers.includes(header)).map((header) => `缺少必填表头：${header}`);
      issues.push(...validateRows(rows));
      renderPreview(sheetName, rows, issues);
      setStatus(issues.length ? `校验完成：发现 ${issues.length} 个问题，正式配置前请修正。` : `校验通过：共 ${rows.length} 行，可等待接入后台配置规则。`, issues.length ? "warn" : "ok");
    } catch (error) {
      setStatus(`读取失败：${error && error.message ? error.message : String(error)}`, "warn");
    } finally {
      validateButton.disabled = false;
    }
  });
})();
