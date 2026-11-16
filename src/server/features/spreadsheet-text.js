function singleLineCellText(value) {
  const text = String(value == null ? "" : value);
  if (!/[\r\n\u2028\u2029]|_x000d_/i.test(text)) return text;
  return text
    .replace(/[ \t]*(?:(?:\r\n|[\r\n\u2028\u2029]|_x000d_)[ \t]*)+/gi, " ")
    .trim();
}

module.exports = { singleLineCellText };
