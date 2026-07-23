const XLSX = require("xlsx");

function normalizeWtbHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-（）()：:]+/g, "");
}

function normalizeWtbPlatform(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function applyWtbLinksToMap(currentWhereToBuy, links) {
  const nextWhereToBuy = JSON.parse(JSON.stringify(currentWhereToBuy || {}));
  const platformKeys = Object.keys(nextWhereToBuy);
  const applied = [];
  const missing = [];

  for (const link of links || []) {
    const normalized = normalizeWtbPlatform(link.platform);
    const key = platformKeys.find((candidate) => normalizeWtbPlatform(candidate) === normalized);
    if (!key) {
      missing.push(link.platform);
      continue;
    }
    const current = nextWhereToBuy[key];
    nextWhereToBuy[key] = {
      ...(current && typeof current === "object" ? current : {}),
      href_url: String(link.url || "").trim()
    };
    applied.push({ platform: key, url: nextWhereToBuy[key].href_url });
  }

  if (missing.length) {
    throw new Error(
      "后台未配置这些购买平台：" + missing.join(", ")
      + (platformKeys.length ? "。当前可用平台：" + platformKeys.join(", ") : "。当前站点没有可用购买平台。")
    );
  }
  return { whereToBuy: nextWhereToBuy, applied, availablePlatforms: platformKeys };
}

function parseWtbWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const result = [];
  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    if (sheetName.trim() === "填写说明") return;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false
    }).filter((row) => row && row.some((cell) => String(cell || "").trim()));
    if (!rows.length) return;
    const headers = rows[0].map(normalizeWtbHeader);
    const productIndex = headers.findIndex((item) => ["产品名称", "产品名", "productname", "product", "name"].includes(item));
    const productPageIndex = headers.findIndex((item) => ["productpageurl", "producturl", "productpage", "pageurl"].includes(item));
    const platformIndex = headers.findIndex((item) => ["购买平台", "平台", "platform", "channel", "shop", "store", "retailer"].includes(item));
    const urlIndex = headers.findIndex((item) => ["购买链接", "链接", "purchasinglink", "purchaselink", "buyinglink", "link", "url", "buyurl", "href"].includes(item));
    if (productIndex < 0 || platformIndex < 0 || urlIndex < 0) {
      throw new Error(`WTB Excel 工作表“${sheetName}”的表头需要包含 Product、Channel、Purchasing Link。`);
    }
    result.push(...rows.slice(1).map((row, index) => ({
      sheetNumber: sheetIndex + 1,
      sheetName,
      rowNumber: index + 2,
      productName: String(row[productIndex] || "").trim(),
      productPageUrl: productPageIndex < 0 ? "" : String(row[productPageIndex] || "").trim(),
      platform: String(row[platformIndex] || "").trim(),
      url: String(row[urlIndex] || "").trim()
    })).filter((item) => item.productName || item.productPageUrl || item.platform || item.url));
  });
  return result;
}

function createWtbFeature(deps) {
  const {
    fs,
    path,
    logLine,
    readCampaignConfig,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductAdditionalInformation,
    clickTextInProductEditor
  } = deps;

function readWtbWorkbook(file) {
  if (!file?.path || !fs.existsSync(file.path)) return [];
  return parseWtbWorkbook(file.path);
}

function buildWtbRows(body, files) {
  const rows = [];
  if (files?.excel?.[0]) rows.push(...readWtbWorkbook(files.excel[0]));
  const productName = String(body.productName || "").trim();
  const platform = String(body.platform || "").trim();
  const url = String(body.url || "").trim();
  if (productName || platform || url) {
    rows.unshift({ rowNumber: "single", productName, platform, url });
  }
  rows.forEach((row) => {
    const location = row.sheetNumber ? `第 ${row.sheetNumber} 个工作表第 ${row.rowNumber} 行` : `第 ${row.rowNumber} 行`;
    if (!row.productName) throw new Error("WTB " + location + " 缺少 Product。");
    if (!row.platform) throw new Error("WTB " + location + " 缺少 Channel。");
    if (!row.url) throw new Error("WTB " + location + " 缺少 Purchasing Link。");
    if (!/^https?:\/\//i.test(row.url)) throw new Error("WTB 第 " + row.rowNumber + " 行购买链接必须以 http:// 或 https:// 开头。");
  });
  return rows;
}

function groupWtbRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.productName.trim().toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { productName: row.productName.trim(), productPageUrl: row.productPageUrl || "", links: [] });
    if (!grouped.get(key).productPageUrl && row.productPageUrl) grouped.get(key).productPageUrl = row.productPageUrl;
    grouped.get(key).links.push({ platform: row.platform.trim(), url: row.url.trim(), rowNumber: row.rowNumber });
  }
  return [...grouped.values()];
}

