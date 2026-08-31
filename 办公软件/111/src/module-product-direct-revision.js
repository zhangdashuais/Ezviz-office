(function () {
  const byId = (id) => document.getElementById(id);
  const site = byId("directRevisionSite");
  const product = byId("directRevisionProduct");
  const detail = byId("directRevisionDetail");
  const specType = byId("directRevisionSpecType");
  const specTarget = byId("directRevisionSpecTarget");
  const specReplacement = byId("directRevisionSpecReplacement");
  const specReplacementLabel = byId("directRevisionSpecReplacementLabel");
  if (!site || !product || !detail || !specType || !specTarget || !specReplacement) return;
  const state = { detail: "", specification: "" };

  function requestBody(type) {
    return {
      revisionType: type,
      siteCode: site.value,
      productName: product.value.trim(),
      detailHtml: type === "detail" ? detail.value : "",
      fingerprint: state[type],
      specificationOperations: type === "specification" ? [{
        type: specType.value,
        targetText: specTarget.value,
        replacementText: specReplacement.value
      }] : []
    };
  }
  function invalidate(type) {
    state[type] = "";
    byId(type === "detail" ? "directRevisionDetailSubmit" : "directRevisionSpecSubmit").disabled = true;
  }
  async function run(type, action) {
    const prefix = type === "detail" ? "directRevisionDetail" : "directRevisionSpec";
    const status = byId(prefix + "Status");
    const output = byId(prefix + "Output");
    try {
      status.textContent = action === "preview" ? "正在预览，不会保存..." : "正在保存并回读验证...";
      const response = await fetch(`/api/product-revision/${action}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody(type))
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "请求失败");
      output.value = JSON.stringify(data, null, 2);
      if (action === "preview") {
        state[type] = data.result.fingerprint;
        byId(prefix + "Submit").disabled = false;
        status.textContent = "预览完成，请核对后提交。";
      } else {
        invalidate(type);
        status.textContent = "保存完成，后台回读验证通过。";
      }
    } catch (error) { invalidate(type); status.textContent = `${action === "preview" ? "预览" : "提交"}失败：${error.message}`; }
  }
  specType.addEventListener("change", () => {
    const replace = specType.value === "replace";
    specReplacement.hidden = !replace;
    specReplacementLabel.hidden = !replace;
    invalidate("specification");
  });
  [site, product].forEach((input) => input.addEventListener("input", () => { invalidate("detail"); invalidate("specification"); }));
  detail.addEventListener("input", () => invalidate("detail"));
  [specTarget, specReplacement].forEach((input) => input.addEventListener("input", () => invalidate("specification")));
  byId("directRevisionDetailPreview").addEventListener("click", () => run("detail", "preview"));
  byId("directRevisionDetailSubmit").addEventListener("click", () => run("detail", "submit"));
  byId("directRevisionSpecPreview").addEventListener("click", () => run("specification", "preview"));
  byId("directRevisionSpecSubmit").addEventListener("click", () => run("specification", "submit"));
  fetch("/api/campaign/sites").then((response) => response.json()).then((data) => {
    site.innerHTML = (data.sites || []).filter((item) => item.enabled !== false)
      .map((item) => `<option value="${item.siteCode}">${item.name} (${item.siteCode})</option>`).join("");
  });

  const common = {
    site: byId("commonRevisionSite"),
    selectAllSites: byId("commonRevisionSelectAllSites"),
    clearSites: byId("commonRevisionClearSites"),
    products: byId("commonRevisionProducts"),
    field: byId("commonRevisionField"),
    operation: byId("commonRevisionOperation"),
    operationLabel: document.querySelector('label[for="commonRevisionOperation"]'),
    target: byId("commonRevisionTarget"),
    targetLabel: document.querySelector('label[for="commonRevisionTarget"]'),
    replacement: byId("commonRevisionReplacement"),
    replacementLabel: byId("commonRevisionReplacementLabel"),
    preview: byId("commonRevisionPreview"),
    submit: byId("commonRevisionSubmit"),
    status: byId("commonRevisionStatus"),
    output: byId("commonRevisionOutput")
  };
  if (!Object.values(common).every(Boolean)) return;
  let commonPreview = null;
  let commonSignature = "";

  function isCommonSpecificationNameOnly() {
    return common.field.value === "specification-name";
  }

  function commonBody() {
    const nameOnly = isCommonSpecificationNameOnly();
    const operation = nameOnly ? null : {
      type: common.operation.value,
      targetText: common.target.value,
      replacementText: common.operation.value === "replace" ? common.replacement.value : ""
    };
    return {
      sites: [...common.site.querySelectorAll("input[type='checkbox']:checked")]
        .map((input) => input.value)
        .filter(Boolean),
      productNames: common.products.value,
      revisionType: nameOnly ? "specification" : common.field.value,
      autoSpecificationFieldName: nameOnly,
      detailOperations: common.field.value === "detail" ? [operation] : [],
      specificationOperations: common.field.value === "specification" ? [operation] : []
    };
  }

  function invalidateCommon() {
    commonPreview = null;
    commonSignature = "";
    common.submit.disabled = true;
  }

  function renderCommon(result, submitting) {
    const lines = [
      submitting ? "多个产品相同部分修订结果" : "多个产品相同部分修订预览（尚未保存）",
      `国家：${result.siteCount}，产品：${result.productCount}，任务：${result.operationCount}，${submitting ? `完成：${result.completedCount}` : `可执行：${result.readyCount}，无需修改：${result.noChangeCount}`}，失败：${result.failedCount}`,
      ""
    ];
    const bySite = new Map();
    result.results.forEach((item) => {
      const siteName = item.site?.name || item.site?.siteCode || "未知站点";
      const summary = bySite.get(siteName) || { ready: 0, noChange: 0, completed: 0, failed: 0 };
      summary[item.status] = (summary[item.status] || 0) + 1;
      bySite.set(siteName, summary);
    });
    bySite.forEach((summary, siteName) => {
      const done = submitting ? `完成 ${summary.completed || 0}` : `可执行 ${summary.ready || 0}，无需修改 ${summary["no-change"] || 0}`;
      lines.push(`- ${siteName}：${done}，失败 ${summary.failed || 0}`);
    });
    const failures = result.results.filter((item) => item.status === "failed");
    if (failures.length) {
      lines.push("", "失败项：");
      failures.forEach((item) => {
        const siteName = item.site?.name || item.site?.siteCode || "未知站点";
        lines.push(`- ${siteName} | ${item.productName} | ${item.error || "未知错误"}`);
      });
    }
    common.output.value = lines.join("\n");
  }

  function updateCommonUi() {
    const nameOnly = isCommonSpecificationNameOnly();
    [common.operation, common.operationLabel, common.target, common.targetLabel].forEach((element) => {
      element.hidden = nameOnly;
    });
    const wifi6Cleanup = !nameOnly && common.operation.value === "sanitize-wifi6";
    const showReplacement = !nameOnly && common.operation.value === "replace";
    common.replacement.hidden = !showReplacement;
    common.replacementLabel.hidden = !showReplacement;
    common.target.hidden = nameOnly || wifi6Cleanup;
    common.targetLabel.hidden = nameOnly || wifi6Cleanup;
    if (wifi6Cleanup) {
      common.target.value = "";
      common.replacement.value = "";
      common.status.textContent = "将把指定 Wi-Fi 6 / HaLow 文字改为 Wi-Fi，并清除所有空格写法的 802.11ax。";
    }
    if (nameOnly) {
      common.target.value = "";
      common.replacement.value = "";
      common.status.textContent = "请选择站点并填写产品名称；此模式只修改 Specification 的 Custom Page Name 输入框。";
    }
  }

  async function runCommon(action) {
    const body = commonBody();
    const signature = JSON.stringify(body);
    if (action === "submit" && (!commonPreview || signature !== commonSignature)) {
      invalidateCommon();
      common.status.textContent = "输入已经变化，请重新预览。";
      return;
    }
    if (action === "submit") {
      const readyResults = commonPreview.results.filter((item) => item.status === "ready");
      body.fingerprints = Object.fromEntries(readyResults
        .map((item) => [`${item.site.siteCode}\n${item.productName.toLowerCase()}`, {
          siteCode: item.site.siteCode,
          productName: item.productName,
          fingerprint: item.result.fingerprint
        }]));
      if (!window.confirm(`将执行 ${commonPreview.readyCount} 项国家 × 产品修订，确认继续？`)) return;
    }
    common.preview.disabled = true;
    common.submit.disabled = true;
    common.status.textContent = action === "preview" ? "正在逐产品预览，不会保存..." : "正在逐产品保存并回读验证...";
    try {
      const response = await fetch(`/api/product-revision/common-${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "请求失败");
      renderCommon(data.result, action === "submit");
      if (action === "preview") {
        commonPreview = data.result;
        commonSignature = signature;
        common.submit.disabled = !data.result.readyCount;
        common.status.textContent = `预览完成：可执行 ${data.result.readyCount}，失败 ${data.result.failedCount}。`;
      } else {
        invalidateCommon();
        common.status.textContent = `执行完成：成功 ${data.result.completedCount}，失败 ${data.result.failedCount}。`;
      }
    } catch (error) {
      invalidateCommon();
      common.status.textContent = `${action === "preview" ? "预览" : "执行"}失败：${error.message || error}`;
    } finally {
      common.preview.disabled = false;
    }
  }

  [common.site, common.products, common.field, common.operation, common.target, common.replacement]
    .forEach((element) => element.addEventListener("input", invalidateCommon));
  common.field.addEventListener("change", () => {
    updateCommonUi();
    invalidateCommon();
  });
  common.operation.addEventListener("change", () => {
    updateCommonUi();
    if (common.operation.value !== "replace") common.replacement.value = "";
    invalidateCommon();
  });
  common.preview.addEventListener("click", () => runCommon("preview"));
  common.submit.addEventListener("click", () => runCommon("submit"));
  common.selectAllSites.addEventListener("click", () => {
    common.site.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = true;
    });
    invalidateCommon();
  });
  common.clearSites.addEventListener("click", () => {
    common.site.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = false;
    });
    invalidateCommon();
  });
  fetch("/api/campaign/sites").then((response) => response.json()).then((data) => {
    common.site.innerHTML = "";
    (data.sites || []).filter((item) => item.enabled !== false).forEach((item) => {
      const label = document.createElement("label");
      label.className = "site-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.siteCode;
      input.checked = !!item.enabled;

      const name = document.createElement("span");
      name.className = "site-name";
      name.textContent = `${item.name} (${item.siteCode})`;

      const url = document.createElement("span");
      url.className = "site-url";
      url.textContent = item.url || "";

      label.append(input, name, url);
      common.site.appendChild(label);
    });
  });
  updateCommonUi();
})();
