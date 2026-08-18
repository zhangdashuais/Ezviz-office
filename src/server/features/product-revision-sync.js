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
  de: "Technische Daten",
  fr: "Caractéristiques", be: "Caractéristiques",
  it: "Specifiche",
  pl: "Specyfikacja",
  cz: "Specifikace",
  nl: "Specificaties",
  tr: "Teknik Özellikler",
  ro: "Specificații",
  ar: "المواصفات", sa: "المواصفات"
};

function specificationTitleForSite(siteCode, fallback = "Specifications") {
  return SITE_SPECIFICATION_TITLES[normalize(siteCode).toLowerCase()]
    || normalize(fallback)
    || "Specifications";
}

const SPECIFICATION_DETAIL_FIELD_NAMES = [
  "specifications",
  "specification",
  "specs",
  "\u4ed5\u69d8"
];

const MAX_FRAME_RATE_PATTERN = /\bMax\s*[.:：]?\s*\d+(?:\.\d+)?\s*fps\b/i;

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDetailFieldName(value) {
  return normalize(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function findSpecificationDetailField(customFields) {
  const fields = Array.isArray(customFields) ? customFields : [];
  const knownNames = [
    ...SPECIFICATION_DETAIL_FIELD_NAMES,
    ...Object.values(SITE_SPECIFICATION_TITLES).map(normalizeDetailFieldName)
  ];
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
          return `<th colspan="${colspan}" rowspan="${rowspan}" width="200">${value}</th>`;
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
  detailChanged,
  specificationChanged,
  descriptionChanged,
  languagePackageChanged
}) {
  return publishing || detailChanged || specificationChanged
    || descriptionChanged || languagePackageChanged
    ? "ready"
    : "no-change";
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
  const translationHeader = resolveDatasheetLanguage(
    parsedDatasheet,
    target,
    SITE_LANGUAGE_NEEDLES
  );
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
    throw new Error(
      candidates.length
        ? "Datasheet 中存在多个 Product Description 字段，请只保留一个。"
        : "Datasheet 中缺少 Product Description 字段。"
    );
  }
  const description = normalize(candidates[0].translations[translationHeader]);
  if (!description) {
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
  let operations = revisionType === "detail"
    ? body?.detailOperations || []
    : body?.specificationOperations || [];
  if (typeof operations === "string") {
    try { operations = JSON.parse(operations); } catch { throw new Error(`${revisionType === "detail" ? "Detail" : "Specification"} 操作必须是有效 JSON。`); }
  }
  if (!siteCode) throw new Error("请选择国家站点。");
  if (!productName) throw new Error("请填写产品名称。");
  if (!Array.isArray(operations)) throw new Error("修订操作格式不正确。");
  if (revisionType === "detail" && !detailHtml.trim() && !operations.length) {
    throw new Error("请填写替换后的 Detail 代码，或至少填写一条 Detail 局部操作。");
  }
  if (revisionType === "specification" && !operations.length) throw new Error("请至少填写一条 Specification 操作。");
  const fieldLabel = revisionType === "detail" ? "Detail" : "Specification";
  operations = operations.map((item, index) => {
    const type = item?.type === "delete-frame-rate"
      ? "delete-frame-rate"
      : item?.type === "delete" ? "delete" : item?.type === "replace" ? "replace" : "";
    const targetText = String(item?.targetText ?? "");
    const replacementText = type === "replace" ? String(item?.replacementText ?? "") : "";
    if (!type) throw new Error(`第 ${index + 1} 条 ${fieldLabel} 操作类型无效。`);
    if (type === "delete-frame-rate" && revisionType !== "specification") {
      throw new Error("帧率删除操作只允许用于 Specification。");
    }
    if (type !== "delete-frame-rate" && !targetText) {
      throw new Error(`第 ${index + 1} 条 ${fieldLabel} 操作缺少目标内容。`);
    }
    if (type === "replace" && !replacementText) throw new Error(`第 ${index + 1} 条 ${fieldLabel} 替换操作缺少替换内容。`);
    if (type === "replace" && targetText === replacementText) throw new Error(`第 ${index + 1} 条 ${fieldLabel} 新旧内容不能相同。`);
    return { type, targetText, replacementText };
  });
  return { siteCode, productName, revisionType, detailHtml, operations };
}

function applyContentOperations(source, operations, fieldLabel = "Specification") {
  let value = source;
  const results = operations.map((operation) => {
    if (operation.type === "delete-frame-rate") {
      const frameRate = /\bMax\s*[.:：]?\s*\d+(?:\.\d+)?\s*fps\b\s*[;；]?\s*/gi;
      const matchCount = value.match(frameRate)?.length || 0;
      if (!matchCount) throw new Error(`${fieldLabel} 中未找到目标内容，已停止操作。`);
      value = value.replace(frameRate, "");
      return { ...operation, matchCount };
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
    specificationFieldName = ""
  ) {
    return page.evaluate(({
      overview,
      specifications,
      productDescription,
      specificationFieldNames,
      specificationFieldName
    }) => {
      const normalizeField = (value) => String(value || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "");
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
      field.value = specifications;
      scope.vm.basic.summary = productDescription;
      (scope.$root || scope).$applyAsync?.();
      const data = scope.md.toModel(scope.vm);
      data.goods_id = scope.goodsId;
      return data;
    }, {
      overview,
      specifications,
      productDescription,
      specificationFieldNames: [
        ...SPECIFICATION_DETAIL_FIELD_NAMES,
        ...Object.values(SITE_SPECIFICATION_TITLES).map(normalizeDetailFieldName)
      ],
      specificationFieldName
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
    const specifications = buildPcSpecificationHtml(language, source.image, specificationTitle);
    const fallbackOptions = Object.prototype.hasOwnProperty.call(options, "fallbackDescription")
      ? { fallbackDescription: options.fallbackDescription }
      : options.allowSourceDescriptionFallback
        ? { fallbackDescription: source.snapshot.productDescription }
        : {};
    const productDescription = resolveProductDescription(parsedDatasheet, target, fallbackOptions);
    return { language: { ...language, title: specificationTitle }, specifications, productDescription };
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
      sourceMismatches: plan.sourceMismatches.slice(0, 50)
    };
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
        : { value: request.detailHtml, results: [] })
      : { value: before.detail.overview, results: [] };
    const fingerprint = hashValue(JSON.stringify({
      goodsId: before.goodsId,
      detail: before.detail.overview,
      specifications: before.detail.specifications
    }));
    return { request, site, session, before, detail, specification, fingerprint };
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
      detailOperations: prepared.detail.results,
      specificationOperations: prepared.specification.results
    };
  }

  async function submitDirectRevision(body, logs, existingSession) {
    const prepared = await prepareDirectRevision(body, logs, existingSession);
    if (!body?.fingerprint || body.fingerprint !== prepared.fingerprint) {
      throw new Error("产品内容在预览后发生变化，请重新预览后再提交。");
    }
    const payload = await buildSavePayload(
      prepared.session.page,
      prepared.detail.value,
      prepared.specification.value,
      prepared.before.productDescription,
      prepared.before.detail.specificationsFieldName
    );
    const save = await postProductUpdate(prepared.session.page, payload);
    const readback = await verifySavedProduct(
      prepared.session.page,
      prepared.request.productName,
      logs,
      (snapshot) => {
        const detail = snapshot.detail.overview === prepared.detail.value;
        const specification = snapshot.detail.specifications === prepared.specification.value;
        return { passed: detail && specification, detail, specification };
      }
    );
    const after = readback.snapshot;
    if (!readback.verification.passed) {
      throw new Error("保存后回读不一致：Detail 或 Specification 未正确更新。");
    }
    return {
      mode: "product-direct-revision-submit",
      site: prepared.site,
      productName: prepared.request.productName,
      goodsId: after.goodsId,
      save,
      backendCheck: { status: "passed", detail: "passed", specification: "passed" }
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
          { ...(body || {}), siteCode: site.siteCode, productName },
          logs,
          session
        );
        const changed = result.detailChanged || result.specificationChanged;
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
          { ...(body || {}), siteCode, productName, fingerprint },
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
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const request = validateRevisionRequest(body, sites, { ignoreSourceSite: publishing });
    const parsedWorkbook = parseSpecificationWorkbook(excelFile.path);
    const parsedDatasheet = parseLanguageDatasheet(languageDatasheetFile.path);
    const source = publishing ? null : await readSource(request, body, logs);
    const results = [];
    logLine(logs, `开始批量预览 ${request.targets.length} 个目标站点。`);

    for (const target of request.targets) {
      let languagePackage = null;
      try {
        const session = await prepareSiteSession(target.site, body, logs);
        let targetSource = source;
        let current = null;
        let copySource = null;
        let detailChanged = true;
        let specificationChanged = true;
        let descriptionChanged = true;
        if (publishing) {
          const existing = await productExistsInCurrentSite(
            session.page,
            request.productName,
            logs
          );
          if (existing.exists) {
            throw new Error("目标站点已经存在该产品；请使用产品修订同步，避免重复复制。");
          }
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
        } else {
          current = await readProductSnapshot(session.page, request.productName, logs);
        }
        const desired = buildTargetRevision(
          parsedWorkbook,
          parsedDatasheet,
          target,
          targetSource,
          {
            fallbackDescription: publishing
              ? targetSource.snapshot.productDescription
              : current.productDescription
          }
        );
        if (publishing) {
          detailChanged = false;
          specificationChanged = targetSource.snapshot.detail.specifications !== desired.specifications;
          descriptionChanged = !desired.productDescription.inherited;
        } else {
          detailChanged = current.detail.overview !== source.snapshot.detail.overview;
          specificationChanged = current.detail.specifications !== desired.specifications;
          descriptionChanged = current.productDescription !== desired.productDescription.description;
        }
        languagePackage = await prepareLanguagePackage(
          session,
          target,
          parsedDatasheet,
          logs
        );
        const languagePackageSummary = summarizeLanguagePackagePlan(languagePackage.plan);
        if (!languagePackage.plan.safe) {
          results.push({
            status: "failed",
            site: target.site,
            authenticatedIdentity: session.authenticatedIdentity,
            goodsId: current?.goodsId || "",
            editUrl: current?.editUrl || "",
            copyRequired: publishing,
            copySource,
            localeHeader: desired.language.header,
            detailChanged,
            specificationChanged,
            descriptionChanged,
            languagePackage: {
              ...languagePackageSummary,
              langCode: languagePackage.downloaded.langCode,
              sourceFingerprint: languagePackage.packageInfo.contentFingerprint
            },
            error: "语言包字段预检未通过，已阻止该站点保存和上传。"
          });
          continue;
        }
        const languagePackageChanged = languagePackage.plan.changedCellCount > 0;
        results.push({
          status: revisionPreviewStatus({
            publishing,
            detailChanged,
            specificationChanged,
            descriptionChanged,
            languagePackageChanged
          }),
          site: target.site,
          authenticatedIdentity: session.authenticatedIdentity,
          goodsId: current?.goodsId || "",
          editUrl: current?.editUrl || "",
          copyRequired: publishing,
          copySource,
          localeHeader: desired.language.header,
          detailChanged,
          specificationChanged,
          descriptionChanged,
          currentProductDescription: current?.productDescription || "",
          desiredProductDescription: desired.productDescription.description,
          productDescriptionHeader: desired.productDescription.translationHeader,
          currentOverviewLength: current?.detail.overview.length || 0,
          desiredOverviewLength: targetSource.snapshot.detail.overview.length,
          currentSpecificationLength: current?.detail.specifications.length || 0,
          desiredSpecificationLength: desired.specifications.length,
          languagePackage: {
            ...languagePackageSummary,
            langCode: languagePackage.downloaded.langCode,
            sourceFingerprint: languagePackage.packageInfo.contentFingerprint
          }
        });
      } catch (error) {
        results.push({
          status: "failed",
          site: target.site,
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
      source: publishing ? null : {
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
          const translationHeader = resolveDatasheetLanguage(
            entry.parsed,
            target,
            SITE_LANGUAGE_NEEDLES
          );
          const plan = planLanguagePackageUpdates(packageInfo, entry.parsed, translationHeader);
          assertSafePlan(plan);
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
                throw new Error(
                  `${entry.productName} 语言包上传后仍有 ${plan.changedCellCount} 个单元格未更新。`
                );
              }
            }
          } finally {
            removeTemporaryFile(verification.filePath);
          }
        }
        logLine(logs, `${target.site.name} 批量语言包已一次上传并回读核验通过。`);
        results.push({ status: "completed", site: target.site, changedCellCount });
      } catch (error) {
        logLine(logs, `${target.site.name} 批量语言包处理失败：${error?.message || String(error)}`);
        results.push({ status: "failed", site: target.site, error: error?.message || String(error) });
      } finally {
        removeTemporaryFile(downloaded?.filePath);
        removeTemporaryFile(generated?.filePath);
      }
    }
    if (results.some((item) => item.status === "failed")) {
      throw new Error(results.find((item) => item.status === "failed").error);
    }
    return { results };
  }

  async function submit(body, excelFile, languageDatasheetFile, logs, options = {}) {
    const publishing = options.publishing === true;
    const skipLanguagePackage = options.skipLanguagePackage === true;
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const request = validateRevisionRequest(body, sites, { ignoreSourceSite: publishing });
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
    const source = publishing ? null : await readSource(request, body, logs);
    if (!publishing) {
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
        detail: "pending",
        specification: "pending",
        description: "pending",
        languagePackage: "pending"
      };
      try {
        const session = await prepareSiteSession(target.site, body, logs);
        let targetSource = source;
        let copy = null;
        let before = null;
        if (publishing) {
          const existing = await productExistsInCurrentSite(
            session.page,
            request.productName,
            logs
          );
          if (existing.exists) {
            throw new Error("目标站点已经存在该产品；已阻止重复复制，请改用产品修订同步。");
          }
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
        if (!before) before = await readProductSnapshot(session.page, request.productName, logs);
        const desired = buildTargetRevision(
          parsedWorkbook,
          parsedDatasheet,
          target,
          targetSource,
          { fallbackDescription: before.productDescription }
        );
        const detailChanged = before.detail.overview !== targetSource.snapshot.detail.overview;
        const specificationChanged = before.detail.specifications !== desired.specifications;
        const descriptionChanged = before.productDescription
          !== desired.productDescription.description;
        if (!skipLanguagePackage) {
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
        }
        const languagePackageChanged = !skipLanguagePackage
          && languagePackage.plan.changedCellCount > 0;
        if (!publishing && !detailChanged && !specificationChanged
          && !descriptionChanged && !languagePackageChanged) {
          components.detail = "no-change";
          components.specification = "no-change";
          components.description = "no-change";
          components.languagePackage = skipLanguagePackage ? "batch-passed" : "no-change";
          results.push({
            status: "no-change",
            site: target.site,
            goodsId: before.goodsId,
            localeHeader: desired.language.header,
            languagePackageHeader: languagePackage.translationHeader,
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
        if (detailChanged || specificationChanged || descriptionChanged) {
          await readProductSnapshot(session.page, request.productName, logs);
          const payload = await buildSavePayload(
            session.page,
            targetSource.snapshot.detail.overview,
            desired.specifications,
            desired.productDescription.description,
            before.detail.specificationsFieldName
          );
          save = await postProductUpdate(session.page, payload);
          const readback = await verifySavedProduct(
            session.page,
            request.productName,
            logs,
            (snapshot) => {
              const detail = snapshot.detail.overview === targetSource.snapshot.detail.overview;
              const specification = snapshot.detail.specifications === desired.specifications;
              const description = snapshot.productDescription === desired.productDescription.description;
              return { passed: detail && specification && description, detail, specification, description };
            }
          );
          after = readback.snapshot;
          const detailVerified = readback.verification.detail;
          const specificationVerified = readback.verification.specification;
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
          if (!detailVerified || !specificationVerified || !descriptionVerified) {
            throw new Error(
              `保存后回读不一致：Detail ${detailVerified ? "通过" : "失败"}，`
              + `Specification ${specificationVerified ? "通过" : "失败"}，`
              + `Product Description ${descriptionVerified ? "通过" : "失败"}。`
            );
          }
        } else {
          components.detail = "no-change";
          components.specification = "no-change";
          components.description = "no-change";
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
              throw new Error(
                `语言包上传后回读仍有 ${verificationPlan.changedCellCount} 个单元格未更新。`
              );
            }
          } finally {
            removeTemporaryFile(verification.filePath);
          }
          components.languagePackage = "passed";
          logLine(
            logs,
            `${target.site.name} 语言包重新上传并再次下载核验通过。`
          );
        } else {
          components.languagePackage = skipLanguagePackage ? "batch-passed" : "no-change";
        }
        results.push({
          status: "completed",
          site: target.site,
          goodsId: after.goodsId,
          editUrl: after.editUrl,
          localeHeader: desired.language.header,
          languagePackageHeader: languagePackage?.translationHeader || target.languagePackageHeader,
          detailChanged,
          specificationChanged,
          descriptionChanged,
          productDescriptionHeader: desired.productDescription.translationHeader,
          languagePackageChanged,
          copy,
          save,
          languagePackageUpload,
          languagePackage: languagePackage ? summarizeLanguagePackagePlan(languagePackage.plan) : null,
          components
        });
      } catch (error) {
        results.push({
          status: "failed",
          site: target.site,
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
  specificationTitleForSite,
  SPECIFICATION_DETAIL_FIELD_NAMES,
  normalizeDetailFieldName,
  findSpecificationDetailField,
  productSnapshotStabilitySignature,
  retryProductReadback,
  extractSpecificationImage,
  parseSpecificationWorkbook,
  resolveWorkbookLanguage,
  buildPcSpecificationHtml,
  parseTargets,
  validateRevisionRequest,
  readDetailFromPcView,
  revisionPreviewStatus,
  normalizeInternationalImageUrl,
  internationalListSource,
  resolveProductDescription,
  validateDirectRevision,
  applyContentOperations,
  applySpecificationOperations,
  buildCommonRevisionTargets,
  createProductRevisionSyncFeature
};
