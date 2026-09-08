const crypto = require("crypto");
const {
  inspectTargetField,
  inspectTargetFieldNative,
  targetRevisionFingerprint,
  writeTargetFieldUpdateNative
} = require("./language-package-targeted-edit");
const {
  parseLanguageDatasheet,
  readLanguagePackage,
  planLanguagePackageUpdates,
  writeUpdatedLanguagePackageNative
} = require("./language-package-workbook");
const { generateLocalI18nDatasheet } = require("./local-i18n-datasheet");

const SITE_LANGUAGE_NEEDLES = {
  hq: ["english"], us: ["english"], uk: ["english"], eu: ["english"],
  ca: ["english"], au: ["english"], in: ["english"], my: ["english"], af: ["english"],
  cis: ["russian"], de: ["german", "deutsch"], fr: ["french", "france"],
  be: ["french", "france"], it: ["italian", "italiano"], es: ["spanish-", "espanol"],
  pl: ["polish", "polski"], cz: ["czech"], nl: ["dutch", "nederlands"],
  tr: ["turkish"], ro: ["romanian"], th: ["thai"], vn: ["vietnamese"],
  jp: ["japanese"], kr: ["korean"], id: ["indonesian", "indonesia"],
  br: ["brazilian portuguese", "portuguese - brazil"],
  la: ["spanish(latin)", "latin america"], arg: ["spanish(latin)", "latin america"],
  ar: ["arabic"], sa: ["arabic"], cn: ["chinese", "繁体中文", "简体中文"]
};
const ENGLISH_SOURCE_HEADER = "English (Source)";

function normalizedLanguageText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function languageRowScore(candidate, siteCode) {
  const code = String(siteCode || "").trim().toLowerCase();
  const langCode = String(candidate?.langCode || "").trim().toLowerCase();
  const text = normalizedLanguageText(candidate?.rowText);
  const needles = (SITE_LANGUAGE_NEEDLES[code] || [code]).map(normalizedLanguageText);
  let score = needles.reduce((total, needle) => total + (needle && text.includes(needle) ? 20 : 0), 0);

  // The backend can expose two packages in the same account, e.g. fr-CA and
  // fr-FR. The locale region is the strongest signal for the target site.
  if (code && new RegExp(`-${code}$`, "i").test(langCode)) score += 100;
  if (code && text.includes(`-${code}store`)) score += 40;
  return score;
}

