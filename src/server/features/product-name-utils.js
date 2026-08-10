function parseProductNames(value) {
  const source = Array.isArray(value) ? value : [value];
  const names = source
    .flatMap((item) => String(item || "").split(/[\r\n,，;；]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { parseProductNames };
