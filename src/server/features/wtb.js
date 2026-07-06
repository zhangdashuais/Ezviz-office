function createWtbFeature(deps) {
  const {
    fs,
    path,
    logLine,
    zipEntries,
    sharedStrings,
    readRows,
    readCampaignConfig,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductAdditionalInformation,
    clickTextInProductEditor
  } = deps;

function normalizeWtbHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-（）()：:]+/g, "");
}

function readWtbWorkbook(file) {
  if (!file?.path || !fs.existsSync(file.path)) return [];
  const entries = zipEntries(fs.readFileSync(file.path));
  const shared = sharedStrings(entries.get("xl/sharedStrings.xml"));
  const rows = readRows(entries.get("xl/worksheets/sheet1.xml"), shared).filter((row) =>
    row && row.some((cell) => String(cell || "").trim())
  );
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeWtbHeader);
  const productIndex = headers.findIndex((item) => ["产品名称", "产品名", "productname", "product", "name"].includes(item));
  const platformIndex = headers.findIndex((item) => ["购买平台", "平台", "platform", "shop", "store", "retailer"].includes(item));
  const urlIndex = headers.findIndex((item) => ["购买链接", "链接", "link", "url", "buyurl", "href"].includes(item));
  if (productIndex < 0 || platformIndex < 0 || urlIndex < 0) {
    throw new Error("WTB Excel 表头需要包含：产品名称、购买平台、购买链接。");
  }

  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    productName: String(row[productIndex] || "").trim(),
    platform: String(row[platformIndex] || "").trim(),
    url: String(row[urlIndex] || "").trim()
  })).filter((item) => item.productName || item.platform || item.url);
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
    if (!row.productName) throw new Error("WTB 第 " + row.rowNumber + " 行缺少产品名称。");
    if (!row.platform) throw new Error("WTB 第 " + row.rowNumber + " 行缺少购买平台。");
    if (!row.url) throw new Error("WTB 第 " + row.rowNumber + " 行缺少购买链接。");
    if (!/^https?:\/\//i.test(row.url)) throw new Error("WTB 第 " + row.rowNumber + " 行购买链接必须以 http:// 或 https:// 开头。");
  });
  return rows;
}

function groupWtbRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.productName.trim().toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { productName: row.productName.trim(), links: [] });
    grouped.get(key).links.push({ platform: row.platform.trim(), url: row.url.trim(), rowNumber: row.rowNumber });
  }
  return [...grouped.values()];
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
      const rows = [...document.querySelectorAll("tr")].filter(visible);
      const exactRow = rows.find((row) => {
        const cells = [...row.querySelectorAll("td")].map((td) => (td.innerText || "").trim().toLowerCase());
        return cells.some((cell) => cell === normalizedTarget);
      });
      const fuzzyRow = rows.find((row) => (row.innerText || "").trim().toLowerCase().includes(normalizedTarget));
      const row = exactRow || fuzzyRow;
      if (!row) return { ok: false };
      const controls = [...row.querySelectorAll("a, button")].filter(visible);
      const edit = controls.find((el) => /^(edit|编辑)$/i.test((el.innerText || el.textContent || "").trim()))
        || controls.find((el) => /\/goods\/add\?id=|\/goods\/edit/i.test(el.getAttribute("href") || ""));
      if (!edit) return { ok: false, reason: "找到产品行，但没有找到 Edit 按钮。", rowText: row.innerText };
      const href = edit.href || edit.getAttribute("href") || "";
      const candidateUrls = [...row.querySelectorAll("a")]
        .map((link) => link.href || link.getAttribute("href") || "")
        .filter(Boolean);
      edit.click();
      return { ok: true, href, rowText: row.innerText, candidateUrls };
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
  logLine(logs, "已打开产品编辑：" + productName + " / " + JSON.stringify({ href: clicked.href, rowText: clicked.rowText?.slice(0, 240) }));
  await page.waitForTimeout(5000);
  return {
    editUrl: page.url(),
    rowText: clicked.rowText || "",
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
      const labels = [...pane.querySelectorAll("label, span, div, td, th")].filter((el) => {
        const text = (el.innerText || el.textContent || "").replace(/[:：]/g, "").trim().toLowerCase();
        return visible(el) && text === normalized;
      });
      for (const label of labels) {
        const container = label.closest(".form-group, .form-horizontal, .row, tr, div") || label.parentElement;
        const scoped = [...(container?.querySelectorAll("input[type='text'], input:not([type]), textarea") || [])].filter(visible);
        if (scoped.length) return scoped[0];
        let node = label;
        for (let i = 0; i < 8 && node; i += 1) {
          node = node.nextElementSibling || node.parentElement?.nextElementSibling;
          const input = node?.matches?.("input, textarea") ? node : node?.querySelector?.("input[type='text'], input:not([type]), textarea");
          if (visible(input)) return input;
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
    if (/\/goods\/do-edit-goods/i.test(request.url())) {
      captured.push({ method: request.method(), url: request.url(), postData: request.postData() || "" });
    }
  };
  const onResponse = (response) => {
    if (/\/goods\/do-edit-goods/i.test(response.url())) {
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
  if (!saveRequest) throw new Error("没有捕获到产品保存请求 /goods/do-edit-goods。");
  const saveResponse = [...captured].reverse().find((item) => item.status);
  if (saveResponse && saveResponse.status >= 400) {
    throw new Error("产品保存接口返回异常状态：" + saveResponse.status);
  }
  logLine(logs, "WTB 保存请求已发送：" + saveRequest.url);
  return { requestUrl: saveRequest.url, responseStatus: saveResponse?.status || null };
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
  return {
    mode: "wtb-plan",
    productCount: products.length,
    linkCount: rows.length,
    products
  };
}

async function submitWtbToBackend(body, files, logs) {
  const config = readCampaignConfig();
  const site = requireSingleCampaignSite(config, body);
  const rows = buildWtbRows(body, files);
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

  const results = [];
  for (const product of products) {
    logLine(logs, "开始处理 WTB 产品：" + product.productName);
    const editInfo = await findAndOpenProductEdit(backendPage, product.productName, logs);
    const applied = await fillProductWhereToBuyLinks(backendPage, product.links, logs);
    const save = await saveCurrentProductAndCapture(backendPage, logs);
    const frontendCheck = await verifyWtbFrontendDisplay(context, backendPage, site, product, editInfo, logs);
    results.push({
      productName: product.productName,
      editUrl: editInfo.editUrl,
      links: product.links,
      applied: applied.applied,
      save,
      frontendCheck
    });
  }

  return {
    mode: "playwright-form-save",
    site,
    productCount: results.length,
    linkCount: rows.length,
    results
  };
}

  return {
    buildWtbPlan,
    submitWtbToBackend
  };
}

module.exports = { createWtbFeature };