function chooseLanguageRowCandidate(candidates, siteCode) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  return candidates
    .map((candidate, index) => ({ candidate, index, score: languageRowScore(candidate, siteCode) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0].candidate;
}

function createLanguagePackageFeature(deps) {
  const {
    fs,
    path,
    logLine,
    visibleTextSafe,
    readCampaignConfig,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    SHOP_DASHBOARD_URL
  } = deps;

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeDownloadName(value) {
  const name = path.basename(String(value || "language-package.xlsx"));
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function multipartField(postData, fieldName) {
  const source = String(postData || "");
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`name="${escaped}"\\r?\\n(?:[^\\r\\n]*\\r?\\n)*\\r?\\n([^\\r\\n]*)`, "i")
  );
  return match ? match[1].trim() : "";
}

async function findLanguageRow(page, siteCode) {
  const rows = page.locator("tr");
  const rowCount = await rows.count();
  const rowCandidates = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const actions = row.locator("a,button,[ng-click]");
    const labels = await actions.evaluateAll((elements) => elements.map((element) => [
      element.innerText || element.textContent || "",
      element.getAttribute("title") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("ng-click") || "",
      element.getAttribute("href") || ""
    ].join(" ").replace(/\s+/g, " ").trim())).catch(() => []);
    const downloadIndex = labels.findIndex((label) => /download/i.test(label));
    const editIndex = labels.findIndex((label) => /edit/i.test(label));
    if (downloadIndex >= 0 && editIndex >= 0) {
      const langCode = await actions.nth(downloadIndex).evaluate((element) => {
        try {
          const scope = window.angular?.element(element).scope();
          return String(scope?.lang?.lang_code || scope?.langCode || "");
        } catch {
          return "";
        }
      }).catch(() => "");
      rowCandidates.push({
        row,
        rowText: (await row.innerText().catch(() => "")).replace(/\s+/g, " ").trim(),
        langCode,
        downloadAction: actions.nth(downloadIndex),
        editAction: actions.nth(editIndex)
      });
    }
  }
  if (rowCandidates.length) return chooseLanguageRowCandidate(rowCandidates, siteCode);
  const globalActions = page.locator("a:visible,button:visible,[ng-click]:visible");
  const globalMetadata = await globalActions.evaluateAll((elements) => elements.map((element) => ({
    text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
    ngClick: element.getAttribute("ng-click") || "",
    title: element.getAttribute("title") || "",
    langCode: (() => {
      try {
        const scope = window.angular?.element(element).scope();
        return String(scope?.lang?.lang_code || scope?.langCode || "");
      } catch {
        return "";
      }
    })(),
    rowText: (() => {
      let current = element.parentElement;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const text = (current.innerText || current.textContent || "")
          .replace(/\s+/g, " ").trim();
        if (/download/i.test(text) && /edit/i.test(text) && text.length < 500) return text;
      }
      return "";
    })()
  }))).catch(() => []);
  const downloadIndexes = globalMetadata
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => /^download$/i.test(item.text) || /^download\s*\(/i.test(item.ngClick));
  const selectedCandidate = chooseLanguageRowCandidate(
    downloadIndexes.map(({ item, index }) => ({
      rowText: item.rowText || item.text || item.ngClick,
      langCode: item.langCode,
      actionIndex: index,
      metadata: item
    })),
    siteCode
  );
  const matchedDownload = selectedCandidate
    ? { item: selectedCandidate.metadata, index: selectedCandidate.actionIndex }
    : downloadIndexes[0];
  const downloadIndex = matchedDownload?.index ?? -1;
  const selectedDownload = matchedDownload?.item;
  const editIndex = globalMetadata.findIndex((item) => {
    const isEdit = /^edit$/i.test(item.text) || /^edit\s*\(/i.test(item.ngClick);
    if (!isEdit) return false;
    if (selectedDownload?.langCode) return item.langCode === selectedDownload.langCode;
    return item.rowText && item.rowText === selectedDownload?.rowText;
  });
  if (downloadIndex >= 0 && editIndex >= 0) {
    const downloadAction = globalActions.nth(downloadIndex);
    return {
      row: null,
      rowText: selectedDownload?.rowText
        || selectedDownload?.langCode
        || "当前语言包",
      langCode: selectedDownload?.langCode || "",
      downloadAction,
      editAction: globalActions.nth(editIndex)
    };
  }
  const diagnostics = await page.evaluate(() => [...document.querySelectorAll(
    "a,button,[ng-click],[title],[aria-label]"
  )].filter((element) => {
    const visible = !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    const label = [
      element.innerText || element.textContent || "",
      element.getAttribute("title") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("ng-click") || "",
      element.getAttribute("href") || ""
    ].join(" ");
    return visible && /download|edit|language/i.test(label);
  }).slice(0, 40).map((element) => ({
    tag: element.tagName,
    text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
    title: element.getAttribute("title") || "",
    ariaLabel: element.getAttribute("aria-label") || "",
    ngClick: element.getAttribute("ng-click") || "",
    href: element.getAttribute("href") || "",
    rowText: (element.closest("tr")?.innerText || "").replace(/\s+/g, " ").trim()
  }))).catch(() => []);
  const visibleText = await page.locator("body").innerText().catch(() => "");
  throw new Error(
    "Language Management 中没有找到同时包含 Download 和 Edit 的语言行。"
    + `候选控件：${JSON.stringify(diagnostics)}；页面文本：${visibleText.slice(0, 1200)}`
  );
}

async function prepareLanguagePage(body, logs) {
  const config = readCampaignConfig();
  const site = requireSingleCampaignSite(config, body);
  const context = await getShopContext();
  let page = await getOpenPage(context);
  page.setDefaultTimeout(30000);
  page = await ensureShopLoggedIn(page, {
    ...body,
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);
  await page.goto("https://shop.ezvizlife.com/language/index", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  }).catch(() => {});
  await page.waitForTimeout(2500);
  logLine(logs, `已打开 ${site.name} (${site.siteCode}) Language Management。`);
  return { site, page };
}

async function downloadLanguagePackage(page, rowInfo, logs) {
  const href = await rowInfo.downloadAction.getAttribute("href").catch(() => "");
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await rowInfo.downloadAction.click();
  const download = await downloadPromise;
  const outputDir = path.resolve("runtime", "language-package-roundtrip");
  fs.mkdirSync(outputDir, { recursive: true });
  let fileName;
  let filePath;
  let sourceUrl = "";
  if (download) {
    fileName = safeDownloadName(download.suggestedFilename());
    filePath = path.join(outputDir, `${Date.now()}-${fileName}`);
    await download.saveAs(filePath);
    sourceUrl = download.url();
  } else if (href && !/^javascript:/i.test(href)) {
    const resolvedUrl = new URL(href, page.url()).href;
    const response = await page.request.get(resolvedUrl, { timeout: 60000 });
    if (!response.ok()) {
      throw new Error(`语言包下载失败（HTTP ${response.status()}）。`);
    }
    const disposition = await response.headerValue("content-disposition");
    const named = disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1];
    fileName = safeDownloadName(named ? decodeURIComponent(named) : "language-package.xlsx");
    filePath = path.join(outputDir, `${Date.now()}-${fileName}`);
    fs.writeFileSync(filePath, await response.body());
    sourceUrl = resolvedUrl;
  } else {
    throw new Error("点击 Download 后没有捕获到浏览器下载，按钮也没有可用 href。");
  }
  const stat = fs.statSync(filePath);
  const result = {
    fileName,
    filePath,
    sourceUrl,
    size: stat.size,
    sha256: sha256File(filePath)
  };
  logLine(logs, `语言包已下载：${fileName} / ${stat.size} bytes / SHA-256 ${result.sha256}`);
  return result;
}

