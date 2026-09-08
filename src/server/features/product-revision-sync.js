const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const {
  parseLanguageDatasheet,
  resolveDatasheetLanguage,
  readLanguagePackage,
  planLanguagePackageUpdates,
  assertSafePlan,
  writeUpdatedLanguagePackage
} = require("./language-package-workbook");
const { parseProductNames } = require("./product-replacement");

const SITE_LANGUAGE_NEEDLES = {
  hq: ["english"],
  us: ["english"],
  uk: ["english"],
  eu: ["english"],
  ca: ["english"],
  au: ["english"],
  in: ["english"],
  my: ["english"],
  af: ["english"],
  cis: ["russian", "русский"],
  de: ["german", "deutsch"],
  fr: ["france", "french", "français"],
  be: ["france", "french", "français"],
  it: ["italian", "italiano"],
  es: ["spanish-", "español"],
  pl: ["polish", "polski"],
  cz: ["czech", "český"],
  nl: ["dutch", "nederlands"],
  tr: ["turkish", "türkçe"],
  ro: ["romanian", "român"],
  th: ["thai", "ภาษาไทย"],
  vn: ["vietnamese", "tiếng việt"],
  jp: ["japanese", "日本語"],
  kr: ["korean", "한국어"],
  id: ["indonesian", "indonesia"],
  br: ["brazilian portuguese", "português - brazil"],
  la: ["spanish(latin)", "latinoamérica"],
  arg: ["spanish(latin)", "latinoamérica"],
  ar: ["arabic", "العربية"],
  sa: ["arabic", "العربية"],
  cn: ["繁体中文", "chinese"]
};

const SITE_SPECIFICATION_TITLES = {
  hq: "Specifications", us: "Specifications", ca: "Specifications", in: "Specifications",
  au: "Specifications", my: "Specifications", uk: "Specifications", eu: "Specifications",
  af: "Specifications",
  la: "Especificaciones", arg: "Especificaciones", es: "Especificaciones",
  br: "Especificações",
  th: "ข้อมูลจำเพาะ",
  id: "Spesifikasi",
  vn: "Thông số kỹ thuật",
  jp: "仕様",
  kr: "사양",
  cn: "规格参数",
  cis: "Технические характеристики",
  de: "Spezifikationen",
  fr: "Spécifications", be: "Specificaties",
  it: "Specifiche",
  pl: "Specyfikacja",
  cz: "Specifikace",
  nl: "Specificaties",
  tr: "Teknik Özellikler",
  ro: "Specificații",
  ar: "المواصفات", sa: "المواصفات"
};

const SITE_SPECIFICATION_FIELD_TITLES = {
  ...SITE_SPECIFICATION_TITLES,
  de: "Technische Daten",
  th: "รายละเอียด",
  cz: "Technické údaje"
};

const WIFI6_HALOW_PATTERN = /Wi-Fi\s*6\s*:\s*IEEE(?:\s|&nbsp;)+802\s*\.\s*11b\s*\/\s*g\s*\/\s*a\s*\/\s*n\s*\/\s*ac\s*\/\s*ax(?:\s|&nbsp;)+Wi-Fi(?:\s|&nbsp;)+HaLow\s*:\s*IEEE(?:\s|&nbsp;)+802\s*\.\s*11ah/gi;
const WIFI6_HALOW_REPLACEMENT = "Wi-Fi : IEEE 802.11b/g/a/n/ac Wi-Fi HaLow: IEEE 802.11ah";
const WIFI6_AX_PATTERN = /802\s*\.\s*11ax\b/gi;

function specificationTitleForSite(siteCode, fallback = "Specifications") {
  return SITE_SPECIFICATION_TITLES[normalize(siteCode).toLowerCase()]
    || normalize(fallback)
    || "Specifications";
}

function specificationFieldTitleForSite(siteCode, fallback = "Specifications") {
  return SITE_SPECIFICATION_FIELD_TITLES[normalize(siteCode).toLowerCase()]
    || normalize(fallback)
    || "Specifications";
}

const SPECIFICATION_DETAIL_FIELD_NAMES = [
  "specifications",
  "specification",
  "specs",
  "especificaciones",
  "especificación",
  "especificaiones",
  "especificacao",
  "especificação",
  "especifica",
  "spezifikation",
  "spécification",
  "caractéristiques",
  "caracteristiques",
  "özellikler",
  "ozellikler",
  "specyfikacje",
  "specificații",
  "specificatii",
  "presupuesto",
  "รายละเอียด",
  "สเปค",
  "\u4ed5\u69d8"
];

const MAX_FRAME_RATE_SOURCE = String.raw`(?:\bM[aá]x(?:imum|imo)?\.?|\bMaks(?:imum|ymalnie)?\.?|\bTối\s*đa|Макс(?:имум)?\.?|最大|สูงสุด|최대)\s*[.:：]?\s*\d+(?:\.\d+)?\s*fps\b`;
const MAX_FRAME_RATE_PATTERN = new RegExp(MAX_FRAME_RATE_SOURCE, "i");
const MAX_FRAME_RATE_DELETE_PATTERN = new RegExp(`${MAX_FRAME_RATE_SOURCE}\\s*[;；]?\\s*`, "gi");

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJapanPublishingProductName(value) {
  return normalize(value)
    .replace(/(^|[^A-Za-z0-9])2\s*K\s*\+(?=$|[^A-Za-z0-9])/gi, (_, lead) => `${lead}4MP`)
    .replace(/(^|[^A-Za-z0-9])1080\s*P(?=$|[^A-Za-z0-9])/gi, (_, lead) => `${lead}2MP`)
    .replace(/(^|[^A-Za-z0-9])2\s*K(?=$|[^A-Za-z0-9])/gi, (_, lead) => `${lead}3MP`)
    .replace(/(^|[^A-Za-z0-9])3\s*K(?=$|[^A-Za-z0-9])/gi, (_, lead) => `${lead}5MP`);
}

function publishingProductNameForSite(productName, siteCode) {
  return normalize(siteCode).toLowerCase() === "jp"
    ? normalizeJapanPublishingProductName(productName)
    : normalize(productName);
}

function fillAdsAdditionalProductTitle(model, productName, overwrite = false) {
  const clean = (item) => String(item == null ? "" : item)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const value = clean(productName);
  if (!value || !model || typeof model !== "object") return false;
  const seen = new Set();
  let changed = false;
  function visit(target) {
    if (!target || typeof target !== "object" || seen.has(target)) return;
    seen.add(target);
    Object.keys(target).forEach((key) => {
      if (key.toLowerCase().replace(/[\s_-]+/g, "") === "producttitle"
        && (overwrite || !clean(target[key]))) {
        target[key] = value;
        changed = true;
      } else {
        visit(target[key]);
      }
    });
  }
  visit(model);
  return changed;
}

function normalizeDetailFieldName(value) {
  return normalize(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function specificationDetailFieldNames() {
  return [
    ...SPECIFICATION_DETAIL_FIELD_NAMES.map(normalizeDetailFieldName),
    ...Object.values(SITE_SPECIFICATION_TITLES).map(normalizeDetailFieldName),
    ...Object.values(SITE_SPECIFICATION_FIELD_TITLES).map(normalizeDetailFieldName)
  ];
}

function findSpecificationDetailField(customFields) {
  const fields = Array.isArray(customFields) ? customFields : [];
  const knownNames = specificationDetailFieldNames();
  for (const fieldName of knownNames) {
    const field = fields.find(
      (item) => normalizeDetailFieldName(item?.name) === fieldName
    );
    if (field) return field;
  }
  const frameRateFields = fields.filter((item) => MAX_FRAME_RATE_PATTERN.test(String(item?.value || "")));
  if (frameRateFields.length === 1) return frameRateFields[0];
  return null;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function readTagAttribute(tag, name) {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const match = String(tag || "").match(pattern);
  return decodeHtmlAttribute(match ? (match[1] ?? match[2] ?? match[3] ?? "") : "");
}

function extractSpecificationImage(html) {
  const tags = String(html || "").match(/<img\b[^>]*>/gi) || [];
  if (!tags.length) {
    throw new Error("国际站 Specification 中没有找到图片，无法自动继承图片地址和 alt。");
  }
  const imageAddress = (tag) => {
    const srcset = readTagAttribute(tag, "srcset").trim();
    return ["src", "data-src", "data-original", "data-lazy-src"]
      .map((attribute) => readTagAttribute(tag, attribute).trim())
      .find(Boolean)
      || normalize(srcset.split(",")[0]?.trim().split(/\s+/)[0]);
  };
  const preferred = tags.find((tag) =>
    /(?:^|\s)pro-img__src(?:\s|$)/i.test(readTagAttribute(tag, "class"))
    && imageAddress(tag)
  ) || tags.find((tag) => imageAddress(tag)) || tags.find((tag) =>
    /(?:^|\s)pro-img__src(?:\s|$)/i.test(readTagAttribute(tag, "class"))
  ) || tags[0];
  const src = imageAddress(preferred);
  const alt = readTagAttribute(preferred, "alt");
  if (!src) {
    return { src: "", alt, emptyPlaceholder: true };
  }
  return { src, alt };
}

function hashValue(value) {
  return crypto.createHash("sha256").update(
    Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")
  ).digest("hex");
}

function getCellValue(sheet, row, column) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return "";
  return cell.w != null ? cell.w : cell.v;
}

function parseSpecificationWorkbook(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Specification Excel 中没有工作表。");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.["!ref"]) throw new Error("Specification Excel 的第一个工作表为空。");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const mergeMap = new Map();
  (sheet["!merges"] || []).forEach((merge) => {
    mergeMap.set(`${merge.s.r}:${merge.s.c}`, {
      cols: merge.e.c - merge.s.c + 1,
      rows: merge.e.r - merge.s.r + 1
    });
  });

  const languages = [];
  for (let startColumn = range.s.c; startColumn <= range.e.c; startColumn += 2) {
    const header = normalize(
      getCellValue(sheet, range.s.r, startColumn)
      || getCellValue(sheet, range.s.r, startColumn + 1)
    );
    if (!header) continue;
    const rows = [];
    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const items = [];
      for (let column = startColumn; column <= Math.min(startColumn + 1, range.e.c); column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = sheet[address];
        if (!cell) continue;
        items.push({
          name: `${column === startColumn ? "A" : "B"}${row + 1}`,
          value: cell.w != null ? cell.w : cell.v,
          unitMerge: mergeMap.get(`${row}:${column}`) || { cols: 1, rows: 1 }
        });
      }
      if (items.length) rows[row - range.s.r - 1] = items;
    }
    const firstValue = rows.flat().find((item) => normalize(item?.value));
    languages.push({
      header,
      index: languages.length,
      title: normalize(firstValue?.value) || "Specifications",
      rows
    });
  }
  if (!languages.length) {
    throw new Error("Specification Excel 中没有识别到语言列；每种语言应占相邻两列。");
  }
  return {
    sheetName,
    fingerprint: hashValue(buffer),
    languages
  };
}

function resolveWorkbookLanguage(parsedWorkbook, target) {
  const requestedHeader = normalize(target?.localeHeader).toLowerCase();
  if (requestedHeader) {
    const exact = parsedWorkbook.languages.find(
      (language) => language.header.toLowerCase() === requestedHeader
    );
    if (!exact) {
      throw new Error(
        `${target.siteCode} 指定的 Excel 语言列不存在：${target.localeHeader}`
      );
    }
    return exact;
  }
  const needles = SITE_LANGUAGE_NEEDLES[target.siteCode] || [target.siteCode];
  const matches = parsedWorkbook.languages.filter((language) => {
    const header = language.header.toLowerCase();
    return needles.some((needle) => header.includes(String(needle).toLowerCase()));
  });
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `${target.siteCode} 自动匹配到多个 Excel 语言列，请在页面中手工选择。`
        : `${target.siteCode} 没有自动匹配到 Excel 语言列，请在页面中手工选择。`
    );
  }
  return matches[0];
}

