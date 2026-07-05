(function () {
  const apiInput = document.getElementById("pdfUploadApiInput");
  const fileInput = document.getElementById("pdfFileInput");
  const uploadBtn = document.getElementById("pdfUploadBtn");
  const copyBtn = document.getElementById("pdfCopyBtn");
  const statusEl = document.getElementById("pdfUploadStatus");
  const outputEl = document.getElementById("pdfUploadOutput");

  if (!apiInput || !fileInput || !uploadBtn || !copyBtn || !statusEl || !outputEl) {
    return;
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  function buildFormData(file) {
    const formData = new FormData();
    formData.append("app", "service");
    formData.append("flag", "attach");
    formData.append("quality", "100");
    formData.append("ext", "pdf,zip,rar,exe,bin,dav,apk");
    formData.append("size", "102400");
    formData.append("path_rule", "custom");
    formData.append("path", "");
    formData.append("purge", "1");
    formData.append("file", file, file.name);
    return formData;
  }

  function normalizeResponseUrl(payload) {
    if (payload && payload.uri) {
      const uri = String(payload.uri).replace(/^\/+/, "");
      return "https://mfs.ezvizlife.com/" + uri.replace(/^mfs\.ezvizlife\.com\/?/i, "");
    }

    if (payload && payload.full_url) {
      return String(payload.full_url)
        .replace(/^https?:\/\/s3\.amazonaws\.com\/mfs\.ezvizlife\.com\/?/i, "https://mfs.ezvizlife.com/")
        .replace(/^https?:\/\/mfs\.ezvizlife\.com\/?/i, "https://mfs.ezvizlife.com/");
    }

    return "";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getPdfTitle(fileName, url) {
    const source = fileName || url.split("/").pop() || "";
    const withoutQuery = source.split(/[?#]/)[0];
    const withoutExt = withoutQuery.replace(/\.pdf$/i, "");

    try {
      return decodeURIComponent(withoutExt.replace(/\+/g, " "));
    } catch (_) {
      return withoutExt.replace(/\+/g, " ");
    }
  }

  function buildPdfLinkHtml(result) {
    const title = getPdfTitle(result.fileName, result.url);
    return [
      "            <li>",
      '                <a target="_blank" href="' + escapeHtml(result.url) + '">' + escapeHtml(title) + "</a>",
      "            </li>"
    ].join("\n");
  }

  async function uploadPdf(file, uploadApi) {
    const response = await fetch(uploadApi, {
      method: "POST",
      body: buildFormData(file)
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      throw new Error("上传接口返回的不是 JSON: " + text.slice(0, 200));
    }

    if (!response.ok || payload.status === false) {
      throw new Error(payload.message || payload.msg || "HTTP " + response.status);
    }

    const url = normalizeResponseUrl(payload);
    if (!url) {
      throw new Error("上传成功，但没有返回 full_url 或 uri。");
    }

    return {
      fileName: file.name,
      url,
      payload
    };
  }

  uploadBtn.addEventListener("click", async () => {
    const files = Array.from(fileInput.files || []);
    const uploadApi = apiInput.value.trim() || "https://fs.ezvizlife.com/upload.php";

    if (!files.length) {
      setStatus("请先选择 PDF 文件。", "warn");
      return;
    }

    uploadBtn.disabled = true;
    copyBtn.disabled = true;
    outputEl.value = "";
    setStatus("正在上传 PDF...");

    const links = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await uploadPdf(file, uploadApi);
        links.push(buildPdfLinkHtml(result));
        setStatus("已上传: " + result.fileName);
      } catch (error) {
        errors.push(file.name + ": " + (error && error.message ? error.message : String(error)));
      }
    }

    outputEl.value = links.join("\n");
    copyBtn.disabled = links.length === 0;
    const lines = links;

    if (errors.length) {
      setStatus("处理完成，但有文件失败:\n" + errors.join("\n"), "warn");
    } else {
      setStatus("上传完成，共生成 " + lines.length + " 个地址。", "ok");
    }

    uploadBtn.disabled = false;
  });

  copyBtn.addEventListener("click", async () => {
    const text = outputEl.value.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setStatus("地址已复制。", "ok");
    } catch (_) {
      outputEl.select();
      document.execCommand("copy");
      setStatus("地址已复制。", "ok");
    }
  });
})();