async function uploadLanguagePackageThroughUi(page, rowInfo, fileInfo, logs) {
  const captured = [];
  let uploadRequest = null;
  const onRequest = (request) => {
    if (!/\/language\/upload(?:\?|$)/i.test(request.url())) return;
    uploadRequest = request;
    captured.push({
      type: "request",
      method: request.method(),
      url: request.url(),
      contentType: request.headers()["content-type"] || "",
      postDataSize: Buffer.byteLength(request.postData() || "")
    });
  };
  const onResponse = async (response) => {
    if (!/\/language\/upload(?:\?|$)/i.test(response.url())) return;
    captured.push({
      type: "response",
      status: response.status(),
      url: response.url()
    });
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await rowInfo.editAction.click();
    await page.waitForTimeout(1200);
    const visibleModal = page.locator(".modal:visible, [role='dialog']:visible").last();
    const modalCount = await visibleModal.count().catch(() => 0);
    const scope = modalCount ? visibleModal : page.locator("body");
    const fileInputs = scope.locator(
      'div[id^="rt_"] input[type="file"], input[type="file"][name="file"], input[type="file"]'
    );
    const inputCount = await fileInputs.count();
    if (!inputCount) throw new Error("Edit 弹窗中没有找到语言包文件选择控件。");
    const fileInput = fileInputs.last();
    const inputInfo = await fileInput.evaluate((input) => ({
      id: input.id || "",
      name: input.getAttribute("name") || "",
      accept: input.getAttribute("accept") || "",
      parentId: input.parentElement?.id || ""
    }));
    const modalLangCode = await scope.locator(
      'input[name="lang_code"], select[name="lang_code"], [ng-model*="lang_code"]'
    ).first().inputValue().catch(() => "");
    logLine(logs, "Edit 弹窗文件控件：" + JSON.stringify(inputInfo));

    const responsePromise = page.waitForResponse(
      (response) => /\/language\/upload(?:\?|$)/i.test(response.url()),
      { timeout: 60000 }
    ).catch(() => null);
    await fileInput.setInputFiles(fileInfo.filePath);
    await page.waitForTimeout(800);
    const confirmActions = scope.locator("button,a");
    const confirmTexts = await confirmActions.allInnerTexts().catch(() => []);
    const confirmIndex = confirmTexts.findIndex((text) =>
      /^(confirm|ok|确定|确认|upload)$/i.test(String(text).trim())
    );
    if (confirmIndex < 0) {
      throw new Error(
        "Edit 弹窗中没有找到 Confirm/Upload 按钮。候选项："
        + confirmTexts.map((text) => String(text).trim()).filter(Boolean).slice(0, 20).join("、")
      );
    }
    await confirmActions.nth(confirmIndex).click();
    const response = await responsePromise;
    if (!response) throw new Error("点击确认后没有捕获到 /language/upload 响应。");
    const responseText = await response.text().catch(() => "");
    if (!response.ok()) {
      throw new Error(`UI 语言包上传失败（HTTP ${response.status()}）：${responseText.slice(0, 300)}`);
    }
    const postData = uploadRequest?.postData() || "";
    const langCode = multipartField(postData, "lang_code") || modalLangCode;
    const uploadUrl = uploadRequest?.url() || response.url();
    const result = {
      status: response.status(),
      uploadUrl,
      method: uploadRequest?.method() || "POST",
      contentType: uploadRequest?.headers()["content-type"] || "",
      langCode,
      inputInfo,
      response: responseText.slice(0, 1000),
      captured
    };
    logLine(
      logs,
      `UI 原样回传完成：${result.method} ${uploadUrl} / HTTP ${result.status} / lang_code=${langCode || "未识别"}`
    );
    return result;
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}

async function verifyDirectLanguageUpload(page, uiResult, fileInfo, logs) {
  const langCode = String(uiResult.langCode || "").trim()
    || inferLangCodeFromFile({ originalname: fileInfo.fileName });
  if (!langCode) {
    throw new Error("无法从 UI 请求或下载文件名识别 lang_code，不能安全执行直接请求验证。");
  }
  const uploadUrl = uiResult.uploadUrl || "https://shop.ezvizlife.com/language/upload";
  let response;
  try {
    response = await page.request.post(uploadUrl, {
      multipart: {
        lang_code: langCode,
        file: {
          name: fileInfo.fileName,
          mimeType: /\.xlsx$/i.test(fileInfo.fileName)
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.ms-excel",
          buffer: fs.readFileSync(fileInfo.filePath)
        }
      },
      timeout: 60000
    });
  } catch (error) {
    const firstLine = String(error?.message || error).split(/\r?\n/)[0];
    throw new Error("直接请求网络失败：" + firstLine);
  }
  const responseText = await response.text().catch(() => "");
  if (!response.ok()) {
    throw new Error(
      `直接请求验证失败（HTTP ${response.status()}）：${responseText.slice(0, 300)}`
    );
  }
  const result = {
    equivalent: true,
    method: "POST",
    uploadUrl,
    langCode,
    status: response.status(),
    response: responseText.slice(0, 1000),
    fileName: fileInfo.fileName,
    size: fileInfo.size,
    sha256: sha256File(fileInfo.filePath)
  };
  logLine(logs, `直接请求验证通过：POST ${uploadUrl} / HTTP ${result.status}`);
  return result;
}

async function roundTripLanguagePackage(body, logs) {
  const session = await prepareLanguagePage(body, logs);
  const rowInfo = await findLanguageRow(session.page, session.site.siteCode);
  logLine(logs, "选中语言行：" + rowInfo.rowText);
  const downloaded = await downloadLanguagePackage(session.page, rowInfo, logs);
  const uiUpload = await uploadLanguagePackageThroughUi(
    session.page,
    rowInfo,
    downloaded,
    logs
  );
  const directRequest = body?.verifyDirectRequest === false
    || String(body?.verifyDirectRequest).toLowerCase() === "false"
    ? null
    : await verifyDirectLanguageUpload(session.page, uiUpload, downloaded, logs);
  return {
    mode: "download-ui-upload-direct-request-roundtrip",
    site: session.site,
    languageRow: rowInfo.rowText,
    downloaded,
    uiUpload,
    directRequest,
    currentUrl: session.page.url()
  };
}

async function downloadCurrentLanguagePackageForPage(page, site, logs) {
  await page.goto("https://shop.ezvizlife.com/language/index", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  }).catch(() => {});
  await page.waitForTimeout(2500);
  const rowInfo = await findLanguageRow(page, site?.siteCode);
  logLine(logs, `选中 ${site?.name || site?.siteCode || "当前站点"} 语言行：${rowInfo.rowText}`);
  const downloaded = await downloadLanguagePackage(page, rowInfo, logs);
  const langCode = String(rowInfo.langCode || "").trim()
    || inferLangCodeFromFile({ originalname: downloaded.fileName });
  if (!langCode) {
    throw new Error("无法从语言行或下载文件名识别 lang_code。");
  }
  return {
    ...downloaded,
    langCode,
    languageRow: rowInfo.rowText
  };
}

