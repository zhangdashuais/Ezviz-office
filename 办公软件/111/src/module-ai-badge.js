(function() {
  const input = document.getElementById("aiBadgeImageInput");
  const textInput = document.getElementById("aiBadgeTextInput");
  const runBtn = document.getElementById("aiBadgeRunBtn");
  const clearBtn = document.getElementById("aiBadgeClearBtn");
  const status = document.getElementById("aiBadgeStatus");
  const canvas = document.getElementById("aiBadgeCanvas");
  const dropZone = document.getElementById("aiBadgeDropZone");
  const list = document.getElementById("aiBadgeList");
  if (!input || !textInput || !runBtn || !clearBtn || !status || !canvas || !dropZone || !list) return;

  const ctx = canvas.getContext("2d");
  const files = [];
  const MAX_OUTPUT_BYTES = 512 * 1024;

  function setStatus(message, type) {
    status.textContent = message;
    status.className = type ? `status ${type}` : "status";
  }

  function fileStem(name) {
    return String(name || "image").replace(/\.[^.]+$/, "") || "image";
  }

  function formatSize(size) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function drawBadge(text) {
    const fontSize = Math.max(8, Math.min(20, Math.round(canvas.width * 0.022)));
    const padX = Math.round(fontSize * 0.75);
    const padY = Math.round(fontSize * 0.45);
    const margin = Math.max(8, Math.min(28, Math.round(canvas.width * 0.025)));
    ctx.font = `700 ${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = "middle";

    const badgeText = String(text || "AI GENERATED").trim().toUpperCase();
    const width = Math.ceil(ctx.measureText(badgeText).width + padX * 2);
    const height = fontSize + padY * 2;
    const x = canvas.width - width - margin;
    const y = canvas.height - height - margin;

    roundRect(x, y, width, height, Math.round(height / 4));
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = Math.max(1, Math.round(canvas.width / 900));
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(badgeText, x + padX, y + height / 2);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败，请换一张图片重试。"));
      };
      image.src = url;
    });
  }

  function renderList() {
    if (!files.length) {
      list.textContent = "暂无图片。";
      runBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }
    runBtn.disabled = false;
    clearBtn.disabled = false;
    list.innerHTML = [
      "<table>",
      "<thead><tr><th>文件名</th><th>输出大小</th><th>状态</th><th>下载</th></tr></thead>",
      "<tbody>",
      ...files.map((item, index) => [
        `<tr data-index="${index}">`,
        `<td>${escapeHtml(item.file.name)}</td>`,
        `<td>${item.outputSize ? formatSize(item.outputSize) : "-"}</td>`,
        `<td>${escapeHtml(item.status)}</td>`,
        `<td>${item.url ? `<a class="button" href="${item.url}" download="${escapeHtml(item.download)}">下载</a>` : "-"}</td>`,
        "</tr>"
      ].join("")),
      "</tbody>",
      "</table>"
    ].join("");
  }

  function addFiles(nextFiles) {
    const images = [...nextFiles].filter((file) => file.type.startsWith("image/"));
    images.forEach((file) => files.push({ file, status: "待生成", url: "", download: "", outputSize: 0 }));
    renderList();
    setStatus(images.length ? `已添加 ${images.length} 张图片。` : "没有识别到图片文件。", images.length ? "" : "warn");
  }

  function canvasToBlob(targetCanvas, type, quality) {
    return new Promise((resolve, reject) => {
      targetCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("浏览器没有返回图片数据。"));
      }, type, quality);
    });
  }

  function copyToJpegCanvas(sourceCanvas, width, height) {
    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = width;
    targetCanvas.height = height;
    const targetCtx = targetCanvas.getContext("2d");
    if (!targetCtx) throw new Error("浏览器无法创建图片画布。");
    targetCtx.fillStyle = "#fff";
    targetCtx.fillRect(0, 0, width, height);
    targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
    return targetCanvas;
  }

  async function compressAsJpeg(sourceCanvas) {
    const exportCanvas = copyToJpegCanvas(sourceCanvas, sourceCanvas.width, sourceCanvas.height);
    let bestBlob = null;
    let low = 0.01;
    let high = 0.92;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const quality = (low + high) / 2;
      const blob = await canvasToBlob(exportCanvas, "image/jpeg", quality);
      if (blob.size <= MAX_OUTPUT_BYTES) {
        bestBlob = blob;
        low = quality;
      } else {
        high = quality;
      }
    }
    if (bestBlob) return bestBlob;

    const smallestBlob = await canvasToBlob(exportCanvas, "image/jpeg", 0.01);
    if (smallestBlob.size <= MAX_OUTPUT_BYTES) return smallestBlob;
    throw new Error(`保持 ${sourceCanvas.width}×${sourceCanvas.height} 分辨率时，最低画质仍有 ${formatSize(smallestBlob.size)}，无法压缩到 512 KB。`);
  }

  async function renderImage(item) {
    const { image, url } = await loadImage(item.file);
    try {
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      drawBadge(textInput.value);
      const pngBlob = await canvasToBlob(canvas, "image/png");
      if (pngBlob.size <= MAX_OUTPUT_BYTES) return { blob: pngBlob, extension: "png", compressed: false };
      return { blob: await compressAsJpeg(canvas), extension: "jpg", compressed: true };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function run() {
    if (!files.length) {
      setStatus("请先选择或拖入图片。", "warn");
      return;
    }
    runBtn.disabled = true;
    setStatus(`正在处理 ${files.length} 张图片...`);
    for (const [index, item] of files.entries()) {
      try {
        item.status = "生成中";
        if (item.url) URL.revokeObjectURL(item.url);
        item.url = "";
        item.download = "";
        item.outputSize = 0;
        renderList();
        const result = await renderImage(item);
        item.url = URL.createObjectURL(result.blob);
        item.download = `${fileStem(item.file.name)}-ai-generated.${result.extension}`;
        item.outputSize = result.blob.size;
        item.status = result.compressed ? "已生成（JPG 压缩）" : "已生成（PNG）";
        setStatus(`已处理 ${index + 1}/${files.length}：${item.file.name}`);
      } catch (error) {
        item.status = error.message || "生成失败";
      }
      renderList();
    }
    setStatus("图片处理完成，可在列表中逐张下载。", "ok");
    runBtn.disabled = false;
  }

  input.addEventListener("change", () => addFiles(input.files || []));
  clearBtn.addEventListener("click", () => {
    files.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    files.length = 0;
    input.value = "";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderList();
    setStatus("已清空，请选择一张或多张图片。");
  });
  runBtn.addEventListener("click", run);

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.style.borderColor = "var(--accent)";
      dropZone.style.background = "#eff6ff";
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.style.borderColor = "var(--border)";
      dropZone.style.background = "#f8fafc";
    });
  });
  dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer?.files || []));

  renderList();
})();
