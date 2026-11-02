(function () {
  const fileInput = document.getElementById("ecVideoFile");
  const uploadButton = document.getElementById("ecVideoUploadBtn");
  const copyButton = document.getElementById("ecVideoCopyBtn");
  const status = document.getElementById("ecVideoStatus");
  const output = document.getElementById("ecVideoUrl");
  if (!fileInput || !uploadButton || !copyButton || !status || !output) return;

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status" + (type ? " " + type : "");
  }

  uploadButton.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file || !/\.mp4$/i.test(file.name)) return setStatus("请选择 MP4 文件。", "warn");
    if (!file.size || file.size > 500 * 1024 * 1024) return setStatus("视频必须大于 0 且不超过 500 MB。", "warn");
    const form = new FormData();
    form.append("file", file, file.name);
    uploadButton.disabled = true;
    copyButton.disabled = true;
    output.value = "";
    setStatus("正在上传视频，请勿重复点击。");
    try {
      const response = await fetch("/api/ecadmin/upload-video", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.result?.url) throw new Error(payload.error || "上传失败。");
      output.value = payload.result.url;
      copyButton.disabled = false;
      setStatus("视频上传成功。", "ok");
    } catch (error) {
      setStatus(error?.message || "上传失败。", "warn");
    } finally {
      uploadButton.disabled = false;
    }
  });

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(output.value);
    setStatus("视频地址已复制。", "ok");
  });
})();
