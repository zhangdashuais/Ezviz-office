(function () {
  const filesInput = document.getElementById("assetUploadFiles");
  const folderInput = document.getElementById("assetUploadFolder");
  const uploadBtn = document.getElementById("assetUploadRunBtn");
  const copyBtn = document.getElementById("assetUploadCopyBtn");
  const clearBtn = document.getElementById("assetUploadClearBtn");
  const statusEl = document.getElementById("assetUploadStatus");
  const outputEl = document.getElementById("assetUploadOutput");

  if (!filesInput || !folderInput || !uploadBtn || !copyBtn || !clearBtn || !statusEl || !outputEl) return;

  const ACCEPTED_FILE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  function collectFiles() {
    const selected = [...(filesInput.files || []), ...(folderInput.files || [])];
    const unique = new Map();
    selected.forEach((file) => {
      if (!ACCEPTED_FILE.test(file.name)) return;
      unique.set(`${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`, file);
    });
    return [...unique.values()];
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const response = await fetch("/api/assets/upload-image", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.url) {
      throw new Error(payload.error || "上传失败");
    }
    return payload.url;
  }

  function renderResults(results) {
    outputEl.value = results.map((result) => result.ok
      ? `${result.file.name}\n${result.url}`
      : `${result.file.name}\n失败：${result.error}`
    ).join("\n\n");
    const successful = results.filter((result) => result.ok);
    copyBtn.disabled = successful.length === 0;
    clearBtn.disabled = results.length === 0;
    return successful;
  }

  uploadBtn.addEventListener("click", async () => {
    const files = collectFiles();
    if (!files.length) {
      setStatus("请选择 PNG、JPG、WEBP、GIF 或 SVG 文件。", "warn");
      return;
    }

    uploadBtn.disabled = true;
    copyBtn.disabled = true;
    clearBtn.disabled = true;
    outputEl.value = "";
    const results = [];

    for (const [index, file] of files.entries()) {
      setStatus(`正在上传 ${index + 1}/${files.length}：${file.name}`);
      try {
        results.push({ file, ok: true, url: await uploadFile(file) });
      } catch (error) {
        results.push({ file, ok: false, error: error?.message || String(error) });
      }
    }

    const successful = renderResults(results);
    const failed = results.length - successful.length;
    setStatus(
      failed ? `已生成 ${successful.length} 个地址，${failed} 个文件上传失败。` : `上传完成，共生成 ${successful.length} 个地址。`,
      failed ? "warn" : "ok"
    );
    uploadBtn.disabled = false;
  });

  copyBtn.addEventListener("click", async () => {
    const urls = outputEl.value.split("\n").filter((line) => /^https:\/\//.test(line)).join("\n");
    if (!urls) return;
    try {
      await navigator.clipboard.writeText(urls);
    } catch (_) {
      outputEl.select();
      document.execCommand("copy");
    }
    setStatus("地址已复制。", "ok");
  });

  clearBtn.addEventListener("click", () => {
    filesInput.value = "";
    folderInput.value = "";
    outputEl.value = "";
    copyBtn.disabled = true;
    clearBtn.disabled = true;
    setStatus("请选择 PNG、JPG、WEBP、GIF 或 SVG 文件。");
  });
})();
