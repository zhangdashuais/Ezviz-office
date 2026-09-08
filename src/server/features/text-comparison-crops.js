const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function bundledPython() {
  const candidates = [
    process.env.PDF_COMPARISON_PYTHON,
    path.resolve(path.dirname(process.execPath), "..", "..", "python", "python.exe"),
    path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "python";
}

function cropPdfSegments(pdfPath, segments) {
  const selected = (segments || []).slice(0, 50).filter((item) =>
    Number.isInteger(item?.page) && Array.isArray(item?.bbox) && item.bbox.length === 4);
  if (!selected.length) return Promise.resolve([]);
  const script = path.join(__dirname, "text-comparison-crops.py");
  return new Promise((resolve, reject) => {
    const child = spawn(bundledPython(), [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`PDF 分段图片生成失败：${stderr || code}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("PDF 分段图片结果格式不正确。")); }
    });
    child.stdin.end(JSON.stringify({ pdfPath, segments: selected }));
  });
}

async function renderPdfPageStrips(pdfPath) {
  const { createCanvas } = require("@napi-rs/canvas");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
    disableWorker: true
  });
  const document = await loadingTask.promise;
  const result = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      for (let strip = 0; strip < 3; strip += 1) {
        const top = Math.floor(canvas.height * strip / 3);
        const bottom = Math.floor(canvas.height * (strip + 1) / 3);
        const cropped = createCanvas(canvas.width, bottom - top);
        cropped.getContext("2d").drawImage(
          canvas,
          0, top, canvas.width, bottom - top,
          0, 0, canvas.width, bottom - top
        );
        result.push({ page: pageNumber, strip, image: cropped.toDataURL("image/png") });
      }
      page.cleanup();
    }
    return result;
  } finally {
    await loadingTask.destroy();
  }
}

module.exports = { cropPdfSegments, renderPdfPageStrips };
