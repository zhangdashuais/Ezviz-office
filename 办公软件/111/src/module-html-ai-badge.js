(function () {
  const fileInput = document.getElementById("htmlAiBadgeFile");
  const textInput = document.getElementById("htmlAiBadgeText");
  const source = document.getElementById("htmlAiBadgeSource");
  const output = document.getElementById("htmlAiBadgeOutput");
  const runButton = document.getElementById("htmlAiBadgeRun");
  const downloadButton = document.getElementById("htmlAiBadgeDownload");
  const status = document.getElementById("htmlAiBadgeStatus");
  if (!fileInput || !textInput || !source || !output || !runButton || !downloadButton || !status) return;

  let sourceName = "detail.html";

  function setStatus(message, type) {
    status.textContent = message;
    status.className = type ? `status ${type}` : "status";
  }

  function invalidate() {
    output.value = "";
    downloadButton.disabled = true;
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    invalidate();
    if (!/\.(?:html?|txt)$/i.test(file.name)) {
      setStatus("请选择 .html、.htm 或 .txt 文件。", "warn");
      return;
    }
    try {
      source.value = (await file.text()).replace(/^\uFEFF/, "");
      sourceName = file.name;
      setStatus(`已读取 ${file.name}，可以开始打标。`);
    } catch (error) {
      setStatus(error.message || "文件读取失败。", "warn");
    }
  });

  source.addEventListener("input", invalidate);
  textInput.addEventListener("input", invalidate);

  runButton.addEventListener("click", async () => {
    if (!source.value.trim()) {
      setStatus("请先选择文件或粘贴 HTML 代码。", "warn");
      return;
    }
    invalidate();
    runButton.disabled = true;
    setStatus("正在给 Section 添加标识，末尾 Section 将跳过...");
    try {
      const response = await fetch(`/api/html-ai-badge?text=${encodeURIComponent(textInput.value.trim())}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: source.value
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "HTML 打标失败。");
      output.value = result.html;
      downloadButton.disabled = false;
      setStatus(`已为 ${result.sectionCount} 个 Section 添加标识；最后一个 Section 已跳过。`, "ok");
    } catch (error) {
      setStatus(error.message || "HTML 打标失败。", "warn");
    } finally {
      runButton.disabled = false;
    }
  });

  downloadButton.addEventListener("click", () => {
    if (!output.value) return;
    const blob = new Blob([output.value], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sourceName.replace(/\.(?:html?|txt)$/i, "") + "-ai-badged.html";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