function safeReportCell(value) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function writeWtbExecutionReport(site, results) {
  const reportRoot = path.resolve("outputs", "wtb");
  fs.mkdirSync(reportRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `wtb-${site.siteCode}-${stamp}.xlsx`;
  const reportPath = path.join(reportRoot, filename);
  const summaryRows = [
    ["字段", "内容"],
    ["站点", site.name],
    ["站点代码", site.siteCode],
    ["执行时间", new Date().toISOString()],
    ["产品总数", results.length],
    ["成功产品数", results.filter((item) => item.status === "completed").length],
    ["失败/跳过产品数", results.filter((item) => item.status === "failed").length]
  ];
  const detailRows = [["状态", "产品", "渠道", "购买链接", "后台编辑页", "保存状态", "前台复查", "错误原因"]];
  for (const item of results) {
    const links = item.links?.length ? item.links : [{ platform: "", url: "" }];
    for (const link of links) {
      detailRows.push([
        item.status === "completed" ? "成功" : "失败/跳过",
        item.productName,
        link.platform,
        link.url,
        item.editUrl || "",
        item.save?.responseStatus || "",
        item.frontendCheck?.status || "",
        item.error || ""
      ].map(safeReportCell));
    }
  }
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 70 }];
  detailSheet["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 65 }, { wch: 55 }, { wch: 14 }, { wch: 16 }, { wch: 80 }];
  detailSheet["!autofilter"] = { ref: detailSheet["!ref"] };
  XLSX.utils.book_append_sheet(workbook, summarySheet, "执行摘要");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "产品执行明细");
  XLSX.writeFile(workbook, reportPath, { compression: true });
  return { filename, reportPath, reportUrl: `/api/campaign/wtb-reports/${encodeURIComponent(filename)}` };
}

function inferWtbSite(config, rows) {
  const sites = (config.sites || []).filter((site) => site.enabled !== false);
  const matches = new Map();
  for (const row of rows) {
    if (!row.productPageUrl) continue;
    let productUrl;
    try { productUrl = new URL(row.productPageUrl); } catch { continue; }
    const matched = sites.find((site) => {
      try {
        const siteUrl = new URL(site.url);
        const basePath = siteUrl.pathname.replace(/\/+$/, "");
        return productUrl.hostname.replace(/^www\./i, "").toLowerCase() === siteUrl.hostname.replace(/^www\./i, "").toLowerCase()
          && (productUrl.pathname === basePath || productUrl.pathname.startsWith(basePath + "/"));
      } catch { return false; }
    });
    if (matched) matches.set(matched.siteCode, matched);
  }
  if (matches.size > 1) throw new Error("WTB Excel 的 Product Page URL 包含多个站点：" + [...matches.keys()].join(", ") + "。请按站点拆分后分别执行。");
  return [...matches.values()][0] || null;
}

function resolveWtbSite(config, body, rows) {
  const inferred = inferWtbSite(config, rows);
  if (inferred) return { site: inferred, source: "product-page-url" };
  return { site: requireSingleCampaignSite(config, body), source: "manual-selection" };
}

