(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.languageColumnFilterRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function isEnglish(header) {
    return /(^|[_\s(])english([\s)_-]|$)|英文/i.test(text(header));
  }

  function detectLanguageBlocks(headers, kind) {
    const values = Array.from(headers || [], text);
    const starts = values.map((value, index) => value ? index : -1).filter((index) => index >= 0);
    if (!starts.length) throw new Error(`${kind} 第一行没有检测到语言列。`);
    const width = kind === "specification" ? 2 : 1;
    const blocks = starts.map((start) => ({ header: values[start], start, width }));
    const english = blocks.find((item) => isEnglish(item.header));
    if (!english) throw new Error(`${kind} 没有检测到英文列。`);
    return { blocks, english };
  }

  function selectedColumns(kind, english, target) {
    const columns = kind === "datasheet" ? [0] : [];
    [english, target].forEach((block) => {
      for (let offset = 0; offset < block.width; offset += 1) columns.push(block.start + offset);
    });
    return [...new Set(columns)].sort((a, b) => a - b);
  }

  function isStatusRow(values) {
    const cells = Array.from(values || [], text).filter(Boolean);
    return cells.length > 0 && cells.every((value) => /^ok$/i.test(value));
  }

  return { detectLanguageBlocks, isEnglish, selectedColumns, isStatusRow };
});