async function uploadLanguagePackageForPage(page, fileInfo, logs) {
  if (!fileInfo?.filePath || !fs.existsSync(fileInfo.filePath)) {
    throw new Error("待上传的语言包文件不存在。");
  }
  const langCode = String(fileInfo.langCode || "").trim()
    || inferLangCodeFromFile({ originalname: fileInfo.fileName });
  if (!langCode) throw new Error("待上传语言包缺少 lang_code。");
  const fileName = safeDownloadName(
    fileInfo.fileName || path.basename(fileInfo.filePath)
  );
  const response = await page.request.post(
    "https://shop.ezvizlife.com/language/upload",
    {
      multipart: {
        lang_code: langCode,
        file: {
          name: fileName,
          mimeType: /\.xlsx$/i.test(fileName)
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.ms-excel",
          buffer: fs.readFileSync(fileInfo.filePath)
        }
      },
      timeout: 60000
    }
  );
  const responseText = await response.text().catch(() => "");
  let responseJson = null;
  try {
    responseJson = JSON.parse(responseText);
  } catch {}
  const backendRejected = responseJson && (
    responseJson.status === false
    || Number(responseJson.code || 200) >= 400
  );
  if (!response.ok() || backendRejected) {
    throw new Error(
      responseJson?.msg
      || responseJson?.message
      || `语言包上传失败（HTTP ${response.status()}）：${responseText.slice(0, 300)}`
    );
  }
  logLine(logs, `语言包直接上传完成：${fileName} / lang_code=${langCode} / HTTP ${response.status()}`);
  return {
    uploadUrl: "https://shop.ezvizlife.com/language/upload",
    langCode,
    fileName,
    status: response.status(),
    response: responseJson || responseText.slice(0, 1000)
  };
}

