(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.i18nConversionRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SUPERSCRIPT_OR_SUBSCRIPT = /^[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+$/u;
  const PUNCTUATION_ONLY = /^[\p{P}\p{S}\s]+$/u;
  const NUMBER_ONLY = /^[+\-]?\d+(?:[.,]\d+)?$/u;
  const AES_OR_TLS = /^(?:AES|TLS)(?:[\s-]?\d+(?:\.\d+)?)?$/iu;
  const DEGREE_VALUE = /^[+\-]?\d+(?:[.,]\d+)?\s*(?:°|℃|℉|degrees?|度)(?:\s*[CF])?$/iu;
  const MEASUREMENT_VALUE = /^[+\-]?\d+(?:[.,]\d+)?\s*(?:mm|cm|km|m|µm|μm|nm|in|inch|inches|ft|g|kg|mg|lb|lbs|oz|ml|l|v|kv|mv|a|ma|w|kw|mw|hz|khz|mhz|ghz|db|dbm|s|ms|h|fps|kbps|mbps|gbps|kb|mb|gb|tb|%)$/iu;

  function normalize(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function trimOuterPunctuation(value) {
    return normalize(value)
      .replace(/^[\p{P}\p{S}\s]+/u, '')
      .replace(/[\p{P}\p{S}\s]+$/u, '')
      .trim();
  }

  function isProductName(value, productName) {
    const expected = normalize(productName);
    if (!expected) return false;
    return trimOuterPunctuation(value).localeCompare(expected, undefined, { sensitivity: 'accent' }) === 0;
  }

  function isNonTranslatableText(value, productName) {
    const text = normalize(value);
    if (!text) return true;
    const unwrapped = text
      .replace(/^[\s(\[{'“‘]+/u, '')
      .replace(/[\s)\]}'”’.,;:!?，。；：！？]+$/u, '')
      .trim();
    return PUNCTUATION_ONLY.test(text)
      || SUPERSCRIPT_OR_SUBSCRIPT.test(unwrapped)
      || NUMBER_ONLY.test(unwrapped)
      || AES_OR_TLS.test(unwrapped)
      || DEGREE_VALUE.test(unwrapped)
      || MEASUREMENT_VALUE.test(unwrapped)
      || isProductName(text, productName);
  }

  function extractTranslatableText(value, productName) {
    const text = String(value || '').trim();
    if (!text || isNonTranslatableText(text, productName)) return '';

    const withoutEndingPunctuation = text
      .replace(/[)\]}'”’.,;:!?，。；：！？]+$/u, '')
      .trimEnd();
    let target = withoutEndingPunctuation;
    const suffixStarts = [];
    const whitespace = /\s+/gu;
    let match;
    while ((match = whitespace.exec(withoutEndingPunctuation))) {
      suffixStarts.push(match.index + match[0].length);
    }

    for (const start of suffixStarts) {
      const suffix = withoutEndingPunctuation.slice(start);
      if (isNonTranslatableText(suffix, productName)) {
        target = withoutEndingPunctuation.slice(0, start).trimEnd();
        break;
      }
    }

    return target.replace(/[\s,，;；:：]+$/u, '').trimEnd();
  }

  return { isNonTranslatableText, extractTranslatableText };
});
