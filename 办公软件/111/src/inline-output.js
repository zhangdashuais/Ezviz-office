(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EzvizInlineOutput = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const marker = "<!-- product detail webflow -->";

  function wrap(content, headContent, options = {}) {
    const bodyContent = `${marker}\n${content}`;
    const body = options.includeBody ? `<body>\n${bodyContent}\n</body>` : bodyContent;
    const head = options.includeHead ? `<head>\n${headContent}\n</head>` : "";
    return [head, body].filter(Boolean).join("\n");
  }

  return { wrap };
});