async function findAndOpenProductEdit(page, productName, logs) {
  await page.goto("https://shop.ezvizlife.com/goods/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  async function clickMatchingRow() {
    return page.evaluate((targetName) => {
      const normalizedTarget = targetName.trim().toLowerCase();
      function visible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
      const containers = [...new Set([
        ...document.querySelectorAll("tr"),
        ...document.querySelectorAll(".goods-item.ng-scope")
      ])].filter(visible);
      const exactRow = containers.find((row) => {
        const cells = [...row.querySelectorAll("td, .goods-name, .product-name, [ng-bind*='name'], [ng-bind*='title']")]
          .map((cell) => (cell.innerText || cell.textContent || "").trim().toLowerCase());
        return cells.some((cell) => cell === normalizedTarget);
      });
      const fuzzyRow = containers.find((row) => (row.innerText || "").trim().toLowerCase().includes(normalizedTarget));
      const row = exactRow || fuzzyRow;
      if (!row) return { ok: false };
      const controls = [...row.querySelectorAll("a, button")].filter(visible);
      const edit = controls.find((el) => /^(edit|编辑)$/i.test((el.innerText || el.textContent || "").trim()))
        || controls.find((el) => /\/goods\/add\?id=|\/goods\/edit/i.test(el.getAttribute("href") || ""));
      if (!edit) return { ok: false, reason: "找到产品行，但没有找到 Edit 按钮。", rowText: row.innerText };
      const href = edit.href || edit.getAttribute("href") || "";
      const linkArea = row.querySelector(".lb") || row.getElementsByClassName("1b")[0] || row;
      const preferredProductUrls = [
        ...(linkArea.matches?.("a[href]") ? [linkArea] : []),
        ...linkArea.querySelectorAll("a[href]")
      ]
        .map((link) => link.href || link.getAttribute("href") || "")
        .filter((value) => value && !/\/goods\/(?:add|edit)|javascript:/i.test(value));
      const candidateUrls = [...row.querySelectorAll("a[href]")]
        .map((link) => link.href || link.getAttribute("href") || "")
        .filter(Boolean);
      edit.click();
      return {
        ok: true,
        href,
        rowText: row.innerText,
        productPageUrl: preferredProductUrls[0] || "",
        candidateUrls: [...new Set([...preferredProductUrls, ...candidateUrls])]
      };
    }, productName);
  }

  let clicked = await clickMatchingRow();
  if (!clicked.ok) {
    const searched = await page.evaluate((targetName) => {
      function visible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
      const textInputs = [...document.querySelectorAll("input")].filter((input) => {
        const type = (input.getAttribute("type") || "text").toLowerCase();
        return visible(input) && !input.disabled && ["", "text", "search"].includes(type);
      });
      const input = textInputs[0];
      if (!input) return { ok: false, reason: "没有找到产品搜索输入框。" };
      input.focus();
      input.value = targetName;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const buttons = [...document.querySelectorAll("button, a, input[type='button'], input[type='submit']")].filter(visible);
      const search = buttons.find((el) => /search|查询|搜索/i.test((el.innerText || el.value || el.textContent || "").trim())) || buttons[0];
      if (!search) return { ok: false, reason: "没有找到搜索按钮。" };
      search.click();
      return { ok: true };
    }, productName);
    logLine(logs, "产品搜索：" + JSON.stringify(searched));
    await page.waitForTimeout(3500);
    clicked = await clickMatchingRow();
  }

  if (!clicked.ok) {
    throw new Error("没有在产品列表中找到产品：" + productName + (clicked.reason ? "；" + clicked.reason : ""));
  }
  logLine(logs, "已打开产品编辑：" + productName + " / " + JSON.stringify({
    href: clicked.href,
    productPageUrl: clicked.productPageUrl || "",
    rowText: clicked.rowText?.slice(0, 240)
  }));
  await page.waitForTimeout(5000);
  return {
    editUrl: page.url(),
    rowText: clicked.rowText || "",
    productPageUrl: clicked.productPageUrl || "",
    candidateUrls: clicked.candidateUrls || []
  };
}

