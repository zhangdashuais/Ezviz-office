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

function renderPdfPageStrips(pdfPath) {
  const script = path.join(__dirname, "text-comparison-crops.py");
  return new Promise((resolve, reject) => {
    const child = spawn(bundledPython(), [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`PDF 页面渲染失败：${stderr || code}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("PDF 页面渲染结果格式不正确。")); }
    });
    child.stdin.end(JSON.stringify({ pdfPath, mode: "page-strips" }));
  });
}

module.exports = { cropPdfSegments, renderPdfPageStrips };
