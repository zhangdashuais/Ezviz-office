const DEFAULT_MATCH_THRESHOLD = 0.82;
const DEFAULT_CHANGED_THRESHOLD = 0.48;
const MAX_SEGMENTS_PER_SIDE = 2500;

function normalizeDisplayText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\ufb00/g, "ff")
    .replace(/\ufb01/g, "fi")
    .replace(/\ufb02/g, "fl")
    .replace(/\ufb03/g, "ffi")
    .replace(/\ufb04/g, "ffl")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/[“”„]/g, "\"")
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[×✕]/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value, options = {}) {
  let text = normalizeDisplayText(value);
  if (!options.caseSensitive) text = text.toLocaleLowerCase();
  return text
    .replace(/\s*([,.;:!?，。；：！？()[\]{}])\s*/g, "$1")
    .replace(/(\d)\s+(?=(?:mm|cm|km|kg|mg|mah|mp|gb|tb|mbps|ghz|mhz|khz|fps|lux|db|w|v|a|g|m|s|hz|%|°))/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function compactComparableText(value, options = {}) {
  return normalizeComparableText(value, options).replace(/\s+/g, "");
}

function splitLongText(value) {
  const text = normalizeDisplayText(value);
  if (!text) return [];
  if (text.length <= 320) return [text];

  const sentences = text
    .split(/(?<=[.!?;。！？；])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length > 1 && sentences.every((item) => item.length <= 420)) {
    return sentences;
  }

  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > 260) {
      chunks.push(current);
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function preparePdfSegments(pdfPages) {
  if (!Array.isArray(pdfPages) || !pdfPages.length) {
    throw new Error("PDF 没有提取到可比较的文字。");
  }
  const segments = [];
  pdfPages.forEach((page, pageIndex) => {
    const pageNumber = Number(page?.page) || pageIndex + 1;
    const lines = Array.isArray(page?.lines)
      ? page.lines
      : String(page?.text || "").split(/\r?\n/);
    lines.forEach((line) => {
      splitLongText(line).forEach((text) => {
        if (text.length >= 2 && /[\p{L}\p{N}]/u.test(text)) {
          segments.push({ text, page: pageNumber });
        }
      });
    });
  });
  if (!segments.length) throw new Error("PDF 没有提取到可比较的文字。");
  if (segments.length > MAX_SEGMENTS_PER_SIDE) {
    throw new Error(`PDF 文字片段过多，最多支持 ${MAX_SEGMENTS_PER_SIDE} 条。`);
  }
  return segments;
}

function prepareHtmlSegments(htmlSegments) {
  if (!Array.isArray(htmlSegments) || !htmlSegments.length) {
    throw new Error("HTML 没有提取到可比较的可见文字。");
  }
  const segments = [];
  htmlSegments.forEach((item) => {
    const raw = typeof item === "string" ? item : item?.text;
    splitLongText(raw).forEach((text) => {
      if (text.length >= 2 && /[\p{L}\p{N}]/u.test(text)) {
        segments.push({
          text,
          tag: typeof item === "object" ? String(item?.tag || "") : ""
        });
      }
    });
  });
  if (!segments.length) throw new Error("HTML 没有提取到可比较的可见文字。");
  if (segments.length > MAX_SEGMENTS_PER_SIDE) {
    throw new Error(`HTML 文字片段过多，最多支持 ${MAX_SEGMENTS_PER_SIDE} 条。`);
  }
  return segments;
}

function tokenize(value) {
  return normalizeComparableText(value)
    .match(/\p{N}+(?:[.,]\p{N}+)?(?:\p{L}+|[%°])*|\p{L}+/gu) || [];
}

function multisetDice(left, right) {
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  left.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  let common = 0;
  right.forEach((item) => {
    const count = counts.get(item) || 0;
    if (!count) return;
    common += 1;
    counts.set(item, count - 1);
  });
  return (2 * common) / (left.length + right.length);
}

function ngrams(value, size = 3) {
  const text = compactComparableText(value);
  if (!text) return [];
  if (text.length <= size) return [text];
  const result = [];
  for (let index = 0; index <= text.length - size; index += 1) {
    result.push(text.slice(index, index + size));
  }
  return result;
}

function textSimilarity(left, right) {
  const leftCompact = compactComparableText(left);
  const rightCompact = compactComparableText(right);
  if (!leftCompact || !rightCompact) return 0;
  if (leftCompact === rightCompact) return 1;

  const shorter = Math.min(leftCompact.length, rightCompact.length);
  const longer = Math.max(leftCompact.length, rightCompact.length);
  const lengthRatio = shorter / longer;
  const contains = leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact);
  if (contains) {
    const rightFacts = extractFacts(right);
    const sharedFacts = extractFacts(left).filter((fact) => rightFacts.includes(fact));
    if (shorter >= 5 || (shorter >= 3 && sharedFacts.length)) {
      return Math.min(0.98, 0.78 + (0.2 * lengthRatio));
    }
  }

  const tokenScore = multisetDice(tokenize(left), tokenize(right));
  const characterScore = multisetDice(ngrams(left), ngrams(right));
  return Number(((characterScore * 0.68) + (tokenScore * 0.32)).toFixed(4));
}

const FACT_PATTERN = /\bip\d{2,3}\b|[-+]?\d+(?:[.,]\d+)?\s*(?:mm|cm|km|kg|mg|mah|mp|gb|tb|mbps|ghz|mhz|khz|fps|lux|db|w|v|a|g|m|s|hz|k|%|x|°c|°f|°)/gi;

function extractFacts(value) {
  return Array.from(new Set(
    (normalizeDisplayText(value).match(FACT_PATTERN) || [])
      .map((item) => item.toLocaleLowerCase().replace(/\s+/g, ""))
  )).sort();
}

function factsDiffer(left, right) {
  const leftFacts = extractFacts(left);
  const rightFacts = extractFacts(right);
  if (!leftFacts.length && !rightFacts.length) return false;
  return leftFacts.join("|") !== rightFacts.join("|");
}

function shortQuote(value, maxLength = 140) {
  const text = normalizeDisplayText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function suggestionForItem(item) {
  if (item.type === "match") return "无需修改。";
  if (item.type === "changed" && item.critical) {
    return `高优先级：数值或单位不一致。请以确认后的 PDF 内容“${shortQuote(item.pdfText)}”核对并修改 HTML。`;
  }
  if (item.type === "changed") {
    return `请核对文案差异；若 PDF 为基准，建议将 HTML 调整为“${shortQuote(item.pdfText)}”。`;
  }
  if (item.type === "missing" && item.critical) {
    return `高优先级：HTML 缺少 PDF 第 ${item.page} 页的参数或数值“${shortQuote(item.pdfText)}”，建议补充。`;
  }
  if (item.type === "missing") {
    return `HTML 中未找到该文字；请确认是否需要补充 PDF 第 ${item.page} 页内容。`;
  }
  if (item.type === "extra" && item.critical) {
    return `高优先级：HTML 存在 PDF 未找到的数值或单位“${shortQuote(item.htmlText)}”，请确认是否正确。`;
  }
  return "HTML 中存在 PDF 未找到的文字；若 PDF 是最终基准，请确认是否删除或更新 PDF。";
}

function buildRecommendations(summary) {
  const recommendations = [];
  if (summary.critical) {
    recommendations.push({
      level: "high",
      message: `优先处理 ${summary.critical} 条数值或单位风险，重点核对型号、尺寸、倍率、功率、容量和认证等级。`
    });
  }
  if (summary.missing) {
    recommendations.push({
      level: "medium",
      message: `HTML 缺少 ${summary.missing} 条 PDF 文字，请确认这些内容是否应出现在产品页面。`
    });
  }
  if (summary.changed) {
    recommendations.push({
      level: "medium",
      message: `有 ${summary.changed} 条文字相近但不一致，建议逐条确认是文案优化还是错误修改。`
    });
  }
  if (summary.extra) {
    recommendations.push({
      level: "low",
      message: `HTML 多出 ${summary.extra} 条文字，请确认是否为网页专用补充内容。`
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      level: "pass",
      message: "PDF 与 HTML 的可见文字一致，无需修改。"
    });
  }
  return recommendations;
}

function buildCandidates(pdfSegments, htmlSegments, changedThreshold) {
  const candidates = [];
  for (let pdfIndex = 0; pdfIndex < pdfSegments.length; pdfIndex += 1) {
    for (let htmlIndex = 0; htmlIndex < htmlSegments.length; htmlIndex += 1) {
      const score = textSimilarity(
        pdfSegments[pdfIndex].text,
        htmlSegments[htmlIndex].text
      );
      if (score >= changedThreshold) {
        candidates.push({ pdfIndex, htmlIndex, score });
      }
    }
  }
  candidates.sort((left, right) =>
    right.score - left.score
    || left.pdfIndex - right.pdfIndex
    || left.htmlIndex - right.htmlIndex);
  return candidates;
}

function compareTextContent(input = {}) {
  const pdfSegments = preparePdfSegments(input.pdfPages);
  const htmlSegments = prepareHtmlSegments(input.htmlSegments);
  const requestedMatchThreshold = Number(input.options?.matchThreshold);
  const matchThreshold = Number.isFinite(requestedMatchThreshold)
    ? Math.min(0.98, Math.max(0.65, requestedMatchThreshold))
    : DEFAULT_MATCH_THRESHOLD;
  const changedThreshold = Math.min(DEFAULT_CHANGED_THRESHOLD, matchThreshold - 0.1);

  const pdfMatches = new Map();
  const htmlMatches = new Set();
  const candidates = buildCandidates(pdfSegments, htmlSegments, changedThreshold);
  candidates.forEach((candidate) => {
    if (pdfMatches.has(candidate.pdfIndex) || htmlMatches.has(candidate.htmlIndex)) return;
    pdfMatches.set(candidate.pdfIndex, candidate);
    htmlMatches.add(candidate.htmlIndex);
  });

  const items = [];
  pdfSegments.forEach((pdfSegment, pdfIndex) => {
    const candidate = pdfMatches.get(pdfIndex);
    if (!candidate) {
      items.push({
        type: "missing",
        page: pdfSegment.page,
        pdfText: pdfSegment.text,
        htmlText: "",
        similarity: 0,
        critical: extractFacts(pdfSegment.text).length > 0
      });
      return;
    }
    const htmlSegment = htmlSegments[candidate.htmlIndex];
    const type = candidate.score >= matchThreshold ? "match" : "changed";
    items.push({
      type,
      page: pdfSegment.page,
      pdfText: pdfSegment.text,
      htmlText: htmlSegment.text,
      htmlTag: htmlSegment.tag,
      similarity: candidate.score,
      critical: type === "changed" && factsDiffer(pdfSegment.text, htmlSegment.text)
    });
  });

  htmlSegments.forEach((htmlSegment, htmlIndex) => {
    if (htmlMatches.has(htmlIndex)) return;
    items.push({
      type: "extra",
      page: null,
      pdfText: "",
      htmlText: htmlSegment.text,
      htmlTag: htmlSegment.tag,
      similarity: 0,
      critical: extractFacts(htmlSegment.text).length > 0
    });
  });
  items.forEach((item) => {
    item.suggestion = suggestionForItem(item);
  });

  const counts = items.reduce((summary, item) => {
    summary[item.type] += 1;
    if (item.critical) summary.critical += 1;
    return summary;
  }, { match: 0, changed: 0, missing: 0, extra: 0, critical: 0 });
  const pdfCompared = counts.match + counts.changed + counts.missing;
  const matchRate = pdfCompared
    ? Number(((counts.match / pdfCompared) * 100).toFixed(1))
    : 0;
  const differenceCount = counts.changed + counts.missing + counts.extra;
  const verdict = counts.critical
    ? "fail"
    : differenceCount
      ? "warning"
      : "pass";
  const verdictText = verdict === "fail"
    ? "存在数值或单位风险，建议修正后再发布。"
    : verdict === "warning"
      ? "存在文字差异，请人工确认后再发布。"
      : "文本核验通过。";
  const summary = {
    ...counts,
    pdfPages: new Set(pdfSegments.map((item) => item.page)).size,
    pdfSegments: pdfSegments.length,
    htmlSegments: htmlSegments.length,
    matchRate,
    differenceCount,
    verdict,
    verdictText
  };

  return {
    files: {
      pdf: String(input.files?.pdf || ""),
      html: String(input.files?.html || "")
    },
    summary,
    recommendations: buildRecommendations(summary),
    options: { matchThreshold },
    items
  };
}

module.exports = {
  DEFAULT_MATCH_THRESHOLD,
  normalizeDisplayText,
  normalizeComparableText,
  textSimilarity,
  extractFacts,
  factsDiffer,
  compareTextContent
};
