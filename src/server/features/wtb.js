const XLSX = require("xlsx");

function normalizeWtbHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-（）()：:]+/g, "");
}

function normalizeWtbPlatform(value) {
  return String(value || "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function resolveWtbPlatformKey(platformKeys, platform) {
  const normalized = normalizeWtbPlatform(platform);
  if (!normalized) return { key: "", matches: [] };
  const exact = platformKeys.find((candidate) => normalizeWtbPlatform(candidate) === normalized);
  if (exact) return { key: exact, matches: [exact] };
  if (normalized.length < 3) return { key: "", matches: [] };
  const matches = platformKeys.filter((candidate) => {
    const candidateKey = normalizeWtbPlatform(candidate);
    return candidateKey.length >= 3
      && (candidateKey.includes(normalized) || normalized.includes(candidateKey));
  });
  return { key: matches.length === 1 ? matches[0] : "", matches };
}

function applyWtbLinksToMap(currentWhereToBuy, links) {
  const nextWhereToBuy = JSON.parse(JSON.stringify(currentWhereToBuy || {}));
  const platformKeys = Object.keys(nextWhereToBuy);
  const applied = [];
  const missing = [];
  const ambiguous = [];

  for (const link of links || []) {
    const resolved = resolveWtbPlatformKey(platformKeys, link.platform);
    const key = resolved.key;
    if (!key) {
      if (resolved.matches.length > 1) {
        ambiguous.push({ platform: link.platform, matches: resolved.matches });
      } else {
        missing.push(link.platform);
      }
      continue;
    }
    const current = nextWhereToBuy[key];
    nextWhereToBuy[key] = {
      ...(current && typeof current === "object" ? current : {}),
      href_url: String(link.url || "").trim()
    };
    applied.push({ platform: key, url: nextWhereToBuy[key].href_url });
  }

  if (ambiguous.length) {
    throw new Error("这些渠道简称匹配到多个后台平台："
      + ambiguous.map((item) => `${item.platform}（${item.matches.join(", ")}）`).join("；")
      + "。请填写更完整的渠道名称。");
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
    if (!grouped.has(key)) {
      grouped.set(key, {
        productName: row.productName.trim(),
        productPageUrl: row.productPageUrl || "",
        links: [],
        inputErrors: [],
        duplicateRowsSkipped: []
      });
    }
    const product = grouped.get(key);
    if (!product.productPageUrl && row.productPageUrl) product.productPageUrl = row.productPageUrl;
    const link = {
      platform: row.platform.trim(),
      url: row.url.trim(),
      rowNumber: row.rowNumber
    };
    const existingPlatforms = product.links.map((item) => item.platform);
    const duplicatePlatform = resolveWtbPlatformKey(existingPlatforms, link.platform).key;
    const duplicate = product.links.find((item) => item.platform === duplicatePlatform);
    if (!duplicate) {
      product.links.push(link);
    } else if (duplicate.url === link.url) {
      product.duplicateRowsSkipped.push({
        rowNumber: link.rowNumber,
        platform: link.platform,
        reason: "同一产品、平台和链接重复，已跳过重复行"
      });
    } else {
      product.inputErrors.push(
        `平台 ${link.platform} 配置了多个不同链接（${duplicate.url} / ${link.url}）`
      );
    }
  }
  return [...grouped.values()];
}

function classifyWtbProductError(message) {
  const text = String(message || "");
  if (/没有在产品列表中找到产品/.test(text)) return "product-not-found";
  if (/未配置|匹配到多个后台平台|购买平台/.test(text)) return "platform-not-available";
  if (/登录|身份|session|Target page.*closed|page.*closed/i.test(text)) return "session-error";
  if (/保存|do-edit-goods|HTTP/.test(text)) return "save-error";
  if (/timeout|超时|Timeout/i.test(text)) return "timeout";
  return "product-error";
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
    ["后台已配置但前台未通过", results.filter((item) => item.status === "configured_unverified").length],
    ["配置失败产品数", results.filter((item) => item.status === "failed").length],
    ["跳过产品数", results.filter((item) => item.status === "skipped").length]
  ];
  const detailRows = [[
    "状态",
    "产品",
    "渠道",
    "购买链接",
    "后台编辑页",
    "保存状态",
    "Buy 按钮",
    "零售商弹窗",
    "平台点击跳转",
    "停止阶段",
    "错误分类",
    "错误原因"
  ]];
  for (const item of results) {
    const links = item.links?.length ? item.links : [{ platform: "", url: "" }];
    for (const link of links) {
      detailRows.push([
        {
          completed: "成功",
          configured_unverified: "后台已配置/前台未通过",
          skipped: "跳过",
          failed: "失败"
        }[item.status] || item.status,
        item.productName,
        link.platform,
        link.url,
        item.editUrl || "",
        item.save?.responseStatus || "",
        item.frontendCheck?.buyButtonFound ? "通过" : "",
        item.frontendCheck?.modalFound ? "通过" : "",
        item.frontendCheck?.status === "passed" ? "通过" : item.frontendCheck?.status || "",
        item.phase || item.frontendCheck?.stage || "",
        item.errorCode || "",
        item.error || ""
      ].map(safeReportCell));
    }
  }
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 70 }];
  detailSheet["!cols"] = [
    { wch: 24 },
    { wch: 28 },
    { wch: 20 },
    { wch: 65 },
    { wch: 55 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 25 },
    { wch: 80 }
  ];
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
  const selected = requireSingleCampaignSite(config, body);
  if (inferred && inferred.siteCode !== selected.siteCode) {
    throw new Error(
      `WTB Excel 的 Product Page URL 属于 ${inferred.name} (${inferred.siteCode})，`
      + `与下拉框选择的 ${selected.name} (${selected.siteCode}) 不一致。`
    );
  }
  return {
    site: selected,
    source: inferred ? "manual-selection-validated-by-product-page-url" : "manual-selection"
  };
}

