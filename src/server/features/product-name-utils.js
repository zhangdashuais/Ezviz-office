function normalizeProductNameForMatch(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u207a＋]/g, "+")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function productNameSearchVariants(value) {
  const raw = String(value || "").trim();
  const plus = raw.normalize("NFKC").replace(/[\u207a＋]/g, "+");
  const superscript = plus.replace(/\+/g, "\u207a");
  return [...new Set([raw, plus, superscript].filter(Boolean))];
}

function parseProductNames(value) {
  const source = Array.isArray(value) ? value : [value];
  const names = source
    .flatMap((item) => String(item || "").split(/[\r\n,，;；]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = normalizeProductNameForMatch(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  normalizeProductNameForMatch,
  productNameSearchVariants,
  parseProductNames
};
