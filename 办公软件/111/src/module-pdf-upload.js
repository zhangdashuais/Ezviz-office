(function () {
  const fileInput = document.getElementById("pdfFileInput");
  const folderInput = document.getElementById("pdfFolderInput");
  const uploadBtn = document.getElementById("pdfUploadBtn");
  const copyBtn = document.getElementById("pdfCopyBtn");
  const statusEl = document.getElementById("pdfUploadStatus");
  const outputEl = document.getElementById("pdfUploadOutput");

  if (!fileInput || !folderInput || !uploadBtn || !copyBtn || !statusEl || !outputEl) {
    return;
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  uploadBtn.addEventListener("click", async () => {
    const candidates = [...(fileInput.files || []), ...(folderInput.files || [])];
    const files = [...new Map(candidates
      .filter((file) => /\.pdf$/i.test(file.name) || file.type === "application/pdf")
      .map((file) => [`${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`, file]))
      .values()];
    if (!files.length) {
      setStatus("请先选择一个或多个 PDF，或选择包含 PDF 的文件夹。", "warn");
      return;
    }

    uploadBtn.disabled = true;
    copyBtn.disabled = true;
    outputEl.value = "";
    setStatus(`正在上传 ${files.length} 个 PDF...`);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file, file.name));
      const response = await fetch("/api/doc-upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "DOC 上传失败。");

      const succeeded = (payload.results || []).filter((item) => item.ok);
      const failed = (payload.results || []).filter((item) => !item.ok);
      outputEl.value = payload.html || "";
      copyBtn.disabled = succeeded.length === 0;
      setStatus(
        failed.length
          ? `已生成 ${succeeded.length} 个 LI 标签，${failed.length} 个文件失败：${failed.map((item) => item.fileName).join("、")}`
          : `上传完成，共生成 ${succeeded.length} 个 LI 标签。`,
        failed.length ? "warn" : "ok"
      );
    } catch (error) {
      setStatus(error?.message || "DOC 上传失败。", "warn");
    } finally {
      uploadBtn.disabled = false;
    }
  });

  copyBtn.addEventListener("click", async () => {
    const text = outputEl.value.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setStatus("LI 标签已复制。", "ok");
    } catch (_) {
      outputEl.select();
      document.execCommand("copy");
      setStatus("LI 标签已复制。", "ok");
    }
  });
})();