async function probeLanguagePackageUpload(page, filePath, logs) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("语言包文件不存在：" + filePath);
  }
  const captured = [];
  const onRequest = (request) => {
    const url = request.url();
    if (!/ezvizlife\.com|language|upload|webuploader|xls|xlsx/i.test(url)) return;
    captured.push({
      type: "request",
      method: request.method(),
      url,
      postData: request.postData() || ""
    });
  };
  const onResponse = (response) => {
    const url = response.url();
    if (!/ezvizlife\.com|language|upload|webuploader|xls|xlsx/i.test(url)) return;
    captured.push({
      type: "response",
      status: response.status(),
      url
    });
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await page.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    logLine(logs, "进入后台首页，准备打开 Language Management。");
    const clickedLanguage = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find((el) => {
        const text = (el.innerText || el.textContent || "").trim();
        const href = el.getAttribute("href") || "";
        return text === "Language Management" || href === "/language/index";
      });
      if (!link) return false;
      link.click();
      return true;
    });
    if (!clickedLanguage) {
      await page.goto("https://shop.ezvizlife.com/language/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    }
    await page.waitForTimeout(3500);
    logLine(logs, "已进入 Language Management：" + page.url());

    const clickedEdit = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll("[ng-click], a, button")].filter((el) => {
        const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const ngClick = el.getAttribute("ng-click") || "";
        const text = (el.innerText || el.textContent || "").trim();
        return visible && (/edit\s*\(\s*lang\.lang_code\s*\)/i.test(ngClick) || /^edit$/i.test(text));
      });
      const target = candidates[0];
      if (!target) return { ok: false, reason: "没有找到 edit(lang.lang_code) 元素" };
      target.click();
      return {
        ok: true,
        text: (target.innerText || target.textContent || "").trim(),
        ngClick: target.getAttribute("ng-click") || ""
      };
    });
    if (!clickedEdit.ok) throw new Error(clickedEdit.reason || "没有找到语言编辑入口。");
    logLine(logs, "已点击语言编辑入口：" + JSON.stringify(clickedEdit));
    await page.waitForTimeout(3000);

    const inputSelector = 'div[id^="rt_"] input[type="file"], input[type="file"][name="file"], input[type="file"][accept*=".xls"]';
    const inputCount = await page.locator(inputSelector).count().catch(() => 0);
    if (!inputCount) throw new Error("没有找到语言包上传 input[type=file]。");
    const fileInput = page.locator(inputSelector).nth(inputCount - 1);
    const inputInfo = await page.evaluate((selector) => {
      return [...document.querySelectorAll(selector)].map((input, index) => {
        const parent = input.parentElement;
        const rect = parent?.getBoundingClientRect?.() || input.getBoundingClientRect();
        return {
          index,
          name: input.getAttribute("name") || "",
          accept: input.getAttribute("accept") || "",
          parentId: parent?.id || "",
          parentStyle: parent?.getAttribute("style") || "",
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      });
    }, inputSelector).catch(() => []);
    logLine(logs, "语言包上传 input 数量：" + inputCount + " / " + JSON.stringify(inputInfo));
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 15000 }).catch(() => null);
    const clickedUpload = await page.evaluate((selector) => {
      const inputs = [...document.querySelectorAll(selector)];
      const input = inputs[inputs.length - 1];
      const parent = input?.parentElement;
      const label = parent?.querySelector("label") || parent || input;
      if (!label) return false;
      label.click();
      return true;
    }, inputSelector);
    let chooser = clickedUpload ? await chooserPromise : null;
    if (chooser) {
      await chooser.setFiles(filePath);
      logLine(logs, "已通过文件选择器选择语言包文件：" + filePath);
    } else {
      await fileInput.setInputFiles(filePath);
      logLine(logs, "文件选择器未弹出，已直接设置语言包文件：" + filePath);
    }
    await page.waitForTimeout(1500);

    const clickedConfirm = await page.evaluate(() => {
      const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const buttons = [...document.querySelectorAll(".modal button, .modal a, button, a")].filter(visible);
      const target = buttons.find((el) => /^(Confirm|OK|确定|确认)$/i.test((el.innerText || el.textContent || "").trim()))
        || buttons.find((el) => /btn-primary|btn-confirm/.test(String(el.className || "")));
      if (!target) return { ok: false, buttons: buttons.map((el) => (el.innerText || el.textContent || "").trim()).filter(Boolean).slice(0, 20) };
      target.click();
      return { ok: true, text: (target.innerText || target.textContent || "").trim(), cls: String(target.className || "") };
    });
    logLine(logs, "点击语言包弹窗确认按钮：" + JSON.stringify(clickedConfirm));
    if (!clickedConfirm.ok) throw new Error("没有找到语言包弹窗 Confirm 按钮。");
    await page.waitForTimeout(12000);

    const visibleText = await visibleTextSafe(page, 1800);
    return {
      currentUrl: page.url(),
      filePath,
      captured,
      visibleText
    };
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}

function inferLangCodeFromFile(file) {
  const name = path.basename(file?.originalname || file?.filename || "");
  const match = name.match(/^([a-z]{2}(?:-[A-Z]{2})?)/);
  return match ? match[1] : "";
}

