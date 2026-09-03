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

  const sentences = text
    .split(/(?<=[.!?;。！？；])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length > 1 && sentences.every((item) => item.length <= 420)) {
    return sentences;
  }

  if (text.length <= 320) return [text];

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

function isSpecificationPage(page) {
  const lines = Array.isArray(page?.lines)
    ? page.lines
    : String(page?.text || "").split(/\r?\n/);
  const firstLine = lines.map(normalizeDisplayText).find(Boolean) || "";
  return /^specifications?\b/i.test(firstLine);
}

function preparePdfSegments(pdfPages, options = {}) {
  if (!Array.isArray(pdfPages) || !pdfPages.length) {
    throw new Error("PDF 没有提取到可比较的文字。");
  }
  const segments = [];
  const specificationStartIndex = options.excludeSpecifications === false
    ? -1
    : pdfPages.findIndex(isSpecificationPage);
  pdfPages.forEach((page, pageIndex) => {
    if (specificationStartIndex >= 0 && pageIndex >= specificationStartIndex) return;
    const pageNumber = Number(page?.page) || pageIndex + 1;
    const lines = Array.isArray(page?.lines)
      ? page.lines
      : String(page?.text || "").split(/\r?\n/);
    const lineDetails = Array.isArray(page?.lineDetails) && page.lineDetails.length
      ? page.lineDetails
      : lines.map((text) => ({ text, bbox: null }));
    lineDetails.forEach((line) => {
      splitLongText(line.text).forEach((text) => {
        if (text.length >= 2 && /[\p{L}\p{N}]/u.test(text)) {
          segments.push({ text, page: pageNumber, bbox: line.bbox || null, image: line.image || "" });
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
          tag: typeof item === "object" ? String(item?.tag || "") : "",
          languageKeys: typeof item === "object" && Array.isArray(item?.languageKeys)
            ? item.languageKeys.map(String).filter(Boolean)
            : [],
          section: typeof item === "object" ? item?.section || null : null
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

function htmlContainsPdfText(htmlText, pdfText, options = {}) {
  const htmlComparable = compactComparableText(htmlText, options);
  const pdfComparable = compactComparableText(pdfText, options);
  return Boolean(pdfComparable && htmlComparable.includes(pdfComparable));
}

function formatHtmlSection(section, blockStart, blockEnd) {
  if (!section) return "";
  const parts = [`Section ${section.index}`];
  if (section.id) parts.push(`#${section.id}`);
  if (section.className) {
    parts.push(section.className.split(/\s+/).filter(Boolean).map((name) => `.${name}`).join(""));
  }
  if (section.heading) parts.push(section.heading);
  if (blockStart) {
    parts.push(blockStart === blockEnd ? `块 ${blockStart}` : `块 ${blockStart}-${blockEnd}`);
  }
  return parts.join(" · ");
}

function findHtmlContainment(htmlSegments, pdfText, options = {}) {
  const needle = compactComparableText(pdfText, options);
  if (!needle) return null;

  const blockCounts = new Map();
  let offset = 0;
  const searchable = htmlSegments.map((candidate) => {
    const sectionIndex = candidate.section?.index || 0;
    const block = sectionIndex ? (blockCounts.get(sectionIndex) || 0) + 1 : 0;
    if (sectionIndex) blockCounts.set(sectionIndex, block);
    const comparable = compactComparableText(candidate.text, options);
    const item = {
      ...candidate,
      block,
      start: offset,
      end: offset + comparable.length,
      comparable
    };
    offset = item.end;
    return item;
  }).filter((candidate) => candidate.comparable);
  const completeHtmlText = searchable.map((candidate) => candidate.comparable).join("");
  const matchStart = completeHtmlText.indexOf(needle);
  if (matchStart < 0) return null;
  const matchEnd = matchStart + needle.length;
  const matched = searchable.filter((candidate) =>
    candidate.end > matchStart && candidate.start < matchEnd
  );
  if (!matched.length) return null;

  const locations = [];
  for (const candidate of matched) {
    const previous = locations.at(-1);
    if (previous && previous.section?.index === candidate.section?.index) {
      previous.endBlock = candidate.block;
    } else {
      locations.push({
        section: candidate.section,
        startBlock: candidate.block,
        endBlock: candidate.block
      });
    }
  }
  return {
    text: matched.map((candidate) => candidate.text).join(" "),
    tag: matched.length === 1 ? matched[0].tag : "document",
    languageKeys: [...new Set(matched.flatMap((candidate) => candidate.languageKeys || []))],
    section: matched[0].section,
    sectionText: locations
      .map((location) => formatHtmlSection(
        location.section,
        location.startBlock,
        location.endBlock
      ) || "HTML 文档")
      .join(" → ")
  };
}

function suggestLanguageFieldChange(htmlSegments, pdfText, changedThreshold) {
  const candidates = htmlSegments
    .filter((segment) => Array.isArray(segment.languageKeys) && segment.languageKeys.length)
    .map((segment) => ({
      segment,
      similarity: textSimilarity(pdfText, segment.text)
    }))
    .filter((candidate) => candidate.similarity >= changedThreshold)
    .sort((left, right) => right.similarity - left.similarity);
  const best = candidates[0];
  if (!best) return [];
  return [...new Set(best.segment.languageKeys)].map((key) => ({
    key,
    currentText: best.segment.text,
    suggestedText: pdfText,
    similarity: best.similarity
  }));
}

function compareTextContent(input = {}) {
  const pdfSegments = preparePdfSegments(input.pdfPages, input.options);
  const htmlSegments = prepareHtmlSegments(input.htmlSegments);
  const changedThreshold = Number(input.options?.changedThreshold || DEFAULT_CHANGED_THRESHOLD);
  const excludedSpecificationPages = input.options?.excludeSpecifications === false
    ? []
    : (() => {
      const startIndex = input.pdfPages.findIndex(isSpecificationPage);
      return startIndex >= 0 ? input.pdfPages.slice(startIndex) : [];
    })();
  const excludedSpecificationSegments = excludedSpecificationPages.reduce((total, page) => {
    const lines = Array.isArray(page?.lines)
      ? page.lines
      : String(page?.text || "").split(/\r?\n/);
    return total + lines.reduce((count, line) => count + splitLongText(line)
      .filter((text) => text.length >= 2 && /[\p{L}\p{N}]/u.test(text)).length, 0);
  }, 0);
  const items = pdfSegments.map((pdfSegment) => {
    const htmlSegment = findHtmlContainment(htmlSegments, pdfSegment.text, input.options);
    if (htmlSegment) {
      return {
        type: "match",
        page: pdfSegment.page,
        pdfCrop: pdfSegment.bbox || null,
        pdfImage: pdfSegment.image || "",
        pdfText: pdfSegment.text,
        htmlText: htmlSegment.text,
        htmlTag: htmlSegment.tag,
        htmlSection: htmlSegment.sectionText,
        htmlLanguageKeys: htmlSegment.languageKeys || [],
        similarity: 1,
        critical: false,
        suggestion: "HTML 已包含该 PDF 文字片段，无需修改。"
      };
    }
    const critical = extractFacts(pdfSegment.text).length > 0;
    const languageFieldSuggestions = suggestLanguageFieldChange(
      htmlSegments,
      pdfSegment.text,
      changedThreshold
    );
    return {
      type: "missing",
      page: pdfSegment.page,
      pdfCrop: pdfSegment.bbox || null,
      pdfImage: pdfSegment.image || "",
      pdfText: pdfSegment.text,
      htmlText: "",
      htmlSection: "",
      similarity: 0,
      critical,
      languageFieldSuggestions,
      suggestion: languageFieldSuggestions.length
        ? `建议修改语言字段 ${languageFieldSuggestions.map((item) => item.key).join("、")} 为“${shortQuote(pdfSegment.text)}”。`
        : critical
          ? "HTML 未包含该 PDF 数值或单位片段，请优先核对风险。"
          : "HTML 未包含该 PDF 文字片段，请人工确认风险。"
    };
  });

  const counts = items.reduce((summary, item) => {
    summary[item.type] += 1;
    if (item.critical) summary.critical += 1;
    return summary;
  }, { match: 0, changed: 0, missing: 0, extra: 0, critical: 0 });
  const pdfCompared = counts.match + counts.missing;
  const matchRate = pdfCompared
    ? Number(((counts.match / pdfCompared) * 100).toFixed(1))
    : 0;
  const differenceCount = counts.missing;
  const verdict = differenceCount ? "warning" : "pass";
  const verdictText = verdict === "warning"
    ? "HTML 未包含部分 PDF 已提取文字，请人工确认风险。"
    : "PDF 已提取文字均包含在 HTML 中，核验通过。";
  const summary = {
    ...counts,
    pdfPages: new Set(pdfSegments.map((item) => item.page)).size,
    pdfSegments: pdfSegments.length,
    htmlSegments: htmlSegments.length,
    excludedSpecificationPages: excludedSpecificationPages.length,
    excludedSpecificationSegments,
    matchRate,
    differenceCount,
    languageFieldSuggestionCount: items.reduce(
      (sum, item) => sum + (item.languageFieldSuggestions?.length || 0),
      0
    ),
    verdict,
    verdictText
  };

  return {
    files: {
      pdf: String(input.files?.pdf || ""),
      html: String(input.files?.html || ""),
      languagePackage: String(input.files?.languagePackage || "")
    },
    languageReplacement: input.languageReplacement || null,
    summary,
    recommendations: differenceCount
      ? [{ level: counts.critical ? "high" : "medium", message: `HTML 未包含 ${differenceCount} 条 PDF 已提取文字，请逐条确认。` }]
      : [{ level: "pass", message: "HTML 已包含全部 PDF 已提取文字；HTML 的其他补充内容不参与风险判断。" }],
    options: {
      mode: "pdf-fragment-contained-in-html",
      excludeSpecifications: input.options?.excludeSpecifications !== false
    },
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
  isSpecificationPage,
  htmlContainsPdfText,
  findHtmlContainment,
  compareTextContent
};
