(function(root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  if (root) root.productPublishingInputRules = rules;
})(typeof window !== "undefined" ? window : globalThis, function() {
  function hasCombinedPublishingSheets(sheetNames) {
    const names = (sheetNames || []).map((name) => String(name || "").trim().toLowerCase());
    return names.includes("datasheet")
      && names.some((name) => /^(spec|specification)s?$/.test(name));
  }

  function productNameFromCombinedWorkbook(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "")
      .replace(/(?:网站翻译表|website\s*translation(?:\s*table)?|translation\s*table)/ig, " ")
      .replace(/[\s_-]+website$/i, "")
      .replace(/[\s_-]+$/g, "").trim();
  }

  return { hasCombinedPublishingSheets, productNameFromCombinedWorkbook };
});
