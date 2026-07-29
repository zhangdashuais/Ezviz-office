const cheerio = require("cheerio");
const { normalizeDisplayText } = require("./text-comparison");

let pdfJsPromise = null;

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfJsPromise;
}

function groupPdfItemsIntoLines(items) {
  const rows = [];
  const sorted = (items || [])
    .filter((item) => normalizeDisplayText(item.str))
    .map((item) => ({
      text: normalizeDisplayText(item.str),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Math.max(0, Number(item.width || 0))
    }))
    .sort((left, right) =>
      Math.abs(right.y - left.y) > 4
        ? right.y - left.y
        : left.x - right.x);

  for (const item of sorted) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 4);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }

  const lines = [];
  rows
    .sort((left, right) => right.y - left.y)
    .forEach((row) => {
      const rowItems = row.items.sort((left, right) => left.x - right.x);
      let current = "";
      let previousEnd = null;
      rowItems.forEach((item) => {
        const gap = previousEnd === null ? 0 : item.x - previousEnd;
        if (current && gap > 38) {
          lines.push(normalizeDisplayText(current));
          current = item.text;
        } else {
          current += (current ? " " : "") + item.text;
        }
        previousEnd = item.x + item.width;
      });
      if (current) lines.push(normalizeDisplayText(current));
    });
  return lines.filter(Boolean);
}

async function extractPdfPages(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("PDF 文件为空。");
  }
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false
  });
  let document;
  try {
    document = await loadingTask.promise;
  } catch (error) {
    if (/password/i.test(error?.name || "") || /password/i.test(error?.message || "")) {
      throw new Error("PDF 已加密，暂不支持读取，请上传未加密版本。");
    }
    throw new Error("PDF 解析失败：" + (error?.message || String(error)));
  }

  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        page: pageNumber,
        lines: groupPdfItemsIntoLines(content.items)
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  if (!pages.some((page) => page.lines.length)) {
    throw new Error("PDF 中没有可提取文字；扫描版 PDF 需要先完成 OCR。");
  }
  return pages;
}

function extractHtmlSegments(html) {
  const source = String(html || "");
  if (!source.trim()) throw new Error("HTML 文件为空。");

  const $ = cheerio.load(source, { decodeEntities: true });
  $("script,style,noscript,template,svg,canvas,[hidden],[aria-hidden='true']").remove();
  $("[style]").each((_index, node) => {
    const style = String($(node).attr("style") || "").toLowerCase();
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(style)) $(node).remove();
  });

  const preferredBlocks = new Set([
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd",
    "th", "td", "caption", "figcaption", "button", "a", "label"
  ]);
  const fallbackBlocks = new Set([
    "div", "section", "article", "header", "footer", "main", "aside"
  ]);
  const groups = new Map();

  function ownerFor(node) {
    let parent = node.parent;
    let fallback = null;
    while (parent && parent.type !== "root") {
      const tag = String(parent.name || "").toLowerCase();
      if (!fallback && fallbackBlocks.has(tag)) fallback = parent;
      if (preferredBlocks.has(tag)) return parent;
      parent = parent.parent;
    }
    return fallback || node.parent;
  }

  function visit(node) {
    if (node.type === "text") {
      const text = normalizeDisplayText(node.data);
      if (text) {
        const owner = ownerFor(node);
        if (!groups.has(owner)) {
          groups.set(owner, {
            tag: String(owner?.name || "body").toLowerCase(),
            parts: []
          });
        }
        groups.get(owner).parts.push(text);
      }
      return;
    }
    (node.children || []).forEach(visit);
  }

  const body = $("body").get(0) || $.root().get(0);
  visit(body);
  const segments = Array.from(groups.values())
    .map((item) => ({
      tag: item.tag,
      text: normalizeDisplayText(item.parts.join(" "))
    }))
    .filter((item) => item.text && /[\p{L}\p{N}]/u.test(item.text));

  if (!segments.length) throw new Error("HTML 文件中没有识别到可见文字。");
  return segments;
}

module.exports = {
  groupPdfItemsIntoLines,
  extractPdfPages,
  extractHtmlSegments
};
