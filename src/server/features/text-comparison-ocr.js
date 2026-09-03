const { createWorker } = require("tesseract.js");
const { normalizeDisplayText } = require("./text-comparison");
const { renderPdfPageStrips } = require("./text-comparison-crops");

async function extractPdfPagesByOcr(pdfPath, language = "eng") {
  const strips = await renderPdfPageStrips(pdfPath);
  if (!strips.length) throw new Error("PDF 没有可识别的页面。" );
  const worker = await createWorker(language);
  try {
    const pages = new Map();
    for (const strip of strips) {
      const { data } = await worker.recognize(strip.image);
      const lines = String(data.text || "").split(/\r?\n/)
        .map(normalizeDisplayText).filter((text) => text.length >= 2);
      if (!pages.has(strip.page)) pages.set(strip.page, []);
      lines.forEach((text) => pages.get(strip.page).push({ text, image: strip.image }));
    }
    const result = [...pages.entries()].map(([page, lineDetails]) => ({
      page,
      lines: lineDetails.map((line) => line.text),
      lineDetails
    }));
    if (!result.some((page) => page.lines.length)) {
      throw new Error("OCR 未识别到可比较文字，请确认 PDF 清晰度和 OCR 语言。" );
    }
    return result;
  } finally {
    await worker.terminate();
  }
}

module.exports = { extractPdfPagesByOcr };
