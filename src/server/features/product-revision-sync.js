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

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDetailFieldName(value) {
  return normalize(value).toLowerCase().replace(/[\s_-]+/g, "");
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
  const preferred = tags.find((tag) =>
    /(?:^|\s)pro-img__src(?:\s|$)/i.test(readTagAttribute(tag, "class"))
  ) || tags[0];
  const src = readTagAttribute(preferred, "src").trim();
  const alt = readTagAttribute(preferred, "alt");
  if (!src) {
    throw new Error("国际站 Specification 图片缺少 src，无法生成目标站点代码。");
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

function buildPcSpecificationHtml(language, image) {
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

  return [
    '<div class="pc-content">',
    '  <div class="p960">',
    '    <div class="pro-img">',
    `      <img class="pro-img__src" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}">`,
    "    </div>",
    `    <div class="pro-title">${escapeHtml(language.title || "Specifications")}</div>`,
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

function validateRevisionRequest(body, allSites) {
  const productName = normalize(body?.productName);
  const sourceSiteCode = normalize(body?.sourceSiteCode || "hq").toLowerCase();
  const targets = parseTargets(body?.targetsJson ?? body?.targets ?? body?.targetSites);
  if (!productName) throw new Error("请填写产品名称。");
  if (!targets.length) throw new Error("请至少选择一个目标站点。");
  if (targets.length > 20) throw new Error("一次最多同步 20 个目标站点。");
  const byCode = new Map(allSites.map((site) => [site.siteCode, site]));
  const sourceSite = byCode.get(sourceSiteCode);
  if (!sourceSite) throw new Error(`没有找到源站点：${sourceSiteCode}。`);
  const resolvedTargets = targets.map((target) => {
    if (target.siteCode === sourceSiteCode) {
      throw new Error("目标站点不能与源站点相同。");
    }
    const site = byCode.get(target.siteCode);
    if (!site) throw new Error(`没有找到目标站点：${target.siteCode}。`);
    return { ...target, site };
  });
  return { productName, sourceSite, targets: resolvedTargets };
}

function readDetailFromPcView(pcView) {
  const specificationsField = (pcView?.customs || []).find(
    (field) => normalizeDetailFieldName(field?.name) === "specifications"
  );
  return {
    overview: String(pcView?.summary || ""),
    specifications: String(specificationsField?.value || ""),
    specificationsFound: Boolean(specificationsField)
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
      forceShopRelogin: true,
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);
    const authenticatedIdentity = await page.evaluate(() =>
      document.querySelector(".clearfix.login-bar")?.innerText
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

  async function readProductSnapshot(page, productName, logs) {
    const editInfo = await openProductEditorByName(page, productName, logs);
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
    const snapshot = await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      scope.vm.tabNav.moveTo(2);
      (scope.$root || scope).$applyAsync?.();
      return {
        goodsId: String(scope.goodsId),
        pcView: JSON.parse(JSON.stringify(scope.vm.pcView || {}))
      };
    });
    const detail = readDetailFromPcView(snapshot.pcView);
    if (!detail.specificationsFound) {
      throw new Error(`${productName} 的 Detail 中没有找到 Specifications 字段。`);
    }
    return { ...snapshot, editUrl: editInfo.editUrl, detail };
  }

  async function buildSavePayload(page, overview, specifications) {
    return page.evaluate(({ overview, specifications }) => {
      const normalizeField = (value) => String(value || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "");
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const field = (scope.vm.pcView?.customs || []).find(
        (item) => normalizeField(item?.name) === "specifications"
      );
      if (!field) throw new Error("Detail 中没有找到 Specifications 字段。");
      scope.vm.pcView.summary = overview;
      field.value = specifications;
      (scope.$root || scope).$applyAsync?.();
      const data = scope.md.toModel(scope.vm);
      data.goods_id = scope.goodsId;
      return data;
    }, { overview, specifications });
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
    const fingerprint = hashValue(JSON.stringify({
      productName: request.productName,
      goodsId: snapshot.goodsId,
      overview: snapshot.detail.overview,
      specifications: snapshot.detail.specifications
    }));
    return {
      session,
      snapshot,
      image,
      fingerprint
    };
  }

  function buildTargetRevision(parsedWorkbook, target, source) {
    const language = resolveWorkbookLanguage(parsedWorkbook, target);
    const specifications = buildPcSpecificationHtml(language, source.image);
    return { language, specifications };
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
      sourceMismatches: plan.sourceMismatches.slice(0, 50)
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

  async function prepareLanguagePackage(
    session,
    target,
    parsedDatasheet,
    logs
  ) {
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
      return { downloaded, packageInfo, plan, translationHeader };
    } catch (error) {
      removeTemporaryFile(downloaded.filePath);
      throw error;
    }
  }

  async function preview(body, excelFile, languageDatasheetFile, logs) {
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const request = validateRevisionRequest(body, sites);
    const parsedWorkbook = parseSpecificationWorkbook(excelFile.path);
    const parsedDatasheet = parseLanguageDatasheet(languageDatasheetFile.path);
    const source = await readSource(request, body, logs);
    const results = [];

    for (const target of request.targets) {
      let languagePackage = null;
      try {
        const desired = buildTargetRevision(parsedWorkbook, target, source);
        const session = await prepareSiteSession(target.site, body, logs);
        const current = await readProductSnapshot(session.page, request.productName, logs);
        const detailChanged = current.detail.overview !== source.snapshot.detail.overview;
        const specificationChanged = current.detail.specifications !== desired.specifications;
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
            goodsId: current.goodsId,
            editUrl: current.editUrl,
            localeHeader: desired.language.header,
            detailChanged,
            specificationChanged,
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
          status: detailChanged || specificationChanged || languagePackageChanged
            ? "ready"
            : "no-change",
          site: target.site,
          authenticatedIdentity: session.authenticatedIdentity,
          goodsId: current.goodsId,
          editUrl: current.editUrl,
          localeHeader: desired.language.header,
          detailChanged,
          specificationChanged,
          currentOverviewLength: current.detail.overview.length,
          desiredOverviewLength: source.snapshot.detail.overview.length,
          currentSpecificationLength: current.detail.specifications.length,
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
      mode: "product-revision-sync-preview",
      productName: request.productName,
      source: {
        site: request.sourceSite,
        goodsId: source.snapshot.goodsId,
        editUrl: source.snapshot.editUrl,
        authenticatedIdentity: source.session.authenticatedIdentity,
        overviewLength: source.snapshot.detail.overview.length,
        specificationLength: source.snapshot.detail.specifications.length,
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

  async function submit(body, excelFile, languageDatasheetFile, logs) {
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const request = validateRevisionRequest(body, sites);
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
    const source = await readSource(request, body, logs);
    const expectedSourceFingerprint = normalize(body?.expectedSourceFingerprint);
    if (!expectedSourceFingerprint || expectedSourceFingerprint !== source.fingerprint) {
      throw new Error("国际站产品 Detail 在预览后发生变化，请重新预览。");
    }

    const results = [];
    for (const target of request.targets) {
      logLine(logs, `同步目标站点：${target.site.name} (${target.site.siteCode})`);
      let languagePackage = null;
      let generatedPackage = null;
      const components = {
        detail: "pending",
        specification: "pending",
        languagePackage: "pending"
      };
      try {
        const desired = buildTargetRevision(parsedWorkbook, target, source);
        const session = await prepareSiteSession(target.site, body, logs);
        const before = await readProductSnapshot(session.page, request.productName, logs);
        const detailChanged = before.detail.overview !== source.snapshot.detail.overview;
        const specificationChanged = before.detail.specifications !== desired.specifications;
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
        const languagePackageChanged = languagePackage.plan.changedCellCount > 0;
        if (!detailChanged && !specificationChanged && !languagePackageChanged) {
          components.detail = "no-change";
          components.specification = "no-change";
          components.languagePackage = "no-change";
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
          const extension = path.extname(languagePackage.downloaded.fileName) || ".xls";
          const outputPath = path.join(
            outputDirectory,
            `${Date.now()}-${target.site.siteCode}-${languagePackage.downloaded.langCode}${extension}`
          );
          generatedPackage = writeUpdatedLanguagePackage(
            languagePackage.packageInfo,
            languagePackage.plan,
            outputPath
          );
        }

        let save = null;
        let after = before;
        if (detailChanged || specificationChanged) {
          await readProductSnapshot(session.page, request.productName, logs);
          const payload = await buildSavePayload(
            session.page,
            source.snapshot.detail.overview,
            desired.specifications
          );
          save = await postProductUpdate(session.page, payload);
          after = await readProductSnapshot(session.page, request.productName, logs);
          const detailVerified = after.detail.overview === source.snapshot.detail.overview;
          const specificationVerified = after.detail.specifications === desired.specifications;
          components.detail = detailChanged
            ? (detailVerified ? "passed" : "failed")
            : "no-change";
          components.specification = specificationChanged
            ? (specificationVerified ? "passed" : "failed")
            : "no-change";
          if (!detailVerified || !specificationVerified) {
            throw new Error(
              `保存后回读不一致：Detail ${detailVerified ? "通过" : "失败"}，`
              + `Specification ${specificationVerified ? "通过" : "失败"}。`
            );
          }
        } else {
          components.detail = "no-change";
          components.specification = "no-change";
        }

        let languagePackageUpload = null;
        if (languagePackageChanged) {
          languagePackageUpload = await languagePackageFeature.uploadLanguagePackageForPage(
            session.page,
            {
              ...generatedPackage,
              fileName: languagePackage.downloaded.fileName,
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
        } else {
          components.languagePackage = "no-change";
        }
        results.push({
          status: "completed",
          site: target.site,
          goodsId: after.goodsId,
          editUrl: after.editUrl,
          localeHeader: desired.language.header,
          languagePackageHeader: languagePackage.translationHeader,
          detailChanged,
          specificationChanged,
          languagePackageChanged,
          save,
          languagePackageUpload,
          languagePackage: summarizeLanguagePackagePlan(languagePackage.plan),
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

    return {
      mode: "product-revision-sync-submit",
      productName: request.productName,
      sourceSite: request.sourceSite,
      targetCount: results.length,
      completedCount: results.filter((result) => result.status === "completed").length,
      noChangeCount: results.filter((result) => result.status === "no-change").length,
      failedCount: results.filter((result) => result.status === "failed").length,
      results
    };
  }

  return { preview, submit };
}

module.exports = {
  SITE_LANGUAGE_NEEDLES,
  normalizeDetailFieldName,
  extractSpecificationImage,
  parseSpecificationWorkbook,
  resolveWorkbookLanguage,
  buildPcSpecificationHtml,
  parseTargets,
  validateRevisionRequest,
  readDetailFromPcView,
  createProductRevisionSyncFeature
};