async function fillProductWhereToBuyLinks(page, links, logs) {
  await openProductAdditionalInformation(page, logs);
  const result = await page.evaluate((nextLinks) => {
    const pane = document.querySelector("#replenish.tab-pane.active") || document.querySelector("#replenish") || document;
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    function setInputValue(input, value) {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function findInputAfterLabel(platform) {
      const normalized = platform.trim().toLowerCase();
      function pickLinkInput(inputs) {
        const candidates = [...inputs].filter((input) => visible(input) && !/sort|order|rank/i.test([
          input.name, input.id, input.getAttribute("ng-model"), input.getAttribute("placeholder")
        ].join(" ")));
        return candidates.find((input) => /url|link|href|address|where.*buy/i.test([
          input.name, input.id, input.getAttribute("ng-model"), input.getAttribute("placeholder")
        ].join(" "))) || candidates[0] || null;
      }
      const labels = [...pane.querySelectorAll("label, span, div, td, th")].filter((el) => {
        const text = (el.innerText || el.textContent || "").replace(/[:：]/g, "").trim().toLowerCase();
        return visible(el) && text === normalized;
      });
      for (const label of labels) {
        const container = label.closest(".form-group, .form-horizontal, .row, tr, div") || label.parentElement;
        const scoped = pickLinkInput(container?.querySelectorAll("input[type='text'], input:not([type]), input[type='url'], textarea") || []);
        if (scoped) return scoped;
        let node = label;
        for (let i = 0; i < 8 && node; i += 1) {
          node = node.nextElementSibling || node.parentElement?.nextElementSibling;
          const input = pickLinkInput(node?.matches?.("input, textarea") ? [node] : (node?.querySelectorAll?.("input[type='text'], input:not([type]), input[type='url'], textarea") || []));
          if (input) return input;
        }
      }
      const named = [...pane.querySelectorAll("input, textarea")].find((input) => {
        const text = [input.name, input.id, input.getAttribute("ng-model"), input.getAttribute("placeholder")].join(" ").toLowerCase();
        return visible(input) && text.includes(normalized);
      });
      return named || null;
    }

    const applied = [];
    const missing = [];
    for (const item of nextLinks) {
      const input = findInputAfterLabel(item.platform);
      if (!input) {
        missing.push(item.platform);
        continue;
      }
      setInputValue(input, item.url);
      applied.push({
        platform: item.platform,
        url: item.url,
        name: input.name || "",
        model: input.getAttribute("ng-model") || ""
      });
    }
    return { applied, missing };
  }, links);

  if (result.missing.length) {
    throw new Error("没有找到这些购买平台的输入框：" + result.missing.join(", "));
  }
  logLine(logs, "WTB 字段已填写：" + JSON.stringify(result.applied));
  return result;
}

async function saveCurrentProductAndCapture(page, logs) {
  const captured = [];
  const onRequest = (request) => {
    if (request.method() === "POST" && /\/goods\//i.test(request.url())) {
      captured.push({ method: request.method(), url: request.url(), postData: request.postData() || "" });
    }
  };
  const onResponse = (response) => {
    if (/\/goods\/do-(?:edit|add)-goods/i.test(response.url())) {
      captured.push({ status: response.status(), url: response.url() });
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await clickTextInProductEditor(page, /^complete$/i, "Complete", logs);
    await page.waitForTimeout(5000);
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
  const saveRequest = captured.find((item) => item.postData);
  if (!saveRequest) throw new Error("没有捕获到产品保存请求。");
  const saveResponse = [...captured].reverse().find((item) => item.status);
  if (saveResponse && saveResponse.status >= 400) {
    throw new Error("产品保存接口返回异常状态：" + saveResponse.status);
  }
  logLine(logs, "WTB 保存请求已发送：" + saveRequest.url);
  return { requestUrl: saveRequest.url, responseStatus: saveResponse?.status || null };
}

async function readWtbEditorState(page) {
  await page.waitForFunction(() => {
    const element = document.querySelector("#replenish");
    const scope = window.angular && element ? window.angular.element(element).scope() : null;
    return Boolean(
      scope?.goodsId
      && scope?.vm?.others?.wheretobuy
      && typeof scope?.md?.toModel === "function"
    );
  }, null, { timeout: 30000 });

  return page.evaluate(() => {
    const scope = window.angular.element(document.querySelector("#replenish")).scope();
    return {
      goodsId: String(scope.goodsId),
      whereToBuy: JSON.parse(JSON.stringify(scope.vm.others.wheretobuy || {}))
    };
  });
}

async function buildWtbDirectPayload(page, links) {
  const editorState = await readWtbEditorState(page);
  const mapped = applyWtbLinksToMap(editorState.whereToBuy, links);
  const payload = await page.evaluate((whereToBuy) => {
    const scope = window.angular.element(document.querySelector("#replenish")).scope();
    scope.vm.others.wheretobuy = whereToBuy;
    const data = scope.md.toModel(scope.vm);
    data.goods_id = scope.goodsId;
    return data;
  }, mapped.whereToBuy);
  return { ...mapped, goodsId: editorState.goodsId, payload };
}

async function postWtbDirectUpdate(page, payload) {
  const requestUrl = "https://shop.ezvizlife.com/goods/do-edit-goods";
  const response = await page.request.post(requestUrl, {
    data: { data: payload },
    headers: { "x-requested-with": "XMLHttpRequest" },
    timeout: 60000
  });
  const responseText = await response.text().catch(() => "");
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error("WTB 保存接口返回的不是 JSON：" + responseText.slice(0, 200));
  }
  if (!response.ok() || Number(data?.status) !== 1) {
    throw new Error(data?.msg || data?.message || `WTB 保存接口返回异常（HTTP ${response.status()}）`);
  }
  return {
    requestUrl,
    responseStatus: response.status(),
    backendStatus: Number(data.status),
    redirect: data.redirect || ""
  };
}

async function verifyWtbBackendState(page, editUrl, expectedLinks) {
  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const state = await readWtbEditorState(page);
  const actualEntries = Object.entries(state.whereToBuy || {});
  const missing = [];
  for (const link of expectedLinks) {
    const normalized = normalizeWtbPlatform(link.platform);
    const match = actualEntries.find(([platform]) => normalizeWtbPlatform(platform) === normalized);
    if (!match || String(match[1]?.href_url || "").trim() !== String(link.url || "").trim()) {
      missing.push({ platform: link.platform, expectedUrl: link.url, actualUrl: match?.[1]?.href_url || "" });
    }
  }
  if (missing.length) {
    throw new Error("WTB 保存后回读校验失败：" + JSON.stringify(missing));
  }
  return { status: "passed", goodsId: state.goodsId, checkedCount: expectedLinks.length };
}

function normalizeWtbText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function absoluteSiteUrl(site, rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value || /^javascript:/i.test(value) || value === "#") return "";
  try {
    return new URL(value, site.url).toString();
  } catch {
    return "";
  }
}

function sameSiteHost(site, rawUrl) {
  try {
    const siteHost = new URL(site.url).hostname.replace(/^www\./i, "").toLowerCase();
    const targetHost = new URL(rawUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return targetHost === siteHost || targetHost.endsWith("." + siteHost) || siteHost.endsWith("." + targetHost);
  } catch {
    return false;
  }
}

function productSlugCandidates(productName) {
  const original = String(productName || "").trim();
  const simple = original
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return [...new Set([original, simple].filter(Boolean))];
}

async function collectProductFrontendCandidates(page, site, product, editInfo, logs) {
  const rawCandidates = [];
  rawCandidates.push(product.productPageUrl);
  rawCandidates.push(editInfo?.productPageUrl);
  rawCandidates.push(...(editInfo?.candidateUrls || []));
  rawCandidates.push(page.url());

  const domCandidates = await page.evaluate(() => {
    const urls = [];
    const attrs = ["href", "value", "data-url", "data-href"];
    for (const el of document.querySelectorAll("a, input, textarea, button")) {
      for (const attr of attrs) {
        const value = el.getAttribute?.(attr);
        if (value) urls.push(value);
      }
      const text = (el.innerText || el.textContent || "").trim();
      if (/^https?:\/\//i.test(text)) urls.push(text);
    }
    return urls;
  }).catch(() => []);
  rawCandidates.push(...domCandidates);

  for (const slug of productSlugCandidates(product.productName)) {
    rawCandidates.push("/product/" + slug);
    rawCandidates.push("/" + slug);
  }

  const seen = new Set();
  const candidates = [];
  for (const raw of rawCandidates) {
    const url = absoluteSiteUrl(site, raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!sameSiteHost(site, url)) continue;
    if (/\/(goods|templates|pages|whereToBuy|login|admin)\b/i.test(new URL(url).pathname)) continue;
    const score = /\/product\//i.test(url) ? 3 : /product|goods|detail/i.test(url) ? 2 : 1;
    candidates.push({ url, score });
  }

  candidates.sort((a, b) => b.score - a.score || a.url.length - b.url.length);
  const finalCandidates = candidates.slice(0, 6).map((item) => item.url);
  logLine(logs, "WTB 前台复查候选页：" + JSON.stringify(finalCandidates));
  return finalCandidates;
}

async function verifyWtbFrontendDisplay(context, backendPage, site, product, editInfo, logs) {
  const candidates = await collectProductFrontendCandidates(backendPage, site, product, editInfo, logs);
  if (!candidates.length) {
    return {
      status: "skipped",
      reason: "没有从后台编辑页定位到可复查的前台商品链接。",
      checkedUrls: []
    };
  }

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const checkedUrls = [];
  try {
    for (const url of candidates) {
      const checked = { url, ok: false, found: [], missing: [] };
      checkedUrls.push(checked);
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(3500);
        checked.status = response?.status() || null;
        const snapshot = await page.evaluate(() => ({
          text: document.body ? document.body.innerText : "",
          html: document.documentElement ? document.documentElement.outerHTML : "",
          links: [...document.querySelectorAll("a[href]")].map((link) => ({
            text: (link.innerText || link.textContent || "").trim(),
            href: link.href || ""
          }))
        }));
        const pageText = normalizeWtbText(snapshot.text + "\n" + snapshot.html);
        for (const link of product.links) {
          const expectedUrl = String(link.url || "").trim();
          const expectedPlatform = normalizeWtbText(link.platform);
          const hrefFound = snapshot.links.some((item) => item.href === expectedUrl || item.href.includes(expectedUrl))
            || pageText.includes(normalizeWtbText(expectedUrl));
          const platformFound = expectedPlatform ? pageText.includes(expectedPlatform) : false;
          if (hrefFound || platformFound) {
            checked.found.push({ platform: link.platform, url: link.url, hrefFound, platformFound });
          } else {
            checked.missing.push({ platform: link.platform, url: link.url });
          }
        }
        checked.ok = !checked.missing.length;
        if (checked.ok) {
          logLine(logs, "WTB 前台复查通过：" + product.productName + " / " + url);
          return { status: "passed", productUrl: url, checkedUrls };
        }
      } catch (error) {
        checked.error = error.message || String(error);
      }
    }
  } finally {
    await page.close().catch(() => {});
  }

  logLine(logs, "WTB 前台复查未通过：" + product.productName);
  return {
    status: "failed",
    reason: "已打开候选前台页，但没有完整匹配到配置的购买平台或链接。",
    checkedUrls
  };
}

function buildWtbPlan(body, files) {
  const rows = buildWtbRows(body, files);
  const products = groupWtbRows(rows);
  const resolved = resolveWtbSite(readCampaignConfig(), body, rows);
  return {
    mode: "wtb-plan",
    site: resolved.site,
    siteSource: resolved.source,
    productCount: products.length,
    linkCount: rows.length,
    products
  };
}

async function submitWtbToBackend(body, files, logs) {
  const config = readCampaignConfig();
  const rows = buildWtbRows(body, files);
  const resolved = resolveWtbSite(config, body, rows);
  const site = resolved.site;
  const products = groupWtbRows(rows);
  if (!products.length) throw new Error("请填写单条 WTB 数据，或上传 WTB Excel。");

  const context = await getShopContext();
  const page = await getOpenPage(context);
  page.setDefaultTimeout(30000);
  const backendPage = await ensureShopLoggedIn(page, {
    ...body,
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);
  const authenticatedIdentity = await backendPage.evaluate(() =>
    document.querySelector(".clearfix.login-bar")?.innerText
    || document.querySelector(".login-bar")?.innerText
    || ""
  ).catch(() => "");
  if (!authenticatedIdentity.trim()) {
    throw new Error("商城后台登录后未能读取当前用户身份，已停止发送 WTB 请求。");
  }
  logLine(logs, "WTB 后台请求身份：" + authenticatedIdentity.replace(/\s+/g, " ").trim());

  const results = [];
  for (const product of products) {
    logLine(logs, "开始处理 WTB 产品：" + product.productName);
    try {
      const editInfo = await findAndOpenProductEdit(backendPage, product.productName, logs);
      const directUpdate = await buildWtbDirectPayload(backendPage, product.links);
      logLine(logs, "WTB 将使用已登录后台会话直接提交：" + JSON.stringify(directUpdate.applied));
      const save = await postWtbDirectUpdate(backendPage, directUpdate.payload);
      const backendCheck = await verifyWtbBackendState(backendPage, editInfo.editUrl, product.links);
      const frontendCheck = await verifyWtbFrontendDisplay(context, backendPage, site, product, editInfo, logs);
      results.push({
        status: "completed",
        productName: product.productName,
        editUrl: editInfo.editUrl,
        links: product.links,
        applied: directUpdate.applied,
        save,
        backendCheck,
        frontendCheck,
        error: null
      });
    } catch (error) {
      const message = error?.message || String(error);
      logLine(logs, "WTB 产品处理失败，已跳过并继续下一个：" + product.productName + " / " + message);
      results.push({
        status: "failed",
        productName: product.productName,
        links: product.links,
        error: message
      });
    }
  }

  const report = writeWtbExecutionReport(site, results);
  logLine(logs, "WTB 执行报告已生成：" + report.reportPath);

  return {
    mode: "authenticated-direct-post",
    site,
    authenticatedIdentity: authenticatedIdentity.replace(/\s+/g, " ").trim(),
    siteSource: resolved.source,
    productCount: results.length,
    successCount: results.filter((item) => item.status === "completed").length,
    failedCount: results.filter((item) => item.status === "failed").length,
    linkCount: rows.length,
    results,
    report
  };
}

  return {
    buildWtbPlan,
    submitWtbToBackend,
    getReportPath(filename) {
      const safeName = path.basename(String(filename || ""));
      if (!/^wtb-[a-z0-9_-]+-\d{8}T\d{6}Z\.xlsx$/i.test(safeName)) return null;
      const reportPath = path.resolve("outputs", "wtb", safeName);
      return fs.existsSync(reportPath) ? reportPath : null;
    }
  };
}

module.exports = {
  createWtbFeature,
  normalizeWtbHeader,
  normalizeWtbPlatform,
  applyWtbLinksToMap,
  parseWtbWorkbook
};
