(function initCssScopeModule() {
  const fileInput = document.getElementById("cssScopeFileInput");
  const scopeInput = document.getElementById("cssScopeSelectorInput");
  const runButton = document.getElementById("cssScopeRunBtn");
  const status = document.getElementById("cssScopeStatus");
  const cleanHtmlInput = document.getElementById("cssCleanHtmlInput");
  const cleanCssInput = document.getElementById("cssCleanFileInput");
  const cleanSafelistInput = document.getElementById("cssCleanSafelistInput");
  const cleanRunButton = document.getElementById("cssCleanRunBtn");

  if (!fileInput || !scopeInput || !runButton || !status) return;

  let selectedFile = null;
  let selectedCleanHtmlFile = null;
  let selectedCleanCssFile = null;

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

  function cleanOutputFileName(fileName) {
    const name = fileName || "webflow.css";
    return name.toLowerCase().endsWith(".css")
      ? `${name.slice(0, -4)}.clean.css`
      : `${name}.clean.css`;
  }

  function cleanHtmlOutputFileName(fileName) {
    const name = fileName || "index.html";
    return /\.(?:html?|xhtml)$/i.test(name)
      ? name.replace(/\.(?:html?|xhtml)$/i, ".clean.html")
      : `${name}.clean.html`;
  }

  function downloadFile(content, fileName, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Let the browser consume the Blob URL before releasing its backing data.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCss(css, fileName) {
    downloadFile(css, fileName, "text/css;charset=utf-8");
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

  function parseSafelist(value) {
    return String(value || "")
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/^\./, ""))
      .filter(Boolean);
  }

  function buildSafelistPatterns(items) {
    return items
      .filter((item) => item.endsWith("*") || item.endsWith("-"))
      .map((item) => {
        const prefix = item.endsWith("*") ? item.slice(0, -1) : item;
        return `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      });
  }

  function updateCleanButtonState() {
    if (!cleanRunButton) return;
    cleanRunButton.disabled = !selectedCleanHtmlFile;
  }

  async function runClean() {
    if (!selectedCleanHtmlFile) {
      setStatus("请先选择 HTML 文件。CSS 文件可选；不选时会清理 HTML 内的 <style>。", "warn");
      return;
    }

    cleanRunButton.disabled = true;
    try {
      if (!window.EzvizCssScope?.pruneUnusedCssClasses || !window.EzvizCssScope?.pruneInlineStyleTags) {
        throw new Error("CSS 清理模块加载失败。");
      }

      const htmlText = await selectedCleanHtmlFile.text();
      if (!htmlText.trim()) throw new Error("所选 HTML 文件为空。");

      const safelistItems = parseSafelist(cleanSafelistInput?.value || "");
      const exactSafelist = safelistItems.filter((item) => !item.endsWith("*") && !item.endsWith("-"));
      const options = {
        safelist: exactSafelist,
        safelistPatterns: buildSafelistPatterns(safelistItems)
      };

      if (selectedCleanCssFile) {
        const cssText = await selectedCleanCssFile.text();
        if (!cssText.trim()) throw new Error("所选 CSS 文件为空。");
        const result = window.EzvizCssScope.pruneUnusedCssClasses(cssText, htmlText, options);
        const fileName = cleanOutputFileName(selectedCleanCssFile.name);
        downloadCss(result.css, fileName);
        setStatus(
          [
            `清理完成，已返回 ${fileName}。`,
            `模式：单独 CSS 文件。`,
            `HTML 检测到 ${result.usedClassCount.toLocaleString()} 个 class。`,
            `删除 ${result.removedSelectorCount.toLocaleString()} 个未命中 selector，移除 ${result.removedRuleCount.toLocaleString()} 条空规则。`
          ].join("\n"),
          "ok"
        );
        return;
      }

      const result = window.EzvizCssScope.pruneInlineStyleTags(htmlText, options);
      if (!result.styleBlockCount) {
        throw new Error("HTML 中没有找到 <style>...</style>，如果 CSS 是外链文件，请同时选择 CSS 文件。");
      }
      const fileName = cleanHtmlOutputFileName(selectedCleanHtmlFile.name);
      downloadFile(result.html, fileName, "text/html;charset=utf-8");
      setStatus(
        [
          `清理完成，已返回 ${fileName}。`,
          `模式：HTML 内联 <style>，共处理 ${result.styleBlockCount.toLocaleString()} 个 style 块。`,
          `HTML 检测到 ${result.usedClassCount.toLocaleString()} 个 class。`,
          `删除 ${result.removedSelectorCount.toLocaleString()} 个未命中 selector，移除 ${result.removedRuleCount.toLocaleString()} 条空规则。`
        ].join("\n"),
        "ok"
      );
    } catch (error) {
      setStatus(error?.message || String(error), "warn");
    } finally {
      updateCleanButtonState();
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

  cleanHtmlInput?.addEventListener("change", () => {
    selectedCleanHtmlFile = cleanHtmlInput.files?.[0] || null;

    if (selectedCleanHtmlFile && !/\.(?:html?|xhtml)$/i.test(selectedCleanHtmlFile.name)) {
      selectedCleanHtmlFile = null;
      setStatus("清理功能仅支持 .html / .htm 文件。", "warn");
    } else if (selectedCleanHtmlFile) {
      setStatus(`已选择 HTML：${selectedCleanHtmlFile.name}。如果 CSS 在 HTML 的 <style> 里，可直接清理；如果是外链 CSS，请再选择 CSS 文件。`);
    }

    updateCleanButtonState();
  });

  cleanCssInput?.addEventListener("change", () => {
    selectedCleanCssFile = cleanCssInput.files?.[0] || null;

    if (selectedCleanCssFile && !selectedCleanCssFile.name.toLowerCase().endsWith(".css")) {
      selectedCleanCssFile = null;
      setStatus("清理功能仅支持 .css 文件。", "warn");
    } else if (selectedCleanCssFile) {
      setStatus(`已选择 CSS：${selectedCleanCssFile.name}`);
    } else if (selectedCleanHtmlFile) {
      setStatus("未选择 CSS 文件，将清理 HTML 内联 <style>。");
    }

    updateCleanButtonState();
  });

  cleanRunButton?.addEventListener("click", runClean);
})();