async function findAndOpenProductEdit(page, productName, logs) {
  await page.goto("https://shop.ezvizlife.com/goods/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  async function clickMatchingRow() {
    const match = await page.evaluate((targetName) => {
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
      const marker = `wtb-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      edit.setAttribute("data-wtb-edit-marker", marker);
      return {
        ok: true,
        marker,
        href,
        rowText: row.innerText,
        productPageUrl: preferredProductUrls[0] || "",
        candidateUrls: [...new Set([...preferredProductUrls, ...candidateUrls])]
      };
    }, productName);
    if (!match.ok) return match;

    const editControl = page.locator(`[data-wtb-edit-marker="${match.marker}"]`).first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
      editControl.click()
    ]);
    return match;
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
      const marker = `wtb-search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      search.setAttribute("data-wtb-search-marker", marker);
      return { ok: true, marker };
    }, productName);
    logLine(logs, "产品搜索：" + JSON.stringify(searched));
    if (searched.ok) {
      await page.locator(`[data-wtb-search-marker="${searched.marker}"]`).first().click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
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
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
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

function selectBackendFrontendCandidates(site, productName, rawSources) {
  const siteUrl = new URL(site.url);
  const siteBasePath = siteUrl.pathname.replace(/\/+$/, "") || "/";
  const productTokens = String(productName || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  const seen = new Map();

  for (const item of rawSources || []) {
    const url = absoluteSiteUrl(site, item?.value);
    if (!url || !sameSiteHost(site, url)) continue;
    const parsed = new URL(url);
    const pathName = parsed.pathname.replace(/\/+$/, "") || "/";
    if (siteBasePath !== "/"
      && pathName !== siteBasePath
      && !pathName.startsWith(siteBasePath + "/")) continue;
    if (pathName === siteBasePath || pathName === "/") continue;
    if (/\/(goods|templates|pages|whereToBuy|login|admin|account|checkout|cart)\b/i.test(pathName)) continue;
    if (/\.(?:js|css|png|jpe?g|gif|svg|webp|pdf|xlsx?)(?:$|\?)/i.test(url)) continue;

    const sourceName = String(item?.source || "backend-model");
    const key = String(item?.key || "");
    let score = sourceName === "backend-product-list-primary" ? 120
      : sourceName === "backend-product-list-link" ? 100
        : 80;
    if (/front.*url|product.*url|page.*url|request.*path|url.*key/i.test(key)) score += 25;
    const lowerUrl = url.toLowerCase();
    if (productTokens.length && productTokens.every((token) => lowerUrl.includes(token))) score += 20;
    if (/\/product\//i.test(pathName)) score += 10;

    const current = seen.get(url);
    if (!current || score > current.score) {
      seen.set(url, { url, source: sourceName, key, score });
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, 3);
}

async function collectProductFrontendCandidates(page, site, product, editInfo, logs) {
  const rawSources = [];
  if (editInfo?.productPageUrl) {
    rawSources.push({
      value: editInfo.productPageUrl,
      source: "backend-product-list-primary",
      key: "productPageUrl"
    });
  }
  for (const value of editInfo?.candidateUrls || []) {
    rawSources.push({ value, source: "backend-product-list-link", key: "rowLink" });
  }

  const modelCandidates = await page.evaluate(() => {
    const root = document.querySelector("#replenish");
    const scope = window.angular && root ? window.angular.element(root).scope() : null;
    const values = [];
    const visited = new WeakSet();
    const walk = (value, path, depth) => {
      if (depth > 7 || value == null) return;
      if (typeof value === "string") {
        const key = path.at(-1) || "";
        const text = value.trim();
        if (/url|uri|href|link|path|slug|key/i.test(key)
          && (/^https?:\/\//i.test(text) || /^\//.test(text))) {
          values.push({ key: path.join("."), value: text });
        }
        return;
      }
      if (typeof value !== "object" || visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        value.slice(0, 100).forEach((item, index) => walk(item, [...path, String(index)], depth + 1));
        return;
      }
      Object.entries(value).slice(0, 300).forEach(([key, item]) => {
        walk(item, [...path, key], depth + 1);
      });
    };
    walk(scope?.vm, ["vm"], 0);
    return values;
  }).catch(() => []);
  for (const item of modelCandidates) {
    rawSources.push({
      value: item.value,
      source: "backend-product-model",
      key: item.key
    });
  }

  const candidates = selectBackendFrontendCandidates(site, product.productName, rawSources);
  logLine(logs, "WTB 从后台商品数据获取的前台验证地址：" + JSON.stringify(candidates));
  return candidates.map((item) => item.url);
}
function comparableUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    return {
      href: url.toString().replace(/\/+$/, ""),
      host: url.hostname.replace(/^www\./i, "").toLowerCase(),
      path: url.pathname.replace(/\/+$/, "") || "/"
    };
  } catch {
    return { href: "", host: "", path: "" };
  }
}

function retailerTargetMatches(expectedUrl, actualUrl) {
  const expected = comparableUrl(expectedUrl);
  const actual = comparableUrl(actualUrl);
  if (!expected.href || !actual.href) return false;
  if (expected.href === actual.href) return true;
  return expected.host === actual.host
    && (expected.path === "/" || actual.path === expected.path
      || actual.path.startsWith(expected.path + "/")
      || expected.path.startsWith(actual.path + "/"));
}

async function openWtbBuyModal(page, productName) {
  await page.waitForTimeout(2000);
  const result = await page.evaluate((expectedProductName) => {
    const visible = (element) => Boolean(
      element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length)
    );
    const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const bodyText = normalize(document.body?.innerText || "");
    const productTokens = normalize(expectedProductName)
      .split(/[\s_-]+/)
      .filter((token) => token.length >= 2);
    const productMatched = !productTokens.length
      || productTokens.every((token) => bodyText.includes(token));
    const candidates = [...document.querySelectorAll(
      "button, a, [role='button'], input[type='button'], input[type='submit']"
    )].filter(visible);
    const buyButton = candidates.find((element) => {
      const signature = normalize([
        element.innerText,
        element.textContent,
        element.value,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.className,
        element.id
      ].join(" "));
      return /(^|\s)(buy|where to buy|buy now)(\s|$)/i.test(signature);
    });
    if (buyButton) buyButton.setAttribute("data-codex-wtb-buy", "1");
    return {
      productMatched,
      buyFound: Boolean(buyButton),
      buyText: buyButton
        ? String(buyButton.innerText || buyButton.textContent || buyButton.value || "").trim()
        : "",
      title: document.title || ""
    };
  }, productName);
  if (!result.productMatched) {
    throw new Error("候选页没有匹配到产品名称，已跳过该页面。");
  }
  if (!result.buyFound) {
    throw new Error("产品页没有出现 Buy 按钮。");
  }
  await page.locator("[data-codex-wtb-buy='1']").first().click({
    timeout: 8000,
    noWaitAfter: true
  });
  await page.waitForTimeout(1200);
  return result;
}

async function inspectWtbRetailerModal(page, expectedLinks) {
  return page.evaluate((links) => {
    const visible = (element) => Boolean(
      element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length)
    );
    const normalize = (value) => String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
    const roots = [...document.querySelectorAll(
      "[role='dialog'], .modal, .modal-dialog, .popup, .where-to-buy, "
      + "[class*='retailer'], [class*='where-to-buy'], [class*='whereToBuy']"
    )].filter(visible);
    const root = roots.find((element) => {
      const signature = normalize(element.innerText || element.textContent || "");
      return signature.includes("buyatretailers")
        || links.some((link) => signature.includes(normalize(link.platform)));
    }) || roots[0] || null;
    if (!root) return { modalFound: false, modalTitle: "", retailers: [] };

    const actionableElements = [...root.querySelectorAll(
      "a[href], button, [role='button'], [data-href], [data-url]"
    )].filter(visible);
    const containerElements = [...root.querySelectorAll("li, .item, .card")].filter(visible);
    const retailers = links.map((link, index) => {
      const platformKey = normalize(link.platform);
      const matchesPlatform = (candidate) => {
        const images = [...candidate.querySelectorAll("img")];
        const signature = normalize([
          candidate.innerText,
          candidate.textContent,
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("title"),
          candidate.getAttribute("href"),
          candidate.getAttribute("data-href"),
          candidate.getAttribute("data-url"),
          candidate.innerHTML,
          ...images.flatMap((image) => [
            image.alt,
            image.title,
            image.src
          ])
        ].join(" "));
        return platformKey
          && (signature.includes(platformKey) || platformKey.includes(signature));
      };
      const element = actionableElements.find(matchesPlatform)
        || containerElements.find(matchesPlatform);
      if (!element) {
        return { platform: link.platform, expectedUrl: link.url, found: false };
      }
      const anchor = element.closest("a[href]")
        || element.querySelector("a[href]")
        || (element.matches("a[href]") ? element : null);
      const clickTarget = anchor || element;
      clickTarget.setAttribute("data-codex-wtb-retailer", String(index));
      return {
        platform: link.platform,
        expectedUrl: link.url,
        found: true,
        marker: String(index),
        declaredUrl: anchor?.href
          || element.getAttribute("data-href")
          || element.getAttribute("data-url")
          || ""
      };
    });
    return {
      modalFound: true,
      modalTitle: String(
        root.querySelector("h1, h2, h3, h4, .title")?.textContent
        || root.getAttribute("aria-label")
        || ""
      ).trim(),
      retailers
    };
  }, expectedLinks);
}

async function clickWtbRetailer(context, page, retailer) {
  const sourceUrl = page.url();
  const popupPromise = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
  await page.locator(
    `[data-codex-wtb-retailer='${retailer.marker}']`
  ).first().click({ timeout: 8000, noWaitAfter: true });
  const popup = await popupPromise;
  let targetUrl = "";
  let clickMode = "";
  let loaded = false;
  if (popup) {
    clickMode = "popup";
    await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    targetUrl = popup.url();
    loaded = await popup.evaluate(() => document.readyState !== "loading").catch(() => false);
    await popup.close().catch(() => {});
  } else {
    clickMode = "same-tab-or-declared-link";
    await page.waitForTimeout(1800);
    targetUrl = page.url() !== sourceUrl ? page.url() : retailer.declaredUrl;
    loaded = Boolean(targetUrl);
  }
  return {
    platform: retailer.platform,
    expectedUrl: retailer.expectedUrl,
    declaredUrl: retailer.declaredUrl,
    targetUrl,
    clickMode,
    loaded,
    targetMatched: retailerTargetMatches(retailer.expectedUrl, targetUrl)
      || retailerTargetMatches(retailer.expectedUrl, retailer.declaredUrl)
  };
}

async function verifyWtbFrontendDisplay(context, backendPage, site, product, editInfo, logs) {
  const candidates = await collectProductFrontendCandidates(backendPage, site, product, editInfo, logs);
  if (!candidates.length) {
    return {
      status: "skipped",
      stage: "product-url",
      reason: "没有从后台编辑页定位到可复查的前台商品链接。",
      checkedUrls: []
    };
  }

  const checkedUrls = [];
  const startedAt = Date.now();
  for (const url of candidates) {
    logLine(logs, "WTB 保存后正在打开后台取得的前台商品页：" + product.productName + " / " + url);
    if (Date.now() - startedAt > 90000) {
      checkedUrls.push({
        url,
        ok: false,
        stage: "timeout",
        error: "单产品前台验证已达到 90 秒上限，停止尝试剩余候选页。"
      });
      break;
    }
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const checked = {
      url,
      ok: false,
      stage: "open-product",
      buyButtonFound: false,
      modalFound: false,
      retailers: [],
      missing: []
    };
    checkedUrls.push(checked);
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      checked.status = response?.status() || null;
      if (checked.status && checked.status >= 400) {
        throw new Error(`产品页返回 HTTP ${checked.status}。`);
      }
      checked.stage = "buy-button";
      const buy = await openWtbBuyModal(page, product.productName);
      checked.buyButtonFound = true;
      checked.buyButtonText = buy.buyText;
      checked.stage = "retailer-modal";
      const modal = await inspectWtbRetailerModal(page, product.links);
      checked.modalFound = modal.modalFound;
      checked.modalTitle = modal.modalTitle;
      checked.retailers = modal.retailers;
      if (!modal.modalFound) throw new Error("点击 Buy 后没有出现零售商弹窗。");
      checked.missing = modal.retailers
        .filter((retailer) => !retailer.found)
        .map((retailer) => ({
          platform: retailer.platform,
          url: retailer.expectedUrl,
          reason: "零售商弹窗中没有找到平台"
        }));
      if (checked.missing.length) {
        throw new Error(
          "零售商弹窗缺少平台：" + checked.missing.map((item) => item.platform).join(", ")
        );
      }

      checked.stage = "retailer-click";
      for (const retailer of modal.retailers) {
        const clickResult = await clickWtbRetailer(context, page, retailer);
        retailer.click = clickResult;
        if (!clickResult.targetMatched) {
          checked.missing.push({
            platform: retailer.platform,
            url: retailer.expectedUrl,
            actualUrl: clickResult.targetUrl || clickResult.declaredUrl,
            reason: "点击后的电商平台地址与配置不一致"
          });
        }
        if (page.url() !== url) break;
      }
      if (checked.missing.length) {
        throw new Error(
          "平台点击跳转校验失败：" + checked.missing.map((item) => item.platform).join(", ")
        );
      }
      checked.ok = true;
      checked.stage = "completed";
      logLine(logs, "WTB 前台 Buy/零售商/跳转验证通过：" + product.productName + " / " + url);
      await page.close().catch(() => {});
      return {
        status: "passed",
        stage: "completed",
        productUrl: url,
        buyButtonFound: true,
        modalFound: true,
        checkedPlatformCount: product.links.length,
        checkedUrls
      };
    } catch (error) {
      checked.error = error?.message || String(error);
      logLine(logs, "WTB 前台商品页复查未通过：" + url + " / " + checked.error);
    } finally {
      await page.close().catch(() => {});
    }
  }

  logLine(logs, "WTB 前台 Buy/零售商/跳转验证未通过：" + product.productName);
  return {
    status: "failed",
    stage: checkedUrls.at(-1)?.stage || "unknown",
    reason: "未完成 Buy 按钮、零售商弹窗和平台点击跳转的完整验证。",
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
  let backendPage = await ensureShopLoggedIn(page, {
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
    if (product.inputErrors?.length) {
      const error = product.inputErrors.join("；");
      logLine(logs, "WTB 输入冲突，已跳过产品：" + product.productName + " / " + error);
      results.push({
        status: "skipped",
        phase: "input-validation",
        errorCode: "conflicting-input",
        productName: product.productName,
        links: product.links,
        duplicateRowsSkipped: product.duplicateRowsSkipped,
        error
      });
      continue;
    }

    let editInfo = null;
    let directUpdate = null;
    let save = null;
    let backendCheck = null;
    try {
      editInfo = await findAndOpenProductEdit(backendPage, product.productName, logs);
      directUpdate = await buildWtbDirectPayload(backendPage, product.links);
      logLine(logs, "WTB 将使用已登录后台会话直接提交：" + JSON.stringify(directUpdate.applied));
      save = await postWtbDirectUpdate(backendPage, directUpdate.payload);
      backendCheck = await verifyWtbBackendState(
        backendPage,
        editInfo.editUrl,
        directUpdate.applied
      );
    } catch (error) {
      const message = error?.message || String(error);
      const errorCode = classifyWtbProductError(message);
      const status = ["product-not-found", "platform-not-available"].includes(errorCode)
        ? "skipped"
        : "failed";
      logLine(
        logs,
        `WTB ${status === "skipped" ? "已跳过" : "处理失败"}并继续下一个：`
        + product.productName + " / " + errorCode + " / " + message
      );
      results.push({
        status,
        phase: save ? "backend-readback" : editInfo ? "backend-save" : "product-search",
        errorCode,
        productName: product.productName,
        links: product.links,
        editUrl: editInfo?.editUrl || "",
        applied: directUpdate?.applied || [],
        save,
        backendCheck,
        duplicateRowsSkipped: product.duplicateRowsSkipped,
        error: message
      });
      if (backendPage.isClosed()) {
        try {
          backendPage = await ensureShopLoggedIn(await context.newPage(), {
            ...body,
            credentialDomain: credentialDomainForSite(site),
            credentialGroup: "Website"
          }, logs);
          logLine(logs, "WTB 后台页已恢复，继续处理剩余产品。");
        } catch (recoveryError) {
          logLine(
            logs,
            "WTB 后台页恢复失败，后续产品会继续尝试自行进入产品列表："
            + (recoveryError?.message || String(recoveryError))
          );
        }
      }
      continue;
    }

    let frontendCheck;
    try {
      frontendCheck = await verifyWtbFrontendDisplay(
        context,
        backendPage,
        site,
        product,
        editInfo,
        logs
      );
    } catch (error) {
      frontendCheck = {
        status: "failed",
        stage: "frontend-exception",
        reason: error?.message || String(error),
        checkedUrls: []
      };
    }
    const verified = frontendCheck.status === "passed";
    results.push({
      status: verified ? "completed" : "configured_unverified",
      phase: verified ? "completed" : "frontend-verification",
      errorCode: verified ? null : "frontend-verification-failed",
      productName: product.productName,
      editUrl: editInfo.editUrl,
      links: product.links,
      applied: directUpdate.applied,
      save,
      backendCheck,
      frontendCheck,
      duplicateRowsSkipped: product.duplicateRowsSkipped,
      error: verified ? null : frontendCheck.reason
    });
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
    verificationFailedCount: results
      .filter((item) => item.status === "configured_unverified").length,
    failedCount: results.filter((item) => item.status === "failed").length,
    skippedCount: results.filter((item) => item.status === "skipped").length,
    linkCount: rows.length,
    results,
    report
  };
}

async function testWtbRoundTrip(body, logs) {
  const productName = String(body?.productName || "").trim();
  const platform = String(body?.platform || "").trim();
  const url = String(body?.url || "").trim();
  if (!productName) throw new Error("请填写测试产品名称。");
  if (!platform) throw new Error("请填写测试购买渠道。");
  if (!/^https?:\/\//i.test(url)) throw new Error("测试购买链接必须以 http:// 或 https:// 开头。");

  const config = readCampaignConfig();
  const resolved = resolveWtbSite(config, body, []);
  const site = resolved.site;
  const context = await getShopContext();
  const page = await getOpenPage(context);
  page.setDefaultTimeout(30000);
  let backendPage = await ensureShopLoggedIn(page, {
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
    throw new Error("商城后台登录后未能读取当前用户身份，已停止 WTB 往返测试。");
  }

  const editInfo = await findAndOpenProductEdit(backendPage, productName, logs);
  const initialState = await readWtbEditorState(backendPage);
  const resolvedPlatform = resolveWtbPlatformKey(Object.keys(initialState.whereToBuy || {}), platform);
  if (!resolvedPlatform.key) {
    applyWtbLinksToMap(initialState.whereToBuy, [{ platform, url }]);
    throw new Error("未找到测试购买渠道：" + platform);
  }
  const platformKey = resolvedPlatform.key;
  const originalUrl = String(initialState.whereToBuy?.[platformKey]?.href_url || "").trim();
  const testLink = { platform: platformKey, url };
  const restoreLink = { platform: platformKey, url: originalUrl };
  let writeAttempted = false;
  let writeSave = null;
  let writeCheck = null;
  let frontendCheck = null;
  let rollbackSave = null;
  let rollbackCheck = null;
  let operationError = null;

  logLine(logs, `WTB 往返测试原值：${productName} / ${platformKey} / ${originalUrl || "(空)"}`);
  try {
    const directUpdate = await buildWtbDirectPayload(backendPage, [testLink]);
    writeAttempted = true;
    writeSave = await postWtbDirectUpdate(backendPage, directUpdate.payload);
    writeCheck = await verifyWtbBackendState(backendPage, editInfo.editUrl, [testLink]);
    frontendCheck = await verifyWtbFrontendDisplay(
      context,
      backendPage,
      site,
      { productName, productPageUrl: editInfo.productPageUrl || "", links: [testLink] },
      editInfo,
      logs
    );
    logLine(logs, "WTB 往返测试写入与后台回读完成。");
  } catch (error) {
    operationError = error;
    logLine(logs, "WTB 往返测试写入或验证失败，准备恢复原值：" + (error?.message || String(error)));
  } finally {
    if (writeAttempted) {
      try {
        await backendPage.goto(editInfo.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        const rollbackUpdate = await buildWtbDirectPayload(backendPage, [restoreLink]);
        rollbackSave = await postWtbDirectUpdate(backendPage, rollbackUpdate.payload);
        rollbackCheck = await verifyWtbBackendState(backendPage, editInfo.editUrl, [restoreLink]);
        logLine(logs, `WTB 往返测试已恢复原值：${originalUrl || "(空)"}`);
      } catch (rollbackError) {
        const firstMessage = rollbackError?.message || String(rollbackError);
        logLine(logs, "WTB 首次恢复遇到会话问题，重新登录后重试：" + firstMessage);
        try {
          backendPage = await ensureShopLoggedIn(await getOpenPage(context), {
            ...body,
            forceShopRelogin: true,
            credentialDomain: credentialDomainForSite(site),
            credentialGroup: "Website"
          }, logs);
          const retryEditInfo = await findAndOpenProductEdit(backendPage, productName, logs);
          const rollbackUpdate = await buildWtbDirectPayload(backendPage, [restoreLink]);
          rollbackSave = await postWtbDirectUpdate(backendPage, rollbackUpdate.payload);
          rollbackCheck = await verifyWtbBackendState(backendPage, retryEditInfo.editUrl, [restoreLink]);
          logLine(logs, `WTB 往返测试重新登录后已恢复原值：${originalUrl || "(空)"}`);
        } catch (retryError) {
          const retryMessage = retryError?.message || String(retryError);
          throw new Error(
            "WTB 往返测试恢复原值失败：" + retryMessage
            + "；首次恢复错误：" + firstMessage
            + (operationError ? "；此前写入/验证错误：" + (operationError?.message || String(operationError)) : "")
          );
        }
      }
    }
  }

  if (operationError) throw operationError;
  return {
    mode: "authenticated-wtb-roundtrip-test",
    site,
    authenticatedIdentity: authenticatedIdentity.replace(/\s+/g, " ").trim(),
    productName,
    platform: platformKey,
    testUrl: url,
    originalUrl,
    editUrl: editInfo.editUrl,
    write: { save: writeSave, backendCheck: writeCheck, frontendCheck },
    rollback: {
      restoredUrl: originalUrl,
      deletedTestConfiguration: originalUrl === "",
      save: rollbackSave,
      backendCheck: rollbackCheck
    }
  };
}

async function restoreWtbLink(body, logs) {
  const productName = String(body?.productName || "").trim();
  const platform = String(body?.platform || "").trim();
  const url = String(body?.url || "").trim();
  if (!productName) throw new Error("请填写要恢复的产品名称。");
  if (!platform) throw new Error("请填写要恢复的购买渠道。");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("恢复链接必须为空，或以 http://、https:// 开头。");

  const config = readCampaignConfig();
  const resolved = resolveWtbSite(config, body, []);
  const site = resolved.site;
  const context = await getShopContext();
  let page = await getOpenPage(context);
  page.setDefaultTimeout(30000);
  page = await ensureShopLoggedIn(page, {
    ...body,
    forceShopRelogin: true,
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);
  const editInfo = await findAndOpenProductEdit(page, productName, logs);
  const state = await readWtbEditorState(page);
  const resolvedPlatform = resolveWtbPlatformKey(Object.keys(state.whereToBuy || {}), platform);
  if (!resolvedPlatform.key) {
    applyWtbLinksToMap(state.whereToBuy, [{ platform, url }]);
    throw new Error("未找到要恢复的购买渠道：" + platform);
  }
  const platformKey = resolvedPlatform.key;
  const previousUrl = String(state.whereToBuy?.[platformKey]?.href_url || "").trim();
  const link = { platform: platformKey, url };
  const update = await buildWtbDirectPayload(page, [link]);
  const save = await postWtbDirectUpdate(page, update.payload);
  const backendCheck = await verifyWtbBackendState(page, editInfo.editUrl, [link]);
  logLine(logs, `WTB 链接已恢复：${productName} / ${platformKey} / ${url || "(空)"}`);
  return {
    mode: "authenticated-wtb-restore",
    site,
    productName,
    platform: platformKey,
    previousUrl,
    restoredUrl: url,
    deletedConfiguration: url === "",
    editUrl: editInfo.editUrl,
    save,
    backendCheck
  };
}

  return {
    buildWtbPlan,
    submitWtbToBackend,
    testWtbRoundTrip,
    restoreWtbLink,
    _test: {
      retailerTargetMatches,
      selectBackendFrontendCandidates,
      groupWtbRows,
      classifyWtbProductError,
      openWtbBuyModal,
      inspectWtbRetailerModal,
      clickWtbRetailer
    },
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
  resolveWtbPlatformKey,
  applyWtbLinksToMap,
  parseWtbWorkbook
};
