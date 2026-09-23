(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EzvizInlineOutput = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const marker = "<!-- product detail webflow -->";

  function findBlockEnd(css, openIndex) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    for (let index = openIndex + 1; index < css.length; index += 1) {
      const char = css[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
      } else if (char === "\"" || char === "'") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) return index;
    }
    return css.length;
  }

  function classRuleSignatures(css) {
    const signatures = new Map();
    const add = (name, value) => {
      if (!signatures.has(name)) signatures.set(name, new Set());
      signatures.get(name).add(value);
    };
    const walk = (text, context = "") => {
      for (let cursor = 0; cursor < text.length;) {
        const open = text.indexOf("{", cursor);
        if (open === -1) break;
        const prelude = text.slice(cursor, open).trim();
        const close = findBlockEnd(text, open);
        const body = text.slice(open + 1, close);
        cursor = close + 1;
        if (!prelude) continue;
        if (prelude.startsWith("@")) {
          if (/^@(media|supports|container|layer|document|scope|starting-style)\b/i.test(prelude)) {
            walk(body, `${context}@${prelude.replace(/\s+/g, " ")}{`);
          }
          continue;
        }
        const declaration = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
        prelude.split(",").forEach((selector) => {
          const classes = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);
          classes.forEach((name) => {
            const canonicalSelector = selector.trim().replace(new RegExp(`\\.${name.replace(/[.*+?^${}()|[\]\\\\]/g, "\\\\$&")}(?![\\w-])`, "g"), ".__NUMBERED_CLASS__");
            add(name, `${context}${canonicalSelector}{${declaration}}`);
          });
        });
      }
    };
    walk(String(css || ""));
    return signatures;
  }

  function sameSignatures(first, second) {
    return first?.size > 0 && first.size === second?.size && [...first].every((item) => second.has(item));
  }

  function normalizeNumberedClasses(html, css) {
    const classNames = new Set();
    String(html || "").replace(/\bclass\s*=\s*(["'])(.*?)\1/gi, (_, quote, value) => {
      value.split(/\s+/).filter(Boolean).forEach((name) => classNames.add(name));
      return _;
    });
    const signatures = classRuleSignatures(css);
    signatures.forEach((_, name) => classNames.add(name));

    const families = new Map();
    classNames.forEach((name) => {
      const match = name.match(/^(.+)-(\d+)$/);
      if (!match || name.startsWith("w-")) return;
      const variants = families.get(match[1]) || [];
      variants.push(name);
      families.set(match[1], variants);
    });

    const replacements = new Map();
    families.forEach((variants, base) => {
      const candidates = classNames.has(base) ? [base, ...variants] : variants;
      if (candidates.length < 2 || !candidates.every((name) => sameSignatures(signatures.get(candidates[0]), signatures.get(name)))) return;
      variants.forEach((name) => replacements.set(name, base));
    });

    const normalizedHtml = String(html || "").replace(/\bclass\s*=\s*(["'])(.*?)\1/gi, (full, quote, value) => {
      const names = [...new Set(value.split(/\s+/).filter(Boolean).map((name) => replacements.get(name) || name))];
      return `class=${quote}${names.join(" ")}${quote}`;
    });
    const normalizedCss = String(css || "").replace(/\.(-?[_a-zA-Z][\w-]*)/g, (full, name) => `.${replacements.get(name) || name}`);

    return { html: normalizedHtml, css: normalizedCss, replacements: Object.fromEntries(replacements) };
  }

  function wrap(content, headContent, options = {}) {
    const bodyContent = `${marker}\n${content}`;
    const body = options.includeBody ? `<body>\n${bodyContent}\n</body>` : bodyContent;
    const head = options.includeHead ? `<head>\n${headContent}\n</head>` : "";
    return [head, body].filter(Boolean).join("\n");
  }

  return { normalizeNumberedClasses, wrap };
});
