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

  function extractHtmlClassNames(htmlText) {
    const html = String(htmlText || "");
    const classNames = new Set();

    if (typeof DOMParser === "function") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("[class]").forEach((element) => {
        String(element.getAttribute("class") || "")
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) => classNames.add(item));
      });
    }

    for (const match of html.matchAll(/\bclass\s*=\s*(["'])(.*?)\1/gis)) {
      String(match[2] || "")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => classNames.add(item));
    }

    return classNames;
  }

  function defaultKeepClassName(className) {
    return /^(?:w-|w--|w-mod-|w-condition-|w-dyn-|w-current$)/.test(className);
  }

  function collectSelectorClasses(selector) {
    const cleaned = String(selector || "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, "");
    const classes = [];
    for (const match of cleaned.matchAll(/(^|[^\\])\.(-?[_a-zA-Z][\w-]*)/g)) {
      classes.push(match[2]);
    }
    return classes;
  }

  function selectorUsesKnownClasses(selector, usedClassNames, keepClassName) {
    const classes = collectSelectorClasses(selector);
    if (!classes.length) return true;

    const uniqueClasses = [...new Set(classes)];
    const isFunctionalSelector = /:(?:is|where|has|not)\s*\(/i.test(selector);
    if (isFunctionalSelector) {
      return uniqueClasses.some((className) =>
        usedClassNames.has(className) || keepClassName(className));
    }

    return uniqueClasses.every((className) =>
      usedClassNames.has(className) || keepClassName(className));
  }

  function pruneSelectorList(selectorText, usedClassNames, keepClassName) {
    return splitSelectorList(selectorText)
      .map((selector) => selector.trim())
      .filter(Boolean)
      .filter((selector) => selectorUsesKnownClasses(selector, usedClassNames, keepClassName))
      .join(", ");
  }

  function pruneCssRules(css, usedClassNames, keepClassName) {
    let output = "";
    let cursor = 0;
    let removedRuleCount = 0;
    let removedSelectorCount = 0;

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
        if (GROUPING_AT_RULES.has(name) && !isKeyframes) {
          const nested = pruneCssRules(body, usedClassNames, keepClassName);
          removedRuleCount += nested.removedRuleCount;
          removedSelectorCount += nested.removedSelectorCount;
          if (nested.css.trim()) output += `${prelude}{${nested.css}}`;
        } else {
          output += `${prelude}{${body}}`;
        }
      } else {
        const selectors = splitSelectorList(prelude).map((selector) => selector.trim()).filter(Boolean);
        const nextPrelude = pruneSelectorList(prelude, usedClassNames, keepClassName);
        const keptCount = nextPrelude ? splitSelectorList(nextPrelude).filter((selector) => selector.trim()).length : 0;
        removedSelectorCount += Math.max(0, selectors.length - keptCount);
        if (nextPrelude) {
          output += `${nextPrelude}{${body}}`;
        } else {
          removedRuleCount += 1;
        }
      }

      cursor = closeIndex + 1;
    }

    return { css: output, removedRuleCount, removedSelectorCount };
  }

  function buildKeepClassName(options) {
    const safelist = options?.safelist instanceof Set
      ? options.safelist
      : new Set(options?.safelist || []);
    const safelistPatterns = (options?.safelistPatterns || [])
      .map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(String(pattern)))
      .filter(Boolean);
    const keepDefaultDynamicClasses = options?.keepDefaultDynamicClasses !== false;

    return (className) => {
      if (safelist.has(className)) return true;
      if (keepDefaultDynamicClasses && defaultKeepClassName(className)) return true;
      return safelistPatterns.some((pattern) => pattern.test(className));
    };
  }

  function pruneUnusedCssClasses(cssText, htmlText, options = {}) {
    const css = String(cssText || "");
    const usedClassNames = options.usedClassNames instanceof Set
      ? new Set(options.usedClassNames)
      : extractHtmlClassNames(htmlText);
    const keepClassName = buildKeepClassName(options);
    const result = pruneCssRules(css, usedClassNames, keepClassName);
    return {
      ...result,
      usedClassNames,
      usedClassCount: usedClassNames.size
    };
  }

  function pruneInlineStyleTags(htmlText, options = {}) {
    const html = String(htmlText || "");
    const usedClassNames = options.usedClassNames instanceof Set
      ? new Set(options.usedClassNames)
      : extractHtmlClassNames(html);
    let styleBlockCount = 0;
    let removedRuleCount = 0;
    let removedSelectorCount = 0;

    const nextHtml = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (full, openTag, cssText, closeTag) => {
      styleBlockCount += 1;
      const result = pruneUnusedCssClasses(cssText, html, {
        ...options,
        usedClassNames
      });
      removedRuleCount += result.removedRuleCount;
      removedSelectorCount += result.removedSelectorCount;
      return `${openTag}${result.css}${closeTag}`;
    });

    return {
      html: nextHtml,
      styleBlockCount,
      removedRuleCount,
      removedSelectorCount,
      usedClassNames,
      usedClassCount: usedClassNames.size
    };
  }

  return {
    DEFAULT_SCOPE,
    collectSelectorClasses,
    extractHtmlClassNames,
    pruneInlineStyleTags,
    pruneUnusedCssClasses,
    scopeCss,
    scopeSelectorList
  };
});
