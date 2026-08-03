(function initCssScopeModule() {
  const fileInput = document.getElementById("cssScopeFileInput");
  const scopeInput = document.getElementById("cssScopeSelectorInput");
  const runButton = document.getElementById("cssScopeRunBtn");
  const status = document.getElementById("cssScopeStatus");

  if (!fileInput || !scopeInput || !runButton || !status) return;

  let selectedFile = null;

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ""}`;
  }

  function validateScope(scope) {
    if (!scope) throw new Error("请输入页面作用域选择器。");
    document.createDocumentFragment().querySelector(scope);
  }

  function outputFileName(fileName) {
    const name = fileName || "webflow.css";
    return name.toLowerCase().endsWith(".css")
      ? `${name.slice(0, -4)}.scoped.css`
      : `${name}.scoped.css`;
  }

  function downloadCss(css, fileName) {
    const url = URL.createObjectURL(new Blob([css], { type: "text/css;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function run() {
    if (!selectedFile) {
      setStatus("请先选择一个 CSS 文件。", "warn");
      return;
    }

    runButton.disabled = true;
    try {
      const scope = scopeInput.value.trim();
      validateScope(scope);
      if (!window.EzvizCssScope?.scopeCss) throw new Error("CSS 作用域处理模块加载失败。");

      const source = await selectedFile.text();
      if (!source.trim()) throw new Error("所选 CSS 文件为空。");

      const result = window.EzvizCssScope.scopeCss(source, scope);
      const fileName = outputFileName(selectedFile.name);
      downloadCss(result, fileName);

      const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const scopedRuleCount = (result.match(new RegExp(escapedScope, "g")) || []).length;
      setStatus(
        `处理完成，已返回 ${fileName}；共生成约 ${scopedRuleCount.toLocaleString()} 个作用域选择器。`,
        "ok"
      );
    } catch (error) {
      setStatus(error?.message || String(error), "warn");
    } finally {
      runButton.disabled = !selectedFile;
    }
  }

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files?.[0] || null;
    runButton.disabled = !selectedFile;

    if (!selectedFile) {
      setStatus("请选择一个 Webflow CSS 文件。");
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".css")) {
      selectedFile = null;
      runButton.disabled = true;
      setStatus("仅支持 .css 文件。", "warn");
      return;
    }

    setStatus(`已选择 ${selectedFile.name}，点击“生成并下载 CSS”。`);
  });

  runButton.addEventListener("click", run);
})();