async function submitLanguagePackageToBackend(body, files, logs) {
  const config = readCampaignConfig();
  const site = requireSingleCampaignSite(config, body);
  const file = files?.languagePackage?.[0];
  if (!file?.path || !fs.existsSync(file.path)) {
    throw new Error("请先选择语言包 Excel 文件。");
  }

  const langCode = String(body.langCode || "").trim() || inferLangCodeFromFile(file);
  if (!langCode) {
    throw new Error("请填写语言代码，例如 en-US；也可以用 en-US.xlsx 这种文件名自动识别。");
  }

  const context = await getShopContext();
  const page = await getOpenPage(context);
  page.setDefaultTimeout(30000);
  const backendPage = await ensureShopLoggedIn(page, {
    ...body,
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);

  logLine(logs, "进入 Language Management 建立语言后台登录态。");
  await backendPage.goto("https://shop.ezvizlife.com/language/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await backendPage.waitForTimeout(2500);

  const fileBuffer = fs.readFileSync(file.path);
  logLine(logs, "直接提交语言包上传接口：/language/upload，lang_code=" + langCode);
  const response = await backendPage.request.post("https://shop.ezvizlife.com/language/upload", {
    multipart: {
      lang_code: langCode,
      file: {
        name: path.basename(file.originalname || file.filename || file.path),
        mimeType: /\.xlsx$/i.test(file.originalname || file.filename || "") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel",
        buffer: fileBuffer
      }
    },
    timeout: 60000
  });

  const responseText = await response.text().catch(() => "");
  let responseJson = null;
  try {
    responseJson = JSON.parse(responseText);
  } catch {}
  if (!response.ok()) {
    throw new Error("语言包上传接口返回异常：" + response.status() + " " + responseText.slice(0, 300));
  }

  logLine(logs, "语言包上传接口返回状态：" + response.status());
  await backendPage.goto("https://shop.ezvizlife.com/language/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await backendPage.waitForTimeout(1500);

  return {
    mode: "direct-post",
    site,
    langCode,
    fileName: file.originalname || file.filename,
    uploadUrl: "https://shop.ezvizlife.com/language/upload",
    status: response.status(),
    response: responseJson || responseText.slice(0, 1000),
    currentUrl: backendPage.url()
  };
}

function requestedSites(config, body) {
  let codes = body?.sites;
  if (typeof codes === "string") {
    try { codes = JSON.parse(codes); }
    catch { codes = codes.split(",").map((item) => item.trim()).filter(Boolean); }
  }
  const selected = new Set(Array.isArray(codes) ? codes.map(String) : []);
  return (config.sites || [])
    .filter((site) => site.enabled !== false)
    .filter((site) => !selected.size || selected.has(site.siteCode));
}

function expectedFingerprints(body) {
  if (!body?.expectedFingerprints) return {};
  if (typeof body.expectedFingerprints === "object") return body.expectedFingerprints;
  try { return JSON.parse(body.expectedFingerprints); }
  catch { throw new Error("语言包预览指纹格式不正确，请重新预览。"); }
}

function parseDatasheetTargets(body, sites, parsedDatasheet) {
  let requested = body?.targets;
  if (typeof requested === "string") {
    try { requested = JSON.parse(requested); }
    catch { throw new Error("站点与 Datasheet 语言列映射格式不正确。"); }
  }
  if (!Array.isArray(requested) || !requested.length) {
    throw new Error("请至少选择一个站点及其 Datasheet 语言列。");
  }
  const requestedCodes = requested.map((target) => String(target?.siteCode || "").trim());
  if (new Set(requestedCodes).size !== requestedCodes.length) {
    throw new Error("站点不能重复选择。");
  }
  const siteByCode = new Map(sites.map((site) => [site.siteCode, site]));
  return requested.map((target) => {
    const siteCode = String(target?.siteCode || "").trim();
    const site = siteByCode.get(siteCode);
    if (!site) throw new Error(`站点不存在或未启用：${siteCode}`);
    let header = String(target?.languagePackageHeader || "").trim();
    if (!header) {
      const needles = SITE_LANGUAGE_NEEDLES[siteCode] || [siteCode];
      const matches = parsedDatasheet.headers.filter((candidate) => {
        const normalized = candidate.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return needles.some((needle) => normalized.includes(needle));
      });
      if (matches.length !== 1) {
        throw new Error(`${siteCode} 无法唯一匹配 Datasheet 语言列，请手工选择。`);
      }
      [header] = matches;
    }
    const exactHeader = parsedDatasheet.headers.find(
      (candidate) => candidate.toLowerCase() === header.toLowerCase()
    );
    if (!exactHeader) throw new Error(`${siteCode} 的 Datasheet 语言列不存在：${header}`);
    return { site, languagePackageHeader: exactHeader };
  });
}

function summarizeDatasheetPlan(plan) {
  return {
    translationHeader: plan.translationHeader,
    requestedCount: plan.requestedCount,
    matchedFieldCount: plan.matchedFieldCount,
    changedCellCount: plan.changedCellCount,
    unchangedCellCount: plan.unchangedCellCount,
    appendedFieldCount: plan.newFields.length,
    skippedBlankCount: plan.skippedBlankCount,
    missing: plan.missing,
    sourceMismatches: plan.sourceMismatches,
    updates: plan.updates.slice(0, 100).map((item) => ({
      key: item.key,
      sheetName: item.sheetName,
      rowNumber: item.rowNumber,
      before: item.current,
      after: item.translation
    }))
  };
}

function inspectLanguageDatasheet(file) {
  if (!file?.path) throw new Error("请上传单产品 Datasheet。");
  const parsed = parseStandaloneDatasheet(file.path);
  return {
    sheetName: parsed.sheetName,
    fingerprint: parsed.fingerprint,
    headers: parsed.headers,
    fieldCount: parsed.rows.length
  };
}

function parseStandaloneDatasheet(filePath) {
  const parsed = parseLanguageDatasheet(filePath);
  return {
    ...parsed,
    headers: [ENGLISH_SOURCE_HEADER, ...parsed.headers],
    rows: parsed.rows.map((row) => ({
      ...row,
      translations: {
        [ENGLISH_SOURCE_HEADER]: row.source,
        ...row.translations
      }
    }))
  };
}

async function reviseFromDatasheet(body, file, logs, submit = false) {
  if (!file?.path) throw new Error("请上传单产品 Datasheet。");
  const parsedDatasheet = parseStandaloneDatasheet(file.path);
  if (submit && body?.expectedDatasheetFingerprint !== parsedDatasheet.fingerprint) {
    throw new Error("Datasheet 与预览时不一致，请重新预览。");
  }
  const config = readCampaignConfig();
  const enabledSites = (config.sites || []).filter((site) => site.enabled !== false);
  const targets = parseDatasheetTargets(body, enabledSites, parsedDatasheet);
  const fingerprints = expectedFingerprints(body);
  const results = [];
  const runDir = path.resolve(
    "outputs",
    "language-package-datasheet",
    new Date().toISOString().replace(/[:.]/g, "-")
  );
  if (submit) fs.mkdirSync(runDir, { recursive: true });

  for (const target of targets) {
    let downloaded = null;
    let verification = null;
    let uploaded = false;
    let originalFingerprint = "";
    try {
      const session = await prepareLanguagePage({
        ...body,
        sites: JSON.stringify([target.site.siteCode])
      }, logs);
      downloaded = await downloadCurrentLanguagePackageForPage(
        session.page,
        target.site,
        logs
      );
      const packageInfo = readLanguagePackage(downloaded.filePath, downloaded.langCode);
      originalFingerprint = packageInfo.contentFingerprint;
      const plan = planLanguagePackageUpdates(
        packageInfo,
        parsedDatasheet,
        target.languagePackageHeader
      );
      const changed = plan.changedCellCount + plan.newFields.length;
      if (!submit || !changed) {
        results.push({
          status: changed ? "ready" : "no-change",
          site: target.site,
          fingerprint: packageInfo.contentFingerprint,
          plan: summarizeDatasheetPlan(plan)
        });
        continue;
      }
      if (fingerprints[target.site.siteCode] !== packageInfo.contentFingerprint) {
        throw new Error("站点语言包已在预览后变化，请重新预览。");
      }

      const extension = path.extname(downloaded.fileName).toLowerCase() || ".xlsx";
      const originalPath = path.join(runDir, `${target.site.siteCode}-before${extension}`);
      const modifiedPath = path.join(runDir, `${target.site.siteCode}-after${extension}`);
      fs.copyFileSync(downloaded.filePath, originalPath);
      const generated = writeUpdatedLanguagePackageNative(
        downloaded.filePath,
        packageInfo,
        parsedDatasheet,
        plan,
        modifiedPath
      );
      await uploadLanguagePackageForPage(session.page, {
        ...generated,
        fileName: downloaded.fileName,
        langCode: downloaded.langCode
      }, logs);
      uploaded = true;
      verification = await downloadCurrentLanguagePackageForPage(
        session.page,
        target.site,
        logs
      );
      const verifiedInfo = readLanguagePackage(verification.filePath, verification.langCode);
      const verifiedPlan = planLanguagePackageUpdates(
        verifiedInfo,
        parsedDatasheet,
        target.languagePackageHeader
      );
      if (verifiedPlan.changedCellCount || verifiedPlan.missing.length) {
        throw new Error("上传后回读仍有未更新字段。");
      }
      results.push({
        status: "updated",
        site: target.site,
        fingerprint: packageInfo.contentFingerprint,
        verifiedFingerprint: verifiedInfo.contentFingerprint,
        plan: summarizeDatasheetPlan(plan)
      });
    } catch (error) {
      let rollback = null;
      if (submit && uploaded && downloaded?.filePath) {
        try {
          const context = await getShopContext();
          const page = await getOpenPage(context);
          await uploadLanguagePackageForPage(page, {
            filePath: downloaded.filePath,
            fileName: downloaded.fileName,
            langCode: downloaded.langCode
          }, logs);
          const restored = await downloadCurrentLanguagePackageForPage(page, target.site, logs);
          try {
            rollback = readLanguagePackage(restored.filePath, restored.langCode).contentFingerprint
              === originalFingerprint ? "passed" : "FAILED: 恢复后语言包内容不一致";
          } finally {
            fs.rmSync(restored.filePath, { force: true });
          }
        } catch (rollbackError) {
          rollback = `FAILED: ${rollbackError.message}`;
        }
      }
      results.push({
        status: "failed",
        site: target.site,
        languagePackageHeader: target.languagePackageHeader,
        error: error.message || String(error),
        rollback
      });
    } finally {
      if (downloaded?.filePath) fs.rmSync(downloaded.filePath, { force: true });
      if (verification?.filePath) fs.rmSync(verification.filePath, { force: true });
    }
  }

  return {
    mode: submit ? "submit" : "preview",
    datasheet: inspectLanguageDatasheet(file),
    runDir: submit ? runDir : "",
    sites: results
  };
}

async function reviseHg24004(body, logs, submit = false) {
  const config = readCampaignConfig();
  const sites = requestedSites(config, body);
  const fingerprints = expectedFingerprints(body);
  const results = [];
  const runDir = path.resolve("outputs", "language-package-hg2-400-4", new Date().toISOString().replace(/[:.]/g, "-"));
  if (submit) fs.mkdirSync(runDir, { recursive: true });
  for (const site of sites) {
    let downloaded = null;
    let verification = null;
    let uploaded = false;
    let originalValue = "";
    try {
      const session = await prepareLanguagePage({
        ...body,
        sites: JSON.stringify([site.siteCode])
      }, logs);
      const rowInfo = await findLanguageRow(session.page, site.siteCode);
      downloaded = {
        ...await downloadLanguagePackage(session.page, rowInfo, logs),
        langCode: String(rowInfo.langCode || "").trim()
          || inferLangCodeFromFile({ originalname: rowInfo.rowText })
      };
      if (!downloaded.langCode) {
        throw new Error("无法从语言行识别 lang_code，停止上传。");
      }
      let inspected;
      try { inspected = inspectTargetField(downloaded.filePath); }
      catch { inspected = inspectTargetFieldNative(downloaded.filePath); }
      originalValue = inspected.before;
      const status = inspected.blank ? "blank" : inspected.changed ? "ready" : "no-target-text";
      if (!submit || status !== "ready") {
        results.push({
          site: { name: site.name, siteCode: site.siteCode },
          status,
          fingerprint: targetRevisionFingerprint(inspected),
          sheetName: inspected.sheetName,
          rowNumber: inspected.rowNumber,
          before: inspected.before,
          after: inspected.after
        });
        continue;
      }
      const currentFingerprint = targetRevisionFingerprint(inspected);
      if (!fingerprints[site.siteCode] || fingerprints[site.siteCode] !== currentFingerprint) {
        throw new Error("语言包已在预览后变化，请重新预览该站点。");
      }
      const extension = path.extname(downloaded.fileName).toLowerCase() || ".xlsx";
      const originalPath = path.join(runDir, `${site.siteCode}-before${extension}`);
      const modifiedPath = path.join(runDir, `${site.siteCode}-after${extension}`);
      fs.copyFileSync(downloaded.filePath, originalPath);
      writeTargetFieldUpdateNative(downloaded.filePath, modifiedPath);
      await uploadLanguagePackageForPage(session.page, {
        filePath: modifiedPath,
        fileName: downloaded.fileName,
        langCode: downloaded.langCode
      }, logs);
      uploaded = true;
      verification = await downloadCurrentLanguagePackageForPage(session.page, site, logs);
      let verified;
      try { verified = inspectTargetField(verification.filePath); }
      catch { verified = inspectTargetFieldNative(verification.filePath); }
      if (verified.before !== inspected.after || verified.changed) {
        throw new Error(`上传后回读不一致，实际 E 列为“${verified.before}”。`);
      }
      results.push({
        site: { name: site.name, siteCode: site.siteCode },
        status: "updated",
        before: inspected.before,
        after: inspected.after,
        fingerprint: currentFingerprint,
        verifiedFingerprint: targetRevisionFingerprint(verified)
      });
    } catch (error) {
      let rollback = null;
      if (submit && uploaded && downloaded?.filePath) {
        try {
          const context = await getShopContext();
          const page = await getOpenPage(context);
          await uploadLanguagePackageForPage(page, {
            filePath: downloaded.filePath,
            fileName: downloaded.fileName,
            langCode: downloaded.langCode
          }, logs);
          const restored = await downloadCurrentLanguagePackageForPage(page, site, logs);
          let restoredInspection;
          try { restoredInspection = inspectTargetField(restored.filePath); }
          catch { restoredInspection = inspectTargetFieldNative(restored.filePath); }
          const restoredValue = restoredInspection.before;
          rollback = restoredValue === originalValue
            ? "passed"
            : `FAILED: 恢复后 E 列为“${restoredValue}”`;
          fs.rmSync(restored.filePath, { force: true });
        } catch (rollbackError) {
          rollback = `FAILED: ${rollbackError.message}`;
        }
      }
      results.push({
        site: { name: site.name, siteCode: site.siteCode },
        status: "failed",
        error: error.message || String(error),
        rollback
      });
    } finally {
      if (downloaded?.filePath) fs.rmSync(downloaded.filePath, { force: true });
      if (verification?.filePath) fs.rmSync(verification.filePath, { force: true });
    }
  }
  return { mode: submit ? "submit" : "preview", fieldKey: "HG2_400_4", sites: results, runDir: submit ? runDir : "" };
}

  return {
    probeLanguagePackageUpload,
    submitLanguagePackageToBackend,
    roundTripLanguagePackage,
    downloadCurrentLanguagePackageForPage,
    uploadLanguagePackageForPage,
    inspectLanguageDatasheet,
    previewFromDatasheet: (body, file, logs) => reviseFromDatasheet(body, file, logs, false),
    submitFromDatasheet: (body, file, logs) => reviseFromDatasheet(body, file, logs, true),
    previewHg24004: (body, logs) => reviseHg24004(body, logs, false),
    submitHg24004: (body, logs) => reviseHg24004(body, logs, true),
    generateLocalI18nDatasheet: (body) => generateLocalI18nDatasheet(body || {})
  };
}

module.exports = {
  createLanguagePackageFeature,
  chooseLanguageRowCandidate,
  languageRowScore
};