function buildPcSpecificationHtml(language, image, titleOverride) {
  const rows = language.rows
    .filter(Boolean)
    .map((items, index) => {
      const rowClass = items.length > 1 ? "lines" : "line";
      const cells = items.map((item, key) => {
        const value = escapeHtml(item.value);
        const colspan = Number(item.unitMerge?.cols || 1);
        const rowspan = Number(item.unitMerge?.rows || 1);
        if (String(item.name).startsWith("A")) {
          if (colspan > 1) {
            return `<th class="title" colspan="${colspan}" rowspan="${rowspan}">${value}</th>`;
          }
          return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}" width="200">${value}</td>`;
        }
        if (index === 0 && key === 1 && items.length > 2) {
          return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}" width="160">${value}</td>`;
        }
        if (language.rows[0]?.length > 3 && index === 0) {
          const width = parseInt(660 / (language.rows[0].length - 2) * colspan, 10);
          return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}" width="${width}">${value}</td>`;
        }
        return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}">${value}</td>`;
      }).join("");
      return `<tr class="${rowClass}">${cells}</tr>`;
    })
    .join("\n");

  const imageMarkup = image?.src ? [
    '    <div class="pro-img">',
    `      <img class="pro-img__src" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}">`,
    "    </div>"
  ] : [];
  return [
    '<div class="pc-content">',
    '  <div class="p960">',
    ...imageMarkup,
    `    <div class="pro-title">${escapeHtml(titleOverride || language.title || "Specifications")}</div>`,
    '    <table class="pro_infobox">',
    "      <tbody>",
    rows,
    "      </tbody>",
    "    </table>",
    "  </div>",
    "</div>",
    "<style> td{word-break: normal !important}</style>"
  ].join("\n");
}

function parseTargets(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = parsed.split(",").map((siteCode) => ({ siteCode: siteCode.trim() }));
    }
  }
  if (!Array.isArray(parsed)) throw new Error("目标站点格式不正确。");
  const seen = new Set();
  return parsed.map((item) => {
    const siteCode = normalize(typeof item === "string" ? item : item?.siteCode).toLowerCase();
    const localeHeader = normalize(typeof item === "string" ? "" : item?.localeHeader);
    const languagePackageHeader = normalize(
      typeof item === "string" ? "" : item?.languagePackageHeader
    );
    if (!siteCode) throw new Error("目标站点中存在空站点代码。");
    if (seen.has(siteCode)) throw new Error(`目标站点重复：${siteCode}。`);
    seen.add(siteCode);
    return { siteCode, localeHeader, languagePackageHeader };
  });
}

function validateRevisionRequest(body, allSites, options = {}) {
  const productName = normalize(body?.productName);
  const ignoreSourceSite = options.ignoreSourceSite === true;
  const sourceSiteCode = ignoreSourceSite
    ? ""
    : normalize(body?.sourceSiteCode || "hq").toLowerCase();
  const targets = parseTargets(body?.targetsJson ?? body?.targets ?? body?.targetSites);
  if (!productName) throw new Error("请填写产品名称。");
  if (!targets.length) throw new Error("请至少选择一个目标站点。");
  if (targets.length > 50) throw new Error("一次最多同步 50 个目标站点。");
  const byCode = new Map(allSites.map((site) => [site.siteCode, site]));
  const sourceSite = ignoreSourceSite ? null : byCode.get(sourceSiteCode);
  if (!ignoreSourceSite && !sourceSite) throw new Error(`没有找到源站点：${sourceSiteCode}。`);
  const resolvedTargets = targets.map((target) => {
    if (!ignoreSourceSite && target.siteCode === sourceSiteCode) {
      throw new Error("目标站点不能与源站点相同。");
    }
    const site = byCode.get(target.siteCode);
    if (!site) throw new Error(`没有找到目标站点：${target.siteCode}。`);
    return { ...target, site };
  });
  return { productName, sourceSite, targets: resolvedTargets };
}

function readDetailFromPcView(pcView) {
  const customFields = pcView?.customs || [];
  const specificationsField = findSpecificationDetailField(customFields);
  return {
    overview: String(pcView?.summary || ""),
    specifications: String(specificationsField?.value || ""),
    specificationsFound: Boolean(specificationsField),
    specificationsFieldName: String(specificationsField?.name || "")
  };
}

function productSnapshotStabilitySignature(snapshot) {
  return hashValue(JSON.stringify({
    goodsId: String(snapshot?.goodsId || ""),
    overview: String(snapshot?.pcView?.summary || ""),
    customs: (snapshot?.pcView?.customs || []).map((field) => ({
      name: String(field?.name || ""),
      value: String(field?.value || "")
    })),
    productDescription: String(snapshot?.basic?.summary || ""),
    isSearchable: Boolean(snapshot?.basic?.isSearchable),
    whenType: Number(snapshot?.basic?.whenType ?? 0)
  }));
}

async function retryProductReadback(read, verify, options = {}) {
  const attempts = options.attempts || 6;
  const wait = options.wait || (() => Promise.resolve());
  let snapshot;
  let verification;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    snapshot = await read();
    verification = verify(snapshot);
    if (verification.passed) return { snapshot, verification, attempt };
    if (attempt < attempts) {
      options.onRetry?.(attempt, verification);
      await wait(options.delayMs || 3000);
    }
  }
  return { snapshot, verification, attempt: attempts };
}

function revisionPreviewStatus({
  publishing,
  copyRequired = publishing,
  detailChanged,
  specificationChanged,
  descriptionChanged,
  languagePackageChanged,
  productNameChanged = false
}) {
  return copyRequired || detailChanged || specificationChanged
    || descriptionChanged || languagePackageChanged || productNameChanged
    ? "ready"
    : "no-change";
}

function isSpecificationLanguageOnly(body) {
  return normalize(body?.updateScope).toLowerCase() === "specification-language";
}

function effectiveProductDescriptionForScope(specificationLanguageOnly, currentDescription, desiredProductDescription) {
  return specificationLanguageOnly && desiredProductDescription?.inherited
    ? currentDescription
    : desiredProductDescription.description;
}

function normalizeInternationalImageUrl(value) {
  const imageUrl = normalize(value);
  return imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl;
}

function internationalListSource(productName, copySource) {
  const image = {
    src: normalizeInternationalImageUrl(copySource?.imageUrl),
    alt: normalize(productName)
  };
  const snapshot = {
    goodsId: normalize(copySource?.goodsId),
    editUrl: "",
    detail: {
      overview: "",
      specifications: "",
      specificationsFound: false,
      specificationsFieldName: ""
    },
    productDescription: normalize(copySource?.brief)
  };
  const fingerprint = hashValue(JSON.stringify({
    productName: normalize(productName),
    goodsId: snapshot.goodsId,
    brief: snapshot.productDescription,
    imageUrl: image.src
  }));
  return { snapshot, image, fingerprint };
}

