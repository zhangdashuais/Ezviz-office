(function () {
  const fileInput = document.getElementById("blogAiBadgeFile");
  const textInput = document.getElementById("blogAiBadgeText");
  const source = document.getElementById("blogAiBadgeSource");
  const output = document.getElementById("blogAiBadgeOutput");
  const runButton = document.getElementById("blogAiBadgeRun");
  const downloadButton = document.getElementById("blogAiBadgeDownload");
  const status = document.getElementById("blogAiBadgeStatus");
  if (!fileInput || !textInput || !source || !output || !runButton || !downloadButton || !status) return;

  let sourceName = "blog.html";
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
      setStatus("请先选择文件或粘贴 Blog HTML。", "warn");
      return;
    }
    invalidate();
    runButton.disabled = true;
    setStatus("正在为 Blog 图片添加标识...");
    try {
      const response = await fetch(`/api/blog-ai-badge?text=${encodeURIComponent(textInput.value.trim())}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: source.value
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Blog 图片打标失败。");
      output.value = result.html;
      downloadButton.disabled = false;
      setStatus(`已为 ${result.imageCount} 张图片添加标识。`, "ok");
    } catch (error) {
      setStatus(error.message || "Blog 图片打标失败。", "warn");
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
