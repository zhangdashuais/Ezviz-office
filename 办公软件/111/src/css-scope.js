(function initCssScope(globalObject, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (globalObject) {
    globalObject.EzvizCssScope = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCssScope() {
  const DEFAULT_SCOPE = ".page.page-webflow";
  const GROUPING_AT_RULES = new Set([
    "container",
    "document",
    "layer",
    "media",
    "scope",
    "starting-style",
    "supports"
  ]);

  function readComment(css, start) {
    const end = css.indexOf("*/", start + 2);
    return end === -1 ? css.length : end + 2;
  }

  function findPreludeEnd(css, start) {
    let quote = "";
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = start; index < css.length; index += 1) {
      const char = css[index];
      const next = css[index + 1];

      if (!quote && char === "/" && next === "*") {
        index = readComment(css, index) - 1;
        continue;
      }

      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === "\"" || char === "'") quote = char;
      else if (char === "(") parentheses += 1;
      else if (char === ")") parentheses = Math.max(0, parentheses - 1);
      else if (char === "[") brackets += 1;
      else if (char === "]") brackets = Math.max(0, brackets - 1);
      else if (!parentheses && !brackets && (char === "{" || char === ";")) {
        return { index, delimiter: char };
      }
    }

    return { index: css.length, delimiter: "" };
  }

  function findBlockEnd(css, openIndex) {
    let depth = 1;
    let quote = "";
    let escaped = false;

    for (let index = openIndex + 1; index < css.length; index += 1) {
      const char = css[index];
      const next = css[index + 1];

      if (!quote && char === "/" && next === "*") {
        index = readComment(css, index) - 1;
        continue;
      }

      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === "\"" || char === "'") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }

    throw new Error("Invalid CSS: missing closing brace.");
  }

  function splitSelectorList(selectorText) {
    const selectors = [];
    let start = 0;
    let quote = "";
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = 0; index < selectorText.length; index += 1) {
      const char = selectorText[index];

      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === "\"" || char === "'") quote = char;
      else if (char === "(") parentheses += 1;
      else if (char === ")") parentheses = Math.max(0, parentheses - 1);
      else if (char === "[") brackets += 1;
      else if (char === "]") brackets = Math.max(0, brackets - 1);
      else if (char === "," && !parentheses && !brackets) {
        selectors.push(selectorText.slice(start, index));
        start = index + 1;
      }
    }

    selectors.push(selectorText.slice(start));
    return selectors;
  }

  function scopeSelector(selector, scope) {
    const value = selector.trim();
    if (!value) return value;
    if (value === scope || value.startsWith(scope + " ") || value.startsWith(scope + ">")) {
      return value;
    }

    if (value === ":root" || value === "html" || value === "body") return scope;
    if (value.startsWith(":root ")) return scope + value.slice(5);
    if (value.startsWith("html ")) return scope + value.slice(4);
    if (value.startsWith("body ")) return scope + value.slice(4);

    return `${scope} ${value}`;
  }

  function scopeSelectorList(selectorText, scope) {
    return splitSelectorList(selectorText)
      .map((selector) => scopeSelector(selector, scope))
      .join(", ");
  }

  function processRules(css, scope) {
    let output = "";
    let cursor = 0;

    while (cursor < css.length) {
      if (/\s/.test(css[cursor])) {
        output += css[cursor];
        cursor += 1;
        continue;
      }

      if (css[cursor] === "/" && css[cursor + 1] === "*") {
        const commentEnd = readComment(css, cursor);
        output += css.slice(cursor, commentEnd);
        cursor = commentEnd;
        continue;
      }

      const preludeEnd = findPreludeEnd(css, cursor);
      const prelude = css.slice(cursor, preludeEnd.index).trim();

      if (!preludeEnd.delimiter) {
        output += css.slice(cursor);
        break;
      }

      if (preludeEnd.delimiter === ";") {
        output += css.slice(cursor, preludeEnd.index + 1);
        cursor = preludeEnd.index + 1;
        continue;
      }

      const closeIndex = findBlockEnd(css, preludeEnd.index);
      const body = css.slice(preludeEnd.index + 1, closeIndex);

      if (prelude.startsWith("@")) {
        const name = prelude.slice(1).match(/^[\w-]+/)?.[0]?.toLowerCase() || "";
        const isKeyframes = name === "keyframes" || name.endsWith("keyframes");
        const nextBody = GROUPING_AT_RULES.has(name) && !isKeyframes
          ? processRules(body, scope)
          : body;
        output += `${prelude}{${nextBody}}`;
      } else {
        output += `${scopeSelectorList(prelude, scope)}{${body}}`;
      }

      cursor = closeIndex + 1;
    }

    return output;
  }

  function scopeCss(cssText, scope = DEFAULT_SCOPE) {
    const css = String(cssText || "");
    const normalizedScope = String(scope || "").trim();
    if (!normalizedScope) throw new Error("CSS scope selector is required.");
    return processRules(css, normalizedScope);
  }

  return {
    DEFAULT_SCOPE,
    scopeCss,
    scopeSelectorList
  };
});
