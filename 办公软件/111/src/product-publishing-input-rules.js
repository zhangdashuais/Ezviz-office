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

  function publishingSheetName(sheetNames, kind) {
    const pattern = kind === "datasheet" ? /^datasheet$/i : /^(spec|specification)s?$/i;
    return (sheetNames || []).find((name) => pattern.test(String(name || "").trim()))
      || (sheetNames || [])[0];
  }

  function readyPublishingHeaders(headers, statuses) {
    const values = Array.from(headers || []);
    const state = Array.from(statuses || [], (value) => String(value || "").trim());
    return state.some((value) => /^ok$/i.test(value))
      ? values.filter((_header, index) => /^ok$/i.test(state[index] || ""))
      : values;
  }

  function productNameFromCombinedWorkbook(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "")
      .replace(/(?:网站翻译表|website\s*translation(?:\s*table)?|translation\s*table)/ig, " ")
      .replace(/[\s_-]+website$/i, "")
      .replace(/[\s_-]+$/g, "").trim();
  }

  function isOfficeTemporaryWorkbook(fileName) {
    const name = String(fileName || "").split(/[\\/]/).pop() || "";
    return name.startsWith("~$");
  }

  function publishingWorkbookInfo(fileName) {
    const name = String(fileName || "").split(/[\\/]/).pop() || "";
    if (isOfficeTemporaryWorkbook(name) || !/\.xlsx?$/i.test(name)) {
      return { kind: "", productName: "" };
    }
    const base = name.replace(/\.[^.]+$/, "");
    const marker = /datasheet/i.exec(base) || /spec(?:ification)?s?/i.exec(base);
    if (!marker) return { kind: "", productName: "" };
    return {
      kind: /^datasheet$/i.test(marker[0]) ? "datasheet" : "specification",
      productName: base.slice(0, marker.index).replace(/[\s_-]+$/g, "").trim()
    };
  }

  function publishingProductMatchKey(productName) {
    return (String(productName || "")
      .normalize("NFKC")
      .replace(/[\u207a＋]/g, "+")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+|\+/gu) || [])
      .sort()
      .join(" ");
  }

  return {
    hasCombinedPublishingSheets,
    publishingSheetName,
    readyPublishingHeaders,
    productNameFromCombinedWorkbook,
    isOfficeTemporaryWorkbook,
    publishingWorkbookInfo,
    publishingProductMatchKey
  };
});
