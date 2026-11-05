const { parseFragment } = require("parse5");

const WRAPPER_MARKER = "data-ezviz-blog-ai-image";
const DEFAULT_TEXT = "AI GENERATED";

function walk(node, visit, ancestors = []) {
  visit(node, ancestors);
  for (const child of node.childNodes || []) walk(child, visit, [...ancestors, node]);
}

function locationOf(node) {
  const location = node.sourceCodeLocation;
  return location && Number.isInteger(location.startOffset) && Number.isInteger(location.endOffset)
    ? { start: location.startOffset, end: location.endOffset }
    : null;
}

function applyReplacements(html, replacements) {
  let result = html;
  for (const item of replacements.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, item.start) + item.value + result.slice(item.end);
  }
  return result;
}

function removeGeneratedBadges(html) {
  const replacements = [];
  walk(parseFragment(html, { sourceCodeLocationInfo: true }), (node) => {
    if (node.tagName !== "span" || !(node.attrs || []).some((attr) => attr.name === WRAPPER_MARKER)) return;
    const wrapper = locationOf(node);
    const image = (node.childNodes || []).find((child) => child.tagName === "img" || child.tagName === "picture");
    const original = image && locationOf(image);
    if (wrapper && original) replacements.push({ ...wrapper, value: html.slice(original.start, original.end) });
  });
  return applyReplacements(html, replacements);
}

function imageTargets(html) {
  const targets = [];
  walk(parseFragment(html, { sourceCodeLocationInfo: true }), (node, ancestors) => {
    if (node.tagName === "picture") {
      let hasImage = false;
      walk(node, (child) => { if (child.tagName === "img") hasImage = true; });
      if (hasImage) {
        const location = locationOf(node);
        if (location) targets.push(location);
      }
    }
    if (node.tagName === "img" && !ancestors.some((ancestor) => ancestor.tagName === "picture")) {
      const location = locationOf(node);
      if (location) targets.push(location);
    }
  });
  return targets;
}

function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function addBlogImageAiBadges(input, options = {}) {
  if (typeof input !== "string" || !input.trim()) throw new Error("请提供 Blog HTML 代码。");
  const text = String(options.text || DEFAULT_TEXT).trim();
  if (!text || text.length > 80) throw new Error("标识文案需为 1 至 80 个字符。");
  const source = removeGeneratedBadges(input);
  const targets = imageTargets(source);
  if (!targets.length) throw new Error("Blog HTML 中没有找到 <img> 元素。");
  const badge = `<span aria-hidden="true" style="position:absolute;right:8px;bottom:8px;z-index:1;pointer-events:none;padding:5px 8px;border:1px solid rgba(255,255,255,.22);border-radius:5px;background:rgba(0,0,0,.58);color:#fff;font:700 12px/1 Arial,sans-serif;white-space:nowrap;box-sizing:border-box;line-height:1;transform:scale(.75);transform-origin:right bottom;">${escapeText(text)}</span>`;
  const html = applyReplacements(source, targets.map((target) => ({
    ...target,
    value: `<span ${WRAPPER_MARKER} style="display:inline-block;position:relative;max-width:100%;vertical-align:middle;line-height:0;">${source.slice(target.start, target.end)}${badge}</span>`
  })));
  return { html, imageCount: targets.length };
}

module.exports = { addBlogImageAiBadges };
