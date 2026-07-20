/** 国际站 TDK 配置：服务端解析 Excel，并复用后台登录态直接提交接口。 */
(function () {
  const serviceBase = "http://localhost:3217";
  const excelInput = document.getElementById("tdkExcelInput");
  const validateButton = document.getElementById("tdkValidateBtn");
  const submitButton = document.getElementById("tdkSubmitBtn");
  const statusElement = document.getElementById("tdkStatus");
  const outputElement = document.getElementById("tdkOutput");
  if (!excelInput || !validateButton || !submitButton || !statusElement || !outputElement) return;

  let validatedPlan = null;

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function buildFormData() {
    const file = excelInput.files && excelInput.files[0];
    if (!file) throw new Error("请选择 TDK Excel 文件。");
    const form = new FormData();
    form.append("tdkExcel", file);
    form.append("sites", JSON.stringify(["hq"]));
    return form;
  }

  async function postForm(path) {
    const response = await fetch(serviceBase + path, { method: "POST", body: buildFormData() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data;
  }

  function renderPlan(plan) {
    const lines = [
      `文件：${plan.fileName}`,
      `工作表：${plan.sheetName}`,
      `有效数据行：${plan.rowCount}`,
      `校验问题：${plan.issues.length}`,
      "",
      "数据预览（最多 30 行）："
    ];
    plan.rows.slice(0, 30).forEach((row) => {
      lines.push(`${row.rowNumber}. ${row.urlPath}`);
      lines.push(`   Title: ${row.title}`);
      lines.push(`   Keyword: ${row.keyword}`);
      lines.push(`   Discription: ${row.description}`);
    });
    if (plan.rows.length > 30) lines.push(`...其余 ${plan.rows.length - 30} 行未展开`);
    if (plan.issues.length) {
      lines.push("", "问题清单：");
      plan.issues.forEach((issue) => lines.push(`- ${issue}`));
    }
    outputElement.value = lines.join("\n");
  }

  function renderResult(data) {
    const result = data.result;
    const lines = [
      `国际站 TDK 提交完成：成功 ${result.completed} 条，失败 ${result.failed} 条，共 ${result.total} 条。`,
      "",
      "逐行结果："
    ];
    result.results.forEach((item) => {
      const detail = item.status === "completed"
        ? `成功${item.seoTdkNo ? "，编号 " + item.seoTdkNo : ""}`
        : `失败：${item.error}`;
      lines.push(`- 第 ${item.rowNumber} 行 ${item.urlPath}：${detail}`);
    });
    if (data.logs && data.logs.length) lines.push("", "执行日志：", ...data.logs.map((line) => `- ${line}`));
    outputElement.value = lines.join("\n");
  }

  excelInput.addEventListener("change", () => {
    validatedPlan = null;
    submitButton.disabled = true;
    setStatus(excelInput.files?.[0] ? "文件已选择，请先校验。" : "请选择 TDK Excel 文件。");
  });

  validateButton.addEventListener("click", async () => {
    validateButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在由本地服务解析并校验 TDK 数据...");
    try {
      const data = await postForm("/api/tdk/plan");
      renderPlan(data.plan);
      validatedPlan = data.plan.issues.length ? null : data.plan;
      submitButton.disabled = !validatedPlan;
      setStatus(
        data.plan.issues.length
          ? `校验未通过：发现 ${data.plan.issues.length} 个问题。`
          : `校验通过：${data.plan.rowCount} 条数据可提交到国际站后台。`,
        data.plan.issues.length ? "warn" : "ok"
      );
    } catch (error) {
      validatedPlan = null;
      setStatus("校验失败：" + error.message, "warn");
    } finally {
      validateButton.disabled = false;
    }
  });

  submitButton.addEventListener("click", async () => {
    if (!validatedPlan) {
      setStatus("请先完成校验。", "warn");
      return;
    }
    const confirmed = window.confirm(`将向国际站生产后台新增 ${validatedPlan.rowCount} 条 TDK 配置，确认继续？`);
    if (!confirmed) return;

    validateButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在复用国际站登录态并直接提交 TDK 接口，请勿关闭页面...");
    try {
      const data = await postForm("/api/tdk/submit");
      renderResult(data);
      const failed = data.result.failed;
      setStatus(
        failed ? `提交完成：成功 ${data.result.completed} 条，失败 ${failed} 条。` : `提交成功：共 ${data.result.completed} 条。`,
        failed ? "warn" : "ok"
      );
      validatedPlan = null;
    } catch (error) {
      setStatus("提交失败：" + error.message, "warn");
    } finally {
      validateButton.disabled = false;
      submitButton.disabled = !validatedPlan;
    }
  });
})();
