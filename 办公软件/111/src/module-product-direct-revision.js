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
})();