function normalizeDatasheetKey(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function resolveProductDescription(parsedDatasheet, target, options = {}) {
  const tolerant = options.tolerant === true
    && Object.prototype.hasOwnProperty.call(options, "fallbackDescription");
  const fallback = (message, translationHeader = "") => ({
    description: normalize(options.fallbackDescription),
    translationHeader: translationHeader || "国际产品复制源",
    key: "",
    rowNumber: 0,
    inherited: true,
    warning: message
  });
  let translationHeader;
  try {
    translationHeader = resolveDatasheetLanguage(
      parsedDatasheet,
      target,
      SITE_LANGUAGE_NEEDLES
    );
  } catch (error) {
    if (tolerant) return fallback(error?.message || String(error));
    throw error;
  }
  const acceptedKeys = new Set([
    "productdescription",
    "description",
    "productsummary",
    "summary",
    "产品描述"
  ]);
  const candidates = parsedDatasheet.rows.filter((row) =>
    acceptedKeys.has(normalizeDatasheetKey(row.key))
  );
  if (!candidates.length && normalize(options.currentDescription)) {
    const currentDescription = normalize(options.currentDescription);
    const currentMatches = parsedDatasheet.rows.filter((row) =>
      normalize(row.source) === currentDescription
      || Object.values(row.translations || {}).some((value) =>
        normalize(value) === currentDescription)
    );
    if (currentMatches.length === 1) {
      const description = normalize(currentMatches[0].translations[translationHeader]);
      if (!description) {
        if (tolerant) {
          return fallback(`${translationHeader} 的 Product Description 译文为空，已保留复制源文案。`, translationHeader);
        }
        throw new Error(`${translationHeader} 的 Product Description 译文为空。`);
      }
      return {
        description,
        translationHeader,
        key: currentMatches[0].key,
        rowNumber: currentMatches[0].rowNumber,
        inferredFromCurrentDescription: true
      };
    }
  }
  if (!candidates.length && Object.prototype.hasOwnProperty.call(options, "fallbackDescription")) {
    return {
      description: normalize(options.fallbackDescription),
      translationHeader: "国际产品复制源",
      key: "",
      rowNumber: 0,
      inherited: true
    };
  }
  if (candidates.length !== 1) {
    if (tolerant) {
      return fallback(
        candidates.length
          ? "Datasheet 中存在多个 Product Description 字段，已保留复制源文案。"
          : "Datasheet 中缺少 Product Description 字段，已保留复制源文案。",
        translationHeader
      );
    }
    throw new Error(
      candidates.length
        ? "Datasheet 中存在多个 Product Description 字段，请只保留一个。"
        : "Datasheet 中缺少 Product Description 字段。"
    );
  }
  const description = normalize(candidates[0].translations[translationHeader]);
  if (!description) {
    if (tolerant) {
      return fallback(`${translationHeader} 的 Product Description 译文为空，已保留复制源文案。`, translationHeader);
    }
    throw new Error(`${translationHeader} 的 Product Description 译文为空。`);
  }
  return {
    description,
    translationHeader,
    key: candidates[0].key,
    rowNumber: candidates[0].rowNumber
  };
}

function validateDirectRevision(body) {
  const productName = String(body?.productName || "").trim();
  const siteCode = String(body?.siteCode || "").trim();
  const revisionType = body?.revisionType === "specification" ? "specification" : "detail";
  const detailHtml = String(body?.detailHtml ?? "");
  const productDescriptionProvided = Object.prototype.hasOwnProperty.call(body || {}, "productDescription");
  const productDescription = String(body?.productDescription ?? "");
  const specificationFieldNameProvided = Object.prototype.hasOwnProperty.call(body || {}, "specificationFieldName");
  const specificationFieldName = normalize(body?.specificationFieldName);
  if (specificationFieldNameProvided && !specificationFieldName) {
    throw new Error("请填写 Specification 自定义字段名称。");
  }
  let operations = revisionType === "detail"
    ? body?.detailOperations || []
    : body?.specificationOperations || [];
  if (typeof operations === "string") {
    try { operations = JSON.parse(operations); } catch { throw new Error(`${revisionType === "detail" ? "Detail" : "Specification"} 操作必须是有效 JSON。`); }
  }
  if (!siteCode) throw new Error("请选择国家站点。");
  if (!productName) throw new Error("请填写产品名称。");
  if (!Array.isArray(operations)) throw new Error("修订操作格式不正确。");
  if (revisionType === "detail" && !detailHtml.trim()
    && !operations.length && !productDescriptionProvided && !specificationFieldNameProvided) {
    throw new Error("请填写替换后的 Detail 代码、Product Description、Specification 字段名称，或至少填写一条 Detail 局部操作。");
  }
  if (revisionType === "specification" && !operations.length
    && !productDescriptionProvided && !specificationFieldNameProvided) {
    throw new Error("请至少填写一条 Specification 操作、Product Description 或 Specification 字段名称。");
  }
  const fieldLabel = revisionType === "detail" ? "Detail" : "Specification";
  operations = operations.map((item, index) => {
    const type = item?.type === "delete-frame-rate"
      ? "delete-frame-rate"
      : item?.type === "sanitize-wifi6" ? "sanitize-wifi6"
      : item?.type === "delete" ? "delete" : item?.type === "replace" ? "replace" : "";
    const targetText = String(item?.targetText ?? "");
    const replacementText = type === "replace" ? String(item?.replacementText ?? "") : "";
    if (!type) throw new Error(`第 ${index + 1} 条 ${fieldLabel} 操作类型无效。`);
    if ((type === "delete-frame-rate" || type === "sanitize-wifi6") && revisionType !== "specification") {
      throw new Error("该操作只允许用于 Specification。");
    }
    if (type !== "delete-frame-rate" && type !== "sanitize-wifi6" && !targetText) {
      throw new Error(`第 ${index + 1} 条 ${fieldLabel} 操作缺少目标内容。`);
    }
    if (type === "replace" && !replacementText) throw new Error(`第 ${index + 1} 条 ${fieldLabel} 替换操作缺少替换内容。`);
    if (type === "replace" && targetText === replacementText) throw new Error(`第 ${index + 1} 条 ${fieldLabel} 新旧内容不能相同。`);
    return { type, targetText, replacementText };
  });
  return {
    siteCode,
    productName,
    revisionType,
    detailHtml,
    operations,
    productDescription,
    productDescriptionProvided,
    specificationFieldName,
    specificationFieldNameProvided
  };
}

function applyContentOperations(source, operations, fieldLabel = "Specification") {
  let value = source;
  const results = operations.map((operation) => {
    if (operation.type === "delete-frame-rate") {
      const matchCount = value.match(MAX_FRAME_RATE_DELETE_PATTERN)?.length || 0;
      if (!matchCount) throw new Error(`${fieldLabel} 中未找到目标内容，已停止操作。`);
      value = value.replace(MAX_FRAME_RATE_DELETE_PATTERN, "");
      return { ...operation, matchCount };
    }
    if (operation.type === "sanitize-wifi6") {
      const phraseMatchCount = value.match(WIFI6_HALOW_PATTERN)?.length || 0;
      value = value.replace(WIFI6_HALOW_PATTERN, WIFI6_HALOW_REPLACEMENT);
      const axMatchCount = value.match(WIFI6_AX_PATTERN)?.length || 0;
      value = value.replace(WIFI6_AX_PATTERN, "");
      return { ...operation, matchCount: phraseMatchCount + axMatchCount, phraseMatchCount, axMatchCount };
    }
    const matchCount = value.split(operation.targetText).length - 1;
    if (!matchCount) throw new Error(`${fieldLabel} 中未找到目标内容，已停止操作。`);
    value = value.split(operation.targetText).join(operation.replacementText);
    return { ...operation, matchCount };
  });
  return { value, results };
}

function applySpecificationOperations(source, operations) {
  return applyContentOperations(source, operations, "Specification");
}

function buildCommonRevisionTargets(body, availableSites) {
  const productNames = parseProductNames(body?.productNames ?? body?.productName);
  if (!productNames.length) throw new Error("请填写至少一个产品名称。");
  if (productNames.length > 50) throw new Error("一次最多修订 50 个产品。");
  const selectedSiteCodes = [...new Set((Array.isArray(body?.sites) ? body.sites : [body?.siteCode])
    .map((value) => normalize(value).toLowerCase()).filter(Boolean))];
  if (!selectedSiteCodes.length) throw new Error("请至少选择一个国家站点。");
  const sitesByCode = new Map(availableSites.filter((site) => site.enabled !== false)
    .map((site) => [normalize(site.siteCode).toLowerCase(), site]));
  const sites = selectedSiteCodes.map((siteCode) => sitesByCode.get(siteCode));
  if (sites.some((site) => !site)) throw new Error("所选国家站点不存在或未启用。");
  return {
    sites,
    productNames,
    targets: sites.flatMap((site) => productNames.map((productName) => ({ site, productName })))
  };
}

function isAutoSpecificationFieldName(body) {
  return body?.autoSpecificationFieldName === true || body?.autoSpecificationFieldName === "true";
}

function applyAutoSpecificationFieldName(body, siteCode) {
  if (!isAutoSpecificationFieldName(body)) return body;
  return {
    ...(body || {}),
    revisionType: "specification",
    specificationOperations: [],
    specificationFieldName: specificationFieldTitleForSite(siteCode)
  };
}

function createProductRevisionSyncFeature(deps) {
  const {
    logLine,
    readCampaignConfig,
    getCampaignSites,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductEditorByName,
    productExistsInCurrentSite,
    findInternationalProduct,
    copyInternationalProduct,
    languagePackageFeature
  } = deps;
  if (!languagePackageFeature?.downloadCurrentLanguagePackageForPage
    || !languagePackageFeature?.uploadLanguagePackageForPage) {
    throw new Error("产品修订同步缺少语言包下载/上传能力。");
  }

  async function prepareSiteSession(site, body, logs) {
    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(30000);
    page = await ensureShopLoggedIn(page, {
      ...(body || {}),
      sites: [site.siteCode],
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);
    const authenticatedIdentity = await page.evaluate(() =>
      document.querySelector("#username > a")?.textContent
      || document.querySelector(".clearfix.login-bar")?.innerText
      || document.querySelector(".login-bar")?.innerText
      || ""
    ).catch(() => "");
    if (!authenticatedIdentity.trim()) {
      throw new Error(`${site.name} 后台登录后未能读取当前用户身份。`);
    }
    logLine(
      logs,
      `已登录 ${site.name} (${site.siteCode})：${authenticatedIdentity.replace(/\s+/g, " ").trim()}`
    );
    return { page, authenticatedIdentity: authenticatedIdentity.replace(/\s+/g, " ").trim() };
  }

  async function readCurrentProductSnapshot(page, productName, logs, editInfo) {
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(
        scope?.goodsId
        && scope?.vm?.pcView
        && scope?.vm?.tabNav
        && typeof scope?.md?.toModel === "function"
      );
    }, null, { timeout: 30000 });
    await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      scope.vm.tabNav.moveTo(2);
      (scope.$root || scope).$applyAsync?.();
    });
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(scope?.vm?.pcView?.customs?.length);
    }, null, { timeout: 10000 }).catch(() => {});
    let snapshot = null;
    let previousSignature = "";
    let stableReadCount = 0;
    await page.waitForTimeout(800);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = await page.evaluate(() => {
        const scope = window.angular.element(document.querySelector("#replenish")).scope();
        return {
          goodsId: String(scope.goodsId),
          pcView: JSON.parse(JSON.stringify(scope.vm.pcView || {})),
          basic: JSON.parse(JSON.stringify(scope.vm.basic || {}))
        };
      });
      const signature = productSnapshotStabilitySignature(candidate);
      stableReadCount = signature === previousSignature ? stableReadCount + 1 : 1;
      previousSignature = signature;
      if (stableReadCount >= 3) {
        snapshot = candidate;
        break;
      }
      await page.waitForTimeout(400);
    }
    if (!snapshot) {
      throw new Error(`${productName} 的 Detail 异步加载后仍未稳定，请稍后重试。`);
    }
    const detail = readDetailFromPcView(snapshot.pcView);
    if (!detail.specificationsFound) {
      const availableFields = (snapshot.pcView?.customs || [])
        .map((field) => normalize(field?.name))
        .filter(Boolean);
      throw new Error(
        `${productName} 的 Detail 中没有找到 Specifications 字段。`
        + (availableFields.length ? `当前自定义字段：${availableFields.join("、")}。` : "当前没有自定义字段。")
      );
    }
    return {
      ...snapshot,
      editUrl: editInfo.editUrl,
      detail,
      productDescription: normalize(snapshot.basic?.summary),
      isSearchable: Boolean(snapshot.basic?.isSearchable),
      whenType: Number(snapshot.basic?.whenType ?? 0)
    };
  }

  async function readProductSnapshot(page, productName, logs) {
    const editInfo = await openProductEditorByName(page, productName, logs, { exactOnly: true });
    return readCurrentProductSnapshot(page, productName, logs, editInfo);
  }

  async function buildSavePayload(
    page,
    overview,
    specifications,
    productDescription,
    productTitle,
    currentProductTitle,
    specificationFieldName = "",
    nextSpecificationFieldName = ""
  ) {
    return page.evaluate(({
      overview,
      specifications,
      productDescription,
      productTitle,
      currentProductTitle,
      specificationFieldNames,
      specificationFieldName,
      nextSpecificationFieldName,
      fillAdsAdditionalProductTitleSource
    }) => {
      const normalizeField = (value) => String(value || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "");
      const fillAdsAdditionalProductTitle = new Function(`return (${fillAdsAdditionalProductTitleSource})`)();
      const setPath = (root, path, value) => {
        const parts = String(path || "").replace(/^vm\./, "").split(".").filter(Boolean);
        let current = root;
        for (let index = 0; index < parts.length - 1; index += 1) {
          current = current?.[parts[index]];
          if (!current || typeof current !== "object") return false;
        }
        const key = parts.at(-1);
        if (!key || String(current[key] || "").trim()) return false;
        current[key] = value;
        return true;
      };
      const renameProductFields = (model) => {
        if (!currentProductTitle || currentProductTitle === productTitle) return false;
        const clean = (value) => String(value == null ? "" : value).trim();
        const seen = new Set();
        let changed = false;
        const visit = (target) => {
          if (!target || typeof target !== "object" || seen.has(target)) return;
          seen.add(target);
          Object.keys(target).forEach((key) => {
            const normalizedKey = key.toLowerCase().replace(/[\s_-]+/g, "");
            if (["goodsname", "productname", "name"].includes(normalizedKey)
              && clean(target[key]) === currentProductTitle) {
              target[key] = productTitle;
              changed = true;
            } else {
              visit(target[key]);
            }
          });
        };
        visit(model);
        return changed;
      };
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const customFields = scope.vm.pcView?.customs || [];
      let field = customFields.find(
        (item) => String(item?.name || "") === specificationFieldName
      ) || null;
      for (const fieldName of specificationFieldNames) {
        if (field) break;
        field = customFields.find(
          (item) => normalizeField(item?.name) === fieldName
        );
        if (field) break;
      }
      if (!field) throw new Error("Detail 中没有找到 Specification/Specifications 字段。");
      scope.vm.pcView.summary = overview;
      if (nextSpecificationFieldName) field.name = nextSpecificationFieldName;
      field.value = specifications;
      scope.vm.basic.summary = productDescription;
      renameProductFields(scope.vm.basic);
      fillAdsAdditionalProductTitle(scope.vm, productTitle, currentProductTitle !== productTitle);
      [...document.querySelectorAll("input[ng-model], textarea[ng-model]")].forEach((input) => {
        const text = (input.closest(".form-group, .control-group, tr, .row, div")?.innerText || "")
          .replace(/\s+/g, " ")
          .trim();
        if (/Ads Additional Information/i.test(text)
          && /Product Title\s*:?/i.test(text)
          && (currentProductTitle !== productTitle || !String(input.value || "").trim())) {
          input.value = productTitle;
          setPath(scope.vm, input.getAttribute("ng-model"), productTitle);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      (scope.$root || scope).$applyAsync?.();
      const data = scope.md.toModel(scope.vm);
      renameProductFields(data);
      fillAdsAdditionalProductTitle(data, productTitle, currentProductTitle !== productTitle);
      data.goods_id = scope.goodsId;
      return data;
    }, {
      overview,
      specifications,
      productDescription,
      productTitle,
      currentProductTitle,
      specificationFieldNames: specificationDetailFieldNames(),
      specificationFieldName,
      nextSpecificationFieldName,
      fillAdsAdditionalProductTitleSource: fillAdsAdditionalProductTitle.toString()
    });
  }

  async function postProductUpdate(page, payload) {
    const requestUrl = "https://shop.ezvizlife.com/goods/do-edit-goods";
    const response = await page.request.post(requestUrl, {
      data: { data: payload },
      headers: { "x-requested-with": "XMLHttpRequest" },
      timeout: 60000
    });
    const text = await response.text().catch(() => "");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("产品保存接口返回的不是 JSON：" + text.slice(0, 200));
    }
    if (!response.ok() || Number(data?.status) !== 1) {
      throw new Error(
        data?.msg || data?.message || `产品保存接口返回异常（HTTP ${response.status()}）`
      );
    }
    return {
      requestUrl,
      responseStatus: response.status(),
      backendStatus: Number(data.status)
    };
  }

  async function readSource(request, body, logs) {
    logLine(logs, `读取源站产品：${request.sourceSite.name} / ${request.productName}`);
    const session = await prepareSiteSession(request.sourceSite, body, logs);
    const snapshot = await readProductSnapshot(session.page, request.productName, logs);
    const image = extractSpecificationImage(snapshot.detail.specifications);
    if (!image.src) {
      logLine(logs, "国际站 Specification 只有空图片占位，目标规格将保持无图片状态。");
    }
    const fingerprint = hashValue(JSON.stringify({
      productName: request.productName,
      goodsId: snapshot.goodsId,
      overview: snapshot.detail.overview,
      specifications: snapshot.detail.specifications,
      productDescription: snapshot.productDescription
    }));
    return {
      session,
      snapshot,
      image,
      fingerprint
    };
  }

  function buildTargetRevision(parsedWorkbook, parsedDatasheet, target, source, options = {}) {
    const language = resolveWorkbookLanguage(parsedWorkbook, target);
    const specificationTitle = specificationTitleForSite(target.siteCode, language.title);
    const specificationFieldTitle = specificationFieldTitleForSite(target.siteCode, specificationTitle);
    const specifications = buildPcSpecificationHtml(language, source.image, specificationTitle);
    const fallbackOptions = Object.prototype.hasOwnProperty.call(options, "fallbackDescription")
      ? { fallbackDescription: options.fallbackDescription }
      : options.allowSourceDescriptionFallback
        ? { fallbackDescription: source.snapshot.productDescription }
        : {};
    if (Object.prototype.hasOwnProperty.call(options, "currentDescription")) {
      fallbackOptions.currentDescription = options.currentDescription;
    }
    if (options.tolerant === true) fallbackOptions.tolerant = true;
    const productDescription = resolveProductDescription(parsedDatasheet, target, fallbackOptions);
    return { language: { ...language, title: specificationFieldTitle, htmlTitle: specificationTitle }, specifications, productDescription };
  }

  function summarizeLanguagePackagePlan(plan) {
    return {
      translationHeader: plan.translationHeader,
      safe: plan.safe,
      requestedCount: plan.requestedCount,
      matchedFieldCount: plan.matchedFieldCount,
      changedCellCount: plan.changedCellCount,
      unchangedCellCount: plan.unchangedCellCount,
      skippedBlankCount: plan.skippedBlankCount,
      missing: plan.missing.slice(0, 50),
      newFields: plan.newFields.slice(0, 50),
      appendedFieldCount: plan.newFields.length,
      sourceMismatches: plan.sourceMismatches.slice(0, 50),
      warnings: (plan.inputWarnings || []).slice(0, 50)
    };
  }

  function languagePackageReadbackWarnings(plan, productName = "") {
    return plan.updates.map((item) => {
      const location = `${item.sheetName}!${XLSX.utils.encode_cell({
        r: item.rowNumber - 1,
        c: item.targetColumn
      })}`;
      return {
        type: "language-package-readback",
        productName,
        language: plan.translationHeader,
        key: item.key,
        location,
        message: `${plan.translationHeader} ${location}（${item.key}）未更新`
      };
    });
  }

  function languagePackageInputWarnings(plan, productName = "") {
    return [
      ...(plan.inputWarnings || []).map((item) => ({ ...item, productName })),
      ...plan.sourceMismatches.map((item) => ({
        type: "language-package-source-mismatch",
        productName,
        language: plan.translationHeader,
        key: item.key,
        location: item.location,
        message: `${plan.translationHeader} ${item.location}（${item.key}）原文不一致，已按字段名更新`
      }))
    ];
  }

  async function verifySavedProduct(page, productName, logs, verify) {
    return retryProductReadback(
      () => readProductSnapshot(page, productName, logs),
      verify,
      {
        wait: (delayMs) => page.waitForTimeout(delayMs),
        onRetry: (attempt) => logLine(
          logs,
          `保存后第 ${attempt} 次回读仍是旧数据，等待后台同步后重试（不会重复保存）。`
        )
      }
    );
  }

  async function saveProductContentAndVerify({
    page,
    productName,
    targetProductName = productName,
    logs,
    overview,
    specifications,
    productDescription,
    currentSpecificationFieldName,
    nextSpecificationFieldName
  }) {
    const payload = await buildSavePayload(
      page,
      overview,
      specifications,
      productDescription,
      targetProductName,
      productName,
      currentSpecificationFieldName,
      nextSpecificationFieldName
    );
    const save = await postProductUpdate(page, payload);
    const readback = await verifySavedProduct(
      page,
      targetProductName,
      logs,
      (snapshot) => {
        const detail = snapshot.detail.overview === overview;
        const specification = snapshot.detail.specifications === specifications;
        const specificationName = normalize(snapshot.detail.specificationsFieldName)
          === normalize(nextSpecificationFieldName);
        const description = snapshot.productDescription === productDescription;
        return {
          passed: detail && specification && specificationName && description,
          detail,
          specification,
          specificationName,
          description
        };
      }
    );
    if (!readback.verification.passed) {
      const { detail, specification, specificationName, description } = readback.verification;
      throw new Error(
        `保存后回读不一致：Detail ${detail ? "通过" : "失败"}，`
        + `Specification 内容 ${specification ? "通过" : "失败"}，`
        + `Specification 字段名 ${specificationName ? "通过" : "失败"}，`
        + `Product Description ${description ? "通过" : "失败"}。`
      );
    }
    return { save, readback, after: readback.snapshot };
  }

  async function prepareDirectRevision(body, logs, existingSession) {
    const request = validateDirectRevision(body);
    const site = getCampaignSites(readCampaignConfig()).find((item) => item.siteCode === request.siteCode);
    if (!site || site.enabled === false) throw new Error("所选国家站点不存在或未启用。");
    const session = existingSession || await prepareSiteSession(site, body, logs);
    const before = await readProductSnapshot(session.page, request.productName, logs);
    const specification = request.revisionType === "specification"
      ? applySpecificationOperations(before.detail.specifications, request.operations)
      : { value: before.detail.specifications, results: [] };
    const detail = request.revisionType === "detail"
      ? (request.operations.length
        ? applyContentOperations(before.detail.overview, request.operations, "Detail")
        : { value: request.detailHtml.trim() ? request.detailHtml : before.detail.overview, results: [] })
      : { value: before.detail.overview, results: [] };
    const productDescription = request.productDescriptionProvided
      ? request.productDescription
      : before.productDescription;
    const specificationFieldName = request.specificationFieldNameProvided
      ? request.specificationFieldName
      : before.detail.specificationsFieldName;
    const fingerprint = hashValue(JSON.stringify({
      goodsId: before.goodsId,
      detail: before.detail.overview,
      specifications: before.detail.specifications,
      specificationFieldName: before.detail.specificationsFieldName,
      productDescription: before.productDescription
    }));
    return {
      request,
      site,
      session,
      before,
      detail,
      specification,
      specificationFieldName,
      productDescription,
      fingerprint
    };
  }

  async function previewDirectRevision(body, logs, existingSession) {
    const prepared = await prepareDirectRevision(body, logs, existingSession);
    return {
      mode: "product-direct-revision-preview",
      site: prepared.site,
      productName: prepared.request.productName,
      goodsId: prepared.before.goodsId,
      fingerprint: prepared.fingerprint,
      revisionType: prepared.request.revisionType,
      detailChanged: prepared.before.detail.overview !== prepared.detail.value,
      specificationChanged: prepared.before.detail.specifications !== prepared.specification.value,
      specificationFieldNameChanged: normalize(prepared.before.detail.specificationsFieldName)
        !== normalize(prepared.specificationFieldName),
      currentSpecificationFieldName: prepared.before.detail.specificationsFieldName,
      desiredSpecificationFieldName: prepared.specificationFieldName,
      descriptionChanged: prepared.before.productDescription !== prepared.productDescription,
      currentProductDescription: prepared.before.productDescription,
      desiredProductDescription: prepared.productDescription,
      detailOperations: prepared.detail.results,
      specificationOperations: prepared.specification.results
    };
  }

  async function submitDirectRevision(body, logs, existingSession) {
    const prepared = await prepareDirectRevision(body, logs, existingSession);
    if (!body?.fingerprint || body.fingerprint !== prepared.fingerprint) {
      throw new Error("产品内容在预览后发生变化，请重新预览后再提交。");
    }
    const { save, after } = await saveProductContentAndVerify({
      page: prepared.session.page,
      productName: prepared.request.productName,
      logs,
      overview: prepared.detail.value,
      specifications: prepared.specification.value,
      productDescription: prepared.productDescription,
      currentSpecificationFieldName: prepared.before.detail.specificationsFieldName,
      nextSpecificationFieldName: prepared.specificationFieldName
    });
    return {
      mode: "product-direct-revision-submit",
      site: prepared.site,
      productName: prepared.request.productName,
      goodsId: after.goodsId,
      save,
      backendCheck: {
        status: "passed",
        detail: "passed",
        specification: "passed",
        specificationName: "passed",
        description: "passed"
      }
    };
  }

  function commonRevisionTargets(body) {
    return buildCommonRevisionTargets(body, getCampaignSites(readCampaignConfig()));
  }

  async function previewCommonRevision(body, logs) {
    const { sites, productNames, targets } = commonRevisionTargets(body);
    const results = [];
    const sessions = new Map();
    for (const { site, productName } of targets) {
      try {
        let session = sessions.get(site.siteCode);
        if (!session) {
          session = await prepareSiteSession(site, body, logs);
          sessions.set(site.siteCode, session);
        }
        const result = await previewDirectRevision(
          applyAutoSpecificationFieldName({ ...(body || {}), siteCode: site.siteCode, productName }, site.siteCode),
          logs,
          session
        );
        const changed = result.detailChanged || result.specificationChanged
          || result.specificationFieldNameChanged || result.descriptionChanged;
        results.push({ status: changed ? "ready" : "no-change", site, productName, result });
      } catch (error) {
        if (/page|context|browser.*closed/i.test(error?.message || "")) sessions.delete(site.siteCode);
        results.push({ status: "failed", site, productName, error: error?.message || String(error) });
      }
    }
    return {
      mode: "product-common-revision-preview",
      siteCount: sites.length,
      productCount: productNames.length,
      operationCount: targets.length,
      readyCount: results.filter((item) => item.status === "ready").length,
      noChangeCount: results.filter((item) => item.status === "no-change").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results
    };
  }

  async function submitCommonRevision(body, logs) {
    const { sites, productNames, targets } = commonRevisionTargets(body);
    let fingerprints;
    try {
      fingerprints = typeof body?.fingerprints === "string"
        ? JSON.parse(body.fingerprints)
        : body?.fingerprints || {};
    } catch {
      throw new Error("预览指纹格式不正确，请重新预览。");
    }
    const allowedTargets = new Set(targets.map(({ site, productName }) => `${site.siteCode}\n${productName.toLowerCase()}`));
    const submitTargets = Object.values(fingerprints);
    if (!submitTargets.length) throw new Error("没有可执行的预览结果，请重新预览。");
    const results = [];
    const sessions = new Map();
    for (const target of submitTargets) {
      const siteCode = normalize(target?.siteCode).toLowerCase();
      const productName = normalize(target?.productName);
      const fingerprint = normalize(target?.fingerprint);
      const site = sites.find((item) => item.siteCode === siteCode);
      if (!site || !productName || !fingerprint || !allowedTargets.has(`${siteCode}\n${productName.toLowerCase()}`)) {
        results.push({ status: "failed", site, productName, error: "预览目标或指纹不正确，请重新预览。" });
        continue;
      }
      try {
        let session = sessions.get(siteCode);
        if (!session) {
          session = await prepareSiteSession(site, body, logs);
          sessions.set(siteCode, session);
        }
        const result = await submitDirectRevision(
          applyAutoSpecificationFieldName({ ...(body || {}), siteCode, productName, fingerprint }, siteCode),
          logs,
          session
        );
        results.push({ status: "completed", site, productName, result });
      } catch (error) {
        if (/page|context|browser.*closed/i.test(error?.message || "")) sessions.delete(siteCode);
        results.push({ status: "failed", site, productName, error: error?.message || String(error) });
      }
    }
    return {
      mode: "product-common-revision-submit",
      siteCount: sites.length,
      productCount: productNames.length,
      operationCount: submitTargets.length,
      completedCount: results.filter((item) => item.status === "completed").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results
    };
  }

  function removeTemporaryFile(filePath) {
    if (!filePath) return;
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }

  function parseExpectedLanguagePackageFingerprints(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      throw new Error("语言包预览指纹格式不正确，请重新预览。");
    }
  }

  const parseExpectedCopySourceFingerprints = parseExpectedLanguagePackageFingerprints;

  async function prepareLanguagePackage(session, target, parsedDatasheet, logs) {
    const translationHeader = resolveDatasheetLanguage(
      parsedDatasheet,
      target,
      SITE_LANGUAGE_NEEDLES
    );
    const downloaded = await languagePackageFeature.downloadCurrentLanguagePackageForPage(
      session.page,
      target.site,
      logs
    );
    try {
      const packageInfo = readLanguagePackage(downloaded.filePath, downloaded.langCode);
      const plan = planLanguagePackageUpdates(
        packageInfo,
        parsedDatasheet,
        translationHeader
      );
      logLine(
        logs,
        `${target.site.name} 使用 Datasheet 译文列“${translationHeader}”：`
        + `语言包第 3 列字段名匹配 `
        + `${plan.matchedFieldCount} 个，第 5 列待覆盖 ${plan.changedCellCount} 个。`
      );
      return { downloaded, packageInfo, plan, translationHeader };
    } catch (error) {
      removeTemporaryFile(downloaded.filePath);
      throw error;
    }
  }

  async function preview(body, excelFile, languageDatasheetFile, logs, options = {}) {
    const publishing = options.publishing === true;
    const specificationLanguageOnly = !publishing && isSpecificationLanguageOnly(body);
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const request = validateRevisionRequest(body, sites, {
      ignoreSourceSite: publishing || specificationLanguageOnly
    });
    const parsedWorkbook = parseSpecificationWorkbook(excelFile.path);
    const parsedDatasheet = parseLanguageDatasheet(languageDatasheetFile.path);
    const source = publishing || specificationLanguageOnly
      ? null
      : await readSource(request, body, logs);
    const results = [];
    logLine(logs, `开始批量预览 ${request.targets.length} 个目标站点。`);

    for (const target of request.targets) {
      let languagePackage = null;
      const warnings = [];
      const targetProductName = publishingProductNameForSite(
        request.productName,
        target.site.siteCode
      );
      try {
        const session = await prepareSiteSession(target.site, body, logs);
        let targetSource = source;
        let current = null;
        let copySource = null;
        let copyRequired = publishing;
        let activeProductName = request.productName;
        let productNameChanged = publishing && targetProductName !== request.productName;
        let detailChanged = true;
        let specificationChanged = true;
        let descriptionChanged = true;
        if (publishing) {
          let existing = await productExistsInCurrentSite(
            session.page,
            targetProductName,
            logs
          );
          if (!existing.exists && targetProductName !== request.productName) {
            existing = await productExistsInCurrentSite(
              session.page,
              request.productName,
              logs
            );
            if (existing.exists) activeProductName = request.productName;
          } else if (existing.exists) {
            activeProductName = targetProductName;
          }
          if (existing.exists) {
            copyRequired = false;
            productNameChanged = activeProductName !== targetProductName;
            current = await readProductSnapshot(session.page, activeProductName, logs);
            targetSource = {
              snapshot: current,
              image: extractSpecificationImage(current.detail.specifications)
            };
            logLine(logs, `${target.site.name} 已存在 ${activeProductName}，跳过国际站复制，只预览产品名称 / Specification / Product Description / 语言包更新。`);
          } else {
            await session.page.goto("https://shop.ezvizlife.com/goods/int-goods-list", {
              waitUntil: "domcontentloaded",
              timeout: 60000
            });
            await session.page.waitForTimeout(1200);
            copySource = await findInternationalProduct(
              session.page,
              request.productName,
              logs
            );
            targetSource = internationalListSource(request.productName, copySource);
            logLine(
              logs,
              `已锁定国际产品复制源：${request.productName} / goods_id=${copySource.goodsId}；`
              + "完整 Detail 将在提交复制后从目标站产品回读。"
            );
            copySource = {
              ...copySource,
              sourceFingerprint: targetSource.fingerprint,
              overviewLength: targetSource.snapshot.detail.overview.length,
              specificationLength: targetSource.snapshot.detail.specifications.length,
              image: targetSource.image
            };
          }
        } else {
          current = await readProductSnapshot(session.page, request.productName, logs);
          if (specificationLanguageOnly) {
            targetSource = {
              snapshot: current,
              image: extractSpecificationImage(current.detail.specifications)
            };
          }
        }
        const desired = buildTargetRevision(
          parsedWorkbook,
          parsedDatasheet,
          target,
          targetSource,
          {
            fallbackDescription: publishing
              ? targetSource.snapshot.productDescription
              : current.productDescription,
            currentDescription: current?.productDescription,
            tolerant: publishing
          }
        );
        if (desired.productDescription.warning) {
          warnings.push({
            type: "product-description",
            productName: request.productName,
            message: desired.productDescription.warning
          });
        }
        const currentSpecificationFieldName = copyRequired
          ? targetSource.snapshot.detail.specificationsFieldName
          : current.detail.specificationsFieldName;
        const desiredSpecificationFieldName = desired.language.title;
        const specificationFieldNameChanged = normalize(currentSpecificationFieldName)
          !== normalize(desiredSpecificationFieldName);
        if (copyRequired) {
          detailChanged = false;
          specificationChanged = targetSource.snapshot.detail.specifications !== desired.specifications
            || specificationFieldNameChanged;
          descriptionChanged = !desired.productDescription.inherited;
        } else {
          detailChanged = specificationLanguageOnly
            ? false
            : current.detail.overview !== source.snapshot.detail.overview;
          specificationChanged = current.detail.specifications !== desired.specifications
            || specificationFieldNameChanged;
          descriptionChanged = current.productDescription !== effectiveProductDescriptionForScope(
            specificationLanguageOnly,
            current.productDescription,
            desired.productDescription
          );
        }
        if (publishing && !copyRequired) detailChanged = false;
        try {
          languagePackage = await prepareLanguagePackage(
            session,
            target,
            parsedDatasheet,
            logs
          );
        } catch (error) {
          if (!publishing) throw error;
          const message = `语言包已跳过：${error?.message || String(error)}`;
          warnings.push({ type: "language-package", productName: request.productName, message });
          logLine(logs, `${target.site.name} ${message}`);
        }
        const languagePackageSummary = languagePackage
          ? summarizeLanguagePackagePlan(languagePackage.plan)
          : null;
        const languagePackageChanged = Boolean(languagePackage?.plan.changedCellCount);
        results.push({
          status: revisionPreviewStatus({
            publishing,
            copyRequired,
            detailChanged,
            specificationChanged,
            descriptionChanged,
            languagePackageChanged,
            productNameChanged
          }),
          site: target.site,
          authenticatedIdentity: session.authenticatedIdentity,
          goodsId: current?.goodsId || "",
          editUrl: current?.editUrl || "",
          copyRequired,
          targetProductName,
          productNameChanged,
          copySource,
          localeHeader: desired.language.header,
          detailChanged,
          specificationChanged,
          specificationFieldNameChanged,
          currentSpecificationFieldName,
          desiredSpecificationFieldName,
          descriptionChanged,
          currentProductDescription: current?.productDescription || "",
          desiredProductDescription: desired.productDescription.description,
          productDescriptionHeader: desired.productDescription.translationHeader,
          currentOverviewLength: current?.detail.overview.length || 0,
          desiredOverviewLength: targetSource.snapshot.detail.overview.length,
          currentSpecificationLength: current?.detail.specifications.length || 0,
          desiredSpecificationLength: desired.specifications.length,
          languagePackage: languagePackage ? {
            ...languagePackageSummary,
            langCode: languagePackage.downloaded.langCode,
            sourceFingerprint: languagePackage.packageInfo.contentFingerprint
          } : null,
          warnings
        });
      } catch (error) {
        results.push({
          status: "failed",
          site: target.site,
          targetProductName,
          localeHeader: target.localeHeader,
          error: error?.message || String(error)
        });
      } finally {
        removeTemporaryFile(languagePackage?.downloaded?.filePath);
      }
    }

    return {
      mode: publishing ? "product-publishing-preview" : "product-revision-sync-preview",
      productName: request.productName,
      source: publishing || specificationLanguageOnly ? null : {
        site: request.sourceSite,
        goodsId: source.snapshot.goodsId,
        editUrl: source.snapshot.editUrl,
        authenticatedIdentity: source.session.authenticatedIdentity,
        overviewLength: source.snapshot.detail.overview.length,
        specificationLength: source.snapshot.detail.specifications.length,
        productDescription: source.snapshot.productDescription,
        image: source.image,
        fingerprint: source.fingerprint
      },
      workbook: {
        sheetName: parsedWorkbook.sheetName,
        fingerprint: parsedWorkbook.fingerprint,
        languages: parsedWorkbook.languages.map((language) => language.header)
      },
      languageDatasheet: {
        sheetName: parsedDatasheet.sheetName,
        fingerprint: parsedDatasheet.fingerprint,
        languages: parsedDatasheet.headers,
        fieldCount: parsedDatasheet.rows.length
      },
      targetCount: results.length,
      readyCount: results.filter((result) => result.status === "ready").length,
      noChangeCount: results.filter((result) => result.status === "no-change").length,
      failedCount: results.filter((result) => result.status === "failed").length,
      results
    };
  }

  async function submitPublishingLanguagePackageBatch(body, datasheetFiles, expectedFingerprints, logs) {
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const batchProductName = normalize(datasheetFiles?.[0]?.productName);
    const request = validateRevisionRequest(
      { ...(body || {}), productName: batchProductName },
      sites,
      { ignoreSourceSite: true }
    );
    const parsedDatasheets = datasheetFiles.map((entry) => ({
      productName: entry.productName,
      parsed: parseLanguageDatasheet(entry.file.path)
    }));
    const results = [];
    logLine(logs, `开始合并 ${parsedDatasheets.length} 个产品的语言包译文。`);

    for (const target of request.targets) {
      let downloaded = null;
      let generated = null;
      const warnings = [];
      try {
        const session = await prepareSiteSession(target.site, body, logs);
        downloaded = await languagePackageFeature.downloadCurrentLanguagePackageForPage(
          session.page,
          target.site,
          logs
        );
        let packageInfo = readLanguagePackage(downloaded.filePath, downloaded.langCode);
        const expected = normalize(expectedFingerprints?.[target.site.siteCode]);
        if (!expected || expected !== packageInfo.contentFingerprint) {
          throw new Error(`${target.site.name} 当前语言包在预览后发生变化，请重新预览。`);
        }

        let changedCellCount = 0;
        const verificationInputs = [];
        for (const entry of parsedDatasheets) {
          try {
            const translationHeader = resolveDatasheetLanguage(
              entry.parsed,
              target,
              SITE_LANGUAGE_NEEDLES
            );
            const plan = planLanguagePackageUpdates(packageInfo, entry.parsed, translationHeader);
            assertSafePlan(plan);
            warnings.push(...languagePackageInputWarnings(plan, entry.productName));
            changedCellCount += plan.changedCellCount;
            verificationInputs.push({ ...entry, translationHeader });
            logLine(
              logs,
              `${target.site.name} 合并 ${entry.productName}：第 5 列覆盖 ${plan.changedCellCount} 个单元格。`
            );
            if (!plan.changedCellCount) continue;
            const outputPath = path.resolve(
              "runtime",
              "language-package-revision",
              `${Date.now()}-${target.site.siteCode}-batch-${verificationInputs.length}.xlsx`
            );
            const nextGenerated = writeUpdatedLanguagePackage(packageInfo, plan, outputPath);
            if (generated) removeTemporaryFile(generated.filePath);
            generated = nextGenerated;
            packageInfo = readLanguagePackage(generated.filePath, downloaded.langCode);
          } catch (error) {
            const message = `${entry.productName} 语言数据已跳过：${error?.message || String(error)}`;
            warnings.push({ type: "language-package", productName: entry.productName, message });
            logLine(logs, `${target.site.name} ${message}`);
          }
        }

        if (generated) {
          await languagePackageFeature.uploadLanguagePackageForPage(
            session.page,
            { ...generated, langCode: downloaded.langCode },
            logs
          );
          const verification = await languagePackageFeature.downloadCurrentLanguagePackageForPage(
            session.page,
            target.site,
            logs
          );
          try {
            const verifiedPackage = readLanguagePackage(verification.filePath, verification.langCode);
            for (const entry of verificationInputs) {
              const plan = planLanguagePackageUpdates(
                verifiedPackage,
                entry.parsed,
                entry.translationHeader
              );
              assertSafePlan(plan);
              if (plan.changedCellCount) {
                const readbackWarnings = languagePackageReadbackWarnings(plan, entry.productName);
                warnings.push(...readbackWarnings);
                logLine(logs, `${entry.productName} 语言包回读警告：${readbackWarnings.map((item) => item.message).join("；")}`);
              }
            }
          } finally {
            removeTemporaryFile(verification.filePath);
          }
        }
        logLine(logs, warnings.length
          ? `${target.site.name} 批量语言包已上传，回读发现 ${warnings.length} 个警告，继续上架。`
          : `${target.site.name} 批量语言包已一次上传并回读核验通过。`);
        results.push({ status: "completed", site: target.site, changedCellCount, warnings });
      } catch (error) {
        const message = `${target.site.name} 语言包处理失败，产品上架继续：${error?.message || String(error)}`;
        logLine(logs, message);
        results.push({
          status: "warning",
          site: target.site,
          warnings: [{ type: "language-package", message }]
        });
      } finally {
        removeTemporaryFile(downloaded?.filePath);
        removeTemporaryFile(generated?.filePath);
      }
    }
    return {
      results,
      warnings: results.flatMap((item) => item.warnings || [])
    };
  }

  async function submit(body, excelFile, languageDatasheetFile, logs, options = {}) {
    const publishing = options.publishing === true;
    const skipLanguagePackage = options.skipLanguagePackage === true;
    const specificationLanguageOnly = !publishing && isSpecificationLanguageOnly(body);
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const request = validateRevisionRequest(body, sites, {
      ignoreSourceSite: publishing || specificationLanguageOnly
    });
    const parsedWorkbook = parseSpecificationWorkbook(excelFile.path);
    const parsedDatasheet = parseLanguageDatasheet(languageDatasheetFile.path);
    const expectedWorkbookFingerprint = normalize(body?.expectedWorkbookFingerprint);
    if (!expectedWorkbookFingerprint
      || expectedWorkbookFingerprint !== parsedWorkbook.fingerprint) {
      throw new Error("Specification Excel 与预览时不一致，请重新预览。");
    }
    const expectedLanguageDatasheetFingerprint = normalize(
      body?.expectedLanguageDatasheetFingerprint
    );
    if (!expectedLanguageDatasheetFingerprint
      || expectedLanguageDatasheetFingerprint !== parsedDatasheet.fingerprint) {
      throw new Error("语言包 Datasheet 与预览时不一致，请重新预览。");
    }
    const expectedLanguagePackageFingerprints =
      parseExpectedLanguagePackageFingerprints(
        body?.expectedLanguagePackageFingerprints
      );
    const source = publishing || specificationLanguageOnly
      ? null
      : await readSource(request, body, logs);
    if (!publishing && !specificationLanguageOnly) {
      const expectedSourceFingerprint = normalize(body?.expectedSourceFingerprint);
      if (!expectedSourceFingerprint || expectedSourceFingerprint !== source.fingerprint) {
        throw new Error("国际站产品 Detail 在预览后发生变化，请重新预览。");
      }
    }
    const expectedCopySourceFingerprints = parseExpectedCopySourceFingerprints(
      body?.expectedCopySourceFingerprints
    );

    const results = [];
    logLine(logs, `开始批量执行 ${request.targets.length} 个目标站点。`);
    for (const target of request.targets) {
      logLine(logs, `同步目标站点：${target.site.name} (${target.site.siteCode})`);
      let languagePackage = null;
      let generatedPackage = null;
      const components = {
        copy: publishing ? "pending" : "not-required",
        productName: publishing ? "pending" : "not-required",
        detail: "pending",
        specification: "pending",
        description: "pending",
        languagePackage: "pending"
      };
      const warnings = [];
      const targetProductName = publishingProductNameForSite(
        request.productName,
        target.site.siteCode
      );
      try {
        const session = await prepareSiteSession(target.site, body, logs);
        let targetSource = source;
        let copy = null;
        let before = null;
        let copyRequired = publishing;
        let activeProductName = request.productName;
        if (publishing) {
          let existing = await productExistsInCurrentSite(
            session.page,
            targetProductName,
            logs
          );
          if (!existing.exists && targetProductName !== request.productName) {
            existing = await productExistsInCurrentSite(
              session.page,
              request.productName,
              logs
            );
            if (existing.exists) activeProductName = request.productName;
          } else if (existing.exists) {
            activeProductName = targetProductName;
          }
          if (existing.exists) {
            copyRequired = false;
            components.copy = "not-required-existing";
            before = await readProductSnapshot(session.page, activeProductName, logs);
            targetSource = {
              snapshot: before,
              image: extractSpecificationImage(before.detail.specifications)
            };
            logLine(logs, `${target.site.name} 已存在 ${activeProductName}，跳过国际站复制，直接更新产品名称 / Specification / Product Description / 语言包。`);
          } else {
            await session.page.goto("https://shop.ezvizlife.com/goods/int-goods-list", {
              waitUntil: "domcontentloaded",
              timeout: 60000
            });
            await session.page.waitForTimeout(1200);
            const copySource = await findInternationalProduct(
              session.page,
              request.productName,
              logs
            );
            targetSource = internationalListSource(request.productName, copySource);
            const expectedCopySourceFingerprint = normalize(
              expectedCopySourceFingerprints[target.site.siteCode]
            );
            if (!expectedCopySourceFingerprint
              || expectedCopySourceFingerprint !== targetSource.fingerprint) {
              throw new Error(
                `${target.site.name} 国际产品复制源在预览后发生变化，请重新预览。`
              );
            }
            await session.page.goto("https://shop.ezvizlife.com/goods/int-goods-list", {
              waitUntil: "domcontentloaded",
              timeout: 60000
            });
            await session.page.waitForTimeout(1200);
            copy = await copyInternationalProduct(session.page, request.productName, logs);
            components.copy = "passed";
            before = await readProductSnapshot(session.page, request.productName, logs);
            activeProductName = request.productName;
            const copiedImage = extractSpecificationImage(before.detail.specifications);
            if (!copiedImage.src) {
              logLine(logs, "复制后的目标产品 Specification 没有可用图片地址，目标规格将保持无图片状态。");
            }
            targetSource = {
              snapshot: before,
              image: copiedImage,
              fingerprint: targetSource.fingerprint
            };
          }
        }
        if (!before) before = await readProductSnapshot(session.page, activeProductName, logs);
        if (specificationLanguageOnly) {
          targetSource = {
            snapshot: before,
            image: extractSpecificationImage(before.detail.specifications)
          };
        }
        const desired = buildTargetRevision(
          parsedWorkbook,
          parsedDatasheet,
          target,
          targetSource,
          {
            fallbackDescription: before.productDescription,
            currentDescription: before.productDescription,
            tolerant: publishing
          }
        );
        if (desired.productDescription.warning) {
          warnings.push({
            type: "product-description",
            productName: request.productName,
            message: desired.productDescription.warning
          });
        }
        const detailChanged = specificationLanguageOnly || (publishing && !copyRequired)
          ? false
          : before.detail.overview !== targetSource.snapshot.detail.overview;
        const desiredSpecificationFieldName = desired.language.title;
        const specificationFieldNameChanged = normalize(before.detail.specificationsFieldName)
          !== normalize(desiredSpecificationFieldName);
        const specificationChanged = before.detail.specifications !== desired.specifications
          || specificationFieldNameChanged;
        const expectedProductDescription = effectiveProductDescriptionForScope(
          specificationLanguageOnly,
          before.productDescription,
          desired.productDescription
        );
        const descriptionChanged = before.productDescription !== expectedProductDescription;
        const productNameChanged = publishing && activeProductName !== targetProductName;
        if (!skipLanguagePackage) {
          try {
            languagePackage = await prepareLanguagePackage(
              session,
              target,
              parsedDatasheet,
              logs
            );
            const expectedPackageFingerprint = normalize(
              expectedLanguagePackageFingerprints[target.site.siteCode]
            );
            if (!expectedPackageFingerprint
              || expectedPackageFingerprint
                !== languagePackage.packageInfo.contentFingerprint) {
              throw new Error(
                `${target.site.name} 当前语言包在预览后发生变化，请重新预览。`
              );
            }
            assertSafePlan(languagePackage.plan);
            warnings.push(...languagePackageInputWarnings(languagePackage.plan, request.productName));
          } catch (error) {
            if (!publishing) throw error;
            removeTemporaryFile(languagePackage?.downloaded?.filePath);
            languagePackage = null;
            const message = `语言包已跳过：${error?.message || String(error)}`;
            warnings.push({ type: "language-package", productName: request.productName, message });
            components.languagePackage = "warning";
            logLine(logs, `${target.site.name} ${message}，产品上架继续执行。`);
          }
        }
        const languagePackageChanged = Boolean(!skipLanguagePackage
          && languagePackage?.plan.changedCellCount > 0);
        if (!copyRequired && !productNameChanged && !detailChanged && !specificationChanged
          && !descriptionChanged && !languagePackageChanged) {
          components.detail = "no-change";
          components.specification = "no-change";
          components.description = "no-change";
          components.productName = "no-change";
          components.languagePackage = skipLanguagePackage
            ? "batch-passed"
            : warnings.some((item) => item.type === "language-package")
              ? "warning"
              : "no-change";
          results.push({
            status: "no-change",
            site: target.site,
            goodsId: before.goodsId,
            targetProductName,
            productNameChanged,
            localeHeader: desired.language.header,
            languagePackageHeader: languagePackage?.translationHeader || target.languagePackageHeader,
            warnings,
            components
          });
          continue;
        }

        if (languagePackageChanged) {
          const outputDirectory = path.resolve(
            "runtime",
            "language-package-revision"
          );
          const outputPath = path.join(
            outputDirectory,
            `${Date.now()}-${target.site.siteCode}-${languagePackage.downloaded.langCode}.xlsx`
          );
          generatedPackage = writeUpdatedLanguagePackage(
            languagePackage.packageInfo,
            languagePackage.plan,
            outputPath
          );
          logLine(
            logs,
            `${target.site.name} 新语言包已生成并回读通过：第 5 列覆盖 `
            + `${generatedPackage.verifiedCellCount} 个单元格。`
          );
        }

        let save = null;
        let after = before;
        if (productNameChanged || detailChanged || specificationChanged || descriptionChanged) {
          const overview = specificationLanguageOnly
              ? before.detail.overview
              : targetSource.snapshot.detail.overview;
          await readProductSnapshot(session.page, activeProductName, logs);
          const saved = await saveProductContentAndVerify({
            page: session.page,
            productName: activeProductName,
            targetProductName,
            logs,
            overview,
            specifications: desired.specifications,
            productDescription: expectedProductDescription,
            currentSpecificationFieldName: before.detail.specificationsFieldName,
            nextSpecificationFieldName: desiredSpecificationFieldName
          });
          save = saved.save;
          after = saved.after;
          const readback = saved.readback;
          const detailVerified = readback.verification.detail;
          const specificationVerified = readback.verification.specification
            && readback.verification.specificationName;
          const descriptionVerified = readback.verification.description;
          components.detail = detailChanged
            ? (detailVerified ? "passed" : "failed")
            : "no-change";
          components.specification = specificationChanged
            ? (specificationVerified ? "passed" : "failed")
            : "no-change";
          components.description = descriptionChanged
            ? (descriptionVerified ? "passed" : "failed")
            : "no-change";
          components.productName = productNameChanged ? "passed" : "no-change";
        } else {
          components.detail = "no-change";
          components.specification = "no-change";
          components.description = "no-change";
          components.productName = "no-change";
        }

        let languagePackageUpload = null;
        if (languagePackageChanged) {
          languagePackageUpload = await languagePackageFeature.uploadLanguagePackageForPage(
            session.page,
            {
              ...generatedPackage,
              langCode: languagePackage.downloaded.langCode
            },
            logs
          );
          const verification = await languagePackageFeature
            .downloadCurrentLanguagePackageForPage(
              session.page,
              target.site,
              logs
            );
          try {
            const verifiedPackage = readLanguagePackage(
              verification.filePath,
              verification.langCode
            );
            const verificationPlan = planLanguagePackageUpdates(
              verifiedPackage,
              parsedDatasheet,
              languagePackage.translationHeader
            );
            assertSafePlan(verificationPlan);
            if (verificationPlan.changedCellCount) {
              const readbackWarnings = languagePackageReadbackWarnings(
                verificationPlan,
                request.productName
              );
              warnings.push(...readbackWarnings);
              logLine(logs, `${target.site.name} 语言包回读警告：${readbackWarnings.map((item) => item.message).join("；")}`);
            }
          } finally {
            removeTemporaryFile(verification.filePath);
          }
          components.languagePackage = warnings.length ? "warning" : "passed";
          logLine(
            logs,
            warnings.length
              ? `${target.site.name} 语言包已上传，回读警告不阻断后续执行。`
              : `${target.site.name} 语言包重新上传并再次下载核验通过。`
          );
        } else {
          components.languagePackage = skipLanguagePackage
            ? "batch-passed"
            : warnings.some((item) => item.type === "language-package")
              ? "warning"
              : "no-change";
        }
        results.push({
          status: "completed",
          site: target.site,
          goodsId: after.goodsId,
          targetProductName,
          productNameChanged,
          editUrl: after.editUrl,
          localeHeader: desired.language.header,
          languagePackageHeader: languagePackage?.translationHeader || target.languagePackageHeader,
          detailChanged,
          specificationChanged,
          specificationFieldNameChanged,
          currentSpecificationFieldName: before.detail.specificationsFieldName,
          desiredSpecificationFieldName,
          descriptionChanged,
          productDescriptionHeader: desired.productDescription.translationHeader,
          languagePackageChanged,
          copy,
          save,
          languagePackageUpload,
          languagePackage: languagePackage ? summarizeLanguagePackagePlan(languagePackage.plan) : null,
          warnings,
          components
        });
      } catch (error) {
        results.push({
          status: "failed",
          site: target.site,
          targetProductName,
          localeHeader: target.localeHeader,
          languagePackageHeader: target.languagePackageHeader,
          components,
          error: error?.message || String(error)
        });
        logLine(
          logs,
          `${target.site.name} (${target.site.siteCode}) 同步失败：${error?.message || String(error)}`
        );
      } finally {
        removeTemporaryFile(languagePackage?.downloaded?.filePath);
        removeTemporaryFile(generatedPackage?.filePath);
      }
    }

    logLine(
      logs,
      `批量执行结束：成功 ${results.filter((result) => result.status === "completed").length}，`
      + `无需更新 ${results.filter((result) => result.status === "no-change").length}，`
      + `失败 ${results.filter((result) => result.status === "failed").length}。`
    );
    return {
      mode: publishing ? "product-publishing-submit" : "product-revision-sync-submit",
      productName: request.productName,
      sourceSite: request.sourceSite,
      targetCount: results.length,
      completedCount: results.filter((result) => result.status === "completed").length,
      noChangeCount: results.filter((result) => result.status === "no-change").length,
      failedCount: results.filter((result) => result.status === "failed").length,
      results
    };
  }

  const previewPublishing = (body, excelFile, languageDatasheetFile, logs) =>
    preview(body, excelFile, languageDatasheetFile, logs, { publishing: true });
  const submitPublishing = (body, excelFile, languageDatasheetFile, logs) =>
    submit(body, excelFile, languageDatasheetFile, logs, { publishing: true });
  const submitPublishingWithoutLanguagePackage = (body, excelFile, languageDatasheetFile, logs) =>
    submit(body, excelFile, languageDatasheetFile, logs, {
      publishing: true,
      skipLanguagePackage: true
    });

  return {
    preview,
    submit,
    previewPublishing,
    submitPublishing,
    submitPublishingWithoutLanguagePackage,
    submitPublishingLanguagePackageBatch,
    previewDirectRevision,
    submitDirectRevision,
    previewCommonRevision,
    submitCommonRevision
  };
}

module.exports = {
  SITE_LANGUAGE_NEEDLES,
  SITE_SPECIFICATION_TITLES,
  SITE_SPECIFICATION_FIELD_TITLES,
  specificationTitleForSite,
  specificationFieldTitleForSite,
  SPECIFICATION_DETAIL_FIELD_NAMES,
  normalizeDetailFieldName,
  findSpecificationDetailField,
  productSnapshotStabilitySignature,
  retryProductReadback,
  fillAdsAdditionalProductTitle,
  normalizeJapanPublishingProductName,
  publishingProductNameForSite,
  extractSpecificationImage,
  parseSpecificationWorkbook,
  resolveWorkbookLanguage,
  buildPcSpecificationHtml,
  parseTargets,
  validateRevisionRequest,
  readDetailFromPcView,
  revisionPreviewStatus,
  isSpecificationLanguageOnly,
  effectiveProductDescriptionForScope,
  normalizeInternationalImageUrl,
  internationalListSource,
  resolveProductDescription,
  validateDirectRevision,
  applyContentOperations,
  applySpecificationOperations,
  buildCommonRevisionTargets,
  applyAutoSpecificationFieldName,
  createProductRevisionSyncFeature
};
