const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const REQUIRED_HEADERS = ["Record ID", "Site URL", "Language", "Page Type", "Page URL", "Title", "Description"];

function text(value) {
  return String(value == null ? "" : value).trim();
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedSiteUrl(value) {
  try {
    const url = new URL(value);
    return (url.origin + url.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function resolveSiteForRow(row, sites) {
  const requestedCode = text(row["Site Code"]).toLowerCase();
  if (requestedCode) return sites.find((site) => text(site.siteCode).toLowerCase() === requestedCode) || null;
  const requestedUrl = normalizedSiteUrl(row["Site URL"]);
  if (!requestedUrl) return null;
  return sites.find((site) => normalizedSiteUrl(site.url) === requestedUrl) || null;
}

function pagePath(value) {
  const url = new URL(value);
  return url.pathname + url.search + url.hash;
}

function parseTdkWorkbook(filePath, sites) {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheetName = workbook.SheetNames.find((name) => name === "TDK配置") || workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel 中没有工作表。");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headers = (matrix[0] || []).map(text);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false })
    .filter((row) => Object.values(row).some((value) => text(value)));
  const issues = REQUIRED_HEADERS.filter((header) => !headers.includes(header)).map((header) => `缺少必填表头：${header}`);
  const seenIds = new Set();
  const normalizedRows = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    REQUIRED_HEADERS.forEach((header) => {
      if (!text(row[header])) issues.push(`第 ${rowNumber} 行缺少 ${header}`);
    });
    const recordId = text(row["Record ID"]);
    if (recordId && seenIds.has(recordId)) issues.push(`第 ${rowNumber} 行 Record ID 重复：${recordId}`);
    if (recordId) seenIds.add(recordId);
    const action = text(row.Action).toLowerCase() || "update";
    if (!["create", "update", "skip"].includes(action)) issues.push(`第 ${rowNumber} 行 Action 应为 create、update 或 skip`);
    if (text(row["Site URL"]) && !validHttpUrl(text(row["Site URL"]))) issues.push(`第 ${rowNumber} 行 Site URL 不是有效网址`);
    if (text(row["Page URL"]) && !validHttpUrl(text(row["Page URL"]))) issues.push(`第 ${rowNumber} 行 Page URL 不是有效网址`);

    const site = resolveSiteForRow(row, sites);
    if (!site) {
      issues.push(`第 ${rowNumber} 行无法匹配站点：${text(row["Site Code"]) || text(row["Site URL"])}`);
    } else if (validHttpUrl(text(row["Page URL"]))) {
      const pageUrl = new URL(text(row["Page URL"]));
      const siteUrl = new URL(site.url);
      const siteBase = siteUrl.pathname.replace(/\/+$/, "");
      if (pageUrl.hostname !== siteUrl.hostname || (siteBase && !pageUrl.pathname.startsWith(siteBase + "/") && pageUrl.pathname !== siteBase)) {
        issues.push(`第 ${rowNumber} 行 Page URL 不属于站点 ${site.siteCode}`);
      }
    }

    normalizedRows.push({
      rowNumber,
      recordId,
      site,
      siteCode: site?.siteCode || text(row["Site Code"]),
      language: text(row.Language),
      pageType: text(row["Page Type"]),
      pageUrl: text(row["Page URL"]),
      urlPath: validHttpUrl(text(row["Page URL"])) ? pagePath(text(row["Page URL"])) : "",
      title: text(row.Title),
      description: text(row.Description),
      keywords: text(row.Keywords),
      action,
      notes: text(row.Notes)
    });
  });

  if (!rows.length) issues.push("Excel 中没有可处理的数据行。");
  return { sheetName, headers, rows: normalizedRows, issues };
}

function writeOfficialImportWorkbook(rows, outputPath) {
  const data = [["url", "title", "description", "keyword", ""]];
  rows.forEach((row) => data.push([row.urlPath, row.title, row.description, row.keywords, ""]));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet["!cols"] = [{ wch: 55 }, { wch: 55 }, { wch: 80 }, { wch: 45 }, { wch: 2 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Worksheet");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(workbook, outputPath, { compression: true });
  return outputPath;
}

function groupRowsBySite(rows) {
  const groups = new Map();
  rows.filter((row) => row.action !== "skip").forEach((row) => {
    if (!groups.has(row.siteCode)) groups.set(row.siteCode, { site: row.site, rows: [] });
    groups.get(row.siteCode).rows.push(row);
  });
  return [...groups.values()];
}

function createTdkManagementFeature({ logLine, SHOP_DASHBOARD_URL, browserAuth, shopCredentials }) {
  async function openTdkIndex(page, logs) {
    await page.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const target = await page.evaluate(() => {
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const candidates = [...document.querySelectorAll("a, button, li, span")].filter((el) =>
        visible(el) && (el.innerText || el.textContent || "").trim() === "TDK"
      );
      const element = candidates.find((el) => el.tagName === "A") || candidates[0];
      if (!element) return null;
      const anchor = element.closest("a") || element.querySelector?.("a") || element;
      return { text: (element.innerText || element.textContent || "").trim(), href: anchor.getAttribute?.("href") || "" };
    });
    if (!target) throw new Error("商城后台左侧导航中没有找到 TDK 入口。");
    logLine(logs, "打开商城后台 TDK 入口：" + JSON.stringify(target));
    if (target.href) {
      const targetUrl = new URL(target.href, SHOP_DASHBOARD_URL).toString();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    } else {
      await page.getByText("TDK", { exact: true }).first().click();
    }
    await page.waitForTimeout(3500);
    return page.url();
  }

  async function waitForImportResult(page, timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const message = await page.evaluate(() => {
        const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const candidates = [...document.querySelectorAll(".ant-message-notice-content, .ant-notification-notice, [role=alert]")]
          .filter(visible).map((el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
        return candidates.find((item) => /import|success|failed|error/i.test(item)) || "";
      }).catch(() => "");
      if (message) return message;
      await page.waitForTimeout(500);
    }
    return "";
  }

  async function importWorkbook(page, workbookPath, rows, logs) {
    const requests = [];
    const onResponse = (response) => {
      const request = response.request();
      if (!/tdk|import|upload/i.test(response.url()) || request.method() === "GET") return;
      requests.push({ method: request.method(), url: response.url(), status: response.status() });
    };
    page.on("response", onResponse);
    let message = "";
    try {
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 30000 });
      await page.getByRole("button", { name: /^Import$/i }).first().click();
      const chooser = await chooserPromise;
      await chooser.setFiles(workbookPath);
      logLine(logs, `已上传 TDK 导入文件：${path.basename(workbookPath)}（${rows.length} 行）`);
      message = await waitForImportResult(page);
    } finally {
      page.off("response", onResponse);
    }
    if (!message) throw new Error("TDK 后台在 30 秒内没有返回导入结果。");
    logLine(logs, "TDK 后台返回：" + message);
    if (/fail|error/i.test(message) || !/success/i.test(message)) throw new Error("TDK 导入未成功：" + message);
    await page.waitForTimeout(1500);
    return { message, requests };
  }

  async function verifyImportedRows(page, rows, logs) {
    const results = [];
    for (const row of rows) {
      await page.locator("#name").fill(row.urlPath);
      await page.getByRole("button", { name: /^Search$/i }).first().click();
      await page.waitForTimeout(700);
      const found = await page.evaluate(({ urlPath, title }) => [...document.querySelectorAll("tr")].some((tr) => {
        const value = (tr.innerText || tr.textContent || "").replace(/\s+/g, " ").trim();
        return value.includes(urlPath) && value.includes(title);
      }), { urlPath: row.urlPath, title: row.title }).catch(() => false);
      results.push({ recordId: row.recordId, urlPath: row.urlPath, found });
    }
    const verified = results.filter((item) => item.found).length;
    logLine(logs, `TDK 列表复核：${verified}/${results.length} 行已找到。`);
    return results;
  }

  async function submitRows(rows, payload, logs) {
    const groups = groupRowsBySite(rows);
    const skipped = rows.filter((row) => row.action === "skip").map((row) => row.recordId);
    if (!groups.length) throw new Error("没有需要提交的 TDK 数据；所有行均为 skip。");
    const jobDir = path.resolve(process.cwd(), "runtime", "tdk", "jobs", Date.now().toString());
    const results = [];
    for (const group of groups) {
      logLine(logs, `开始处理站点 ${group.site.name} (${group.site.siteCode})，共 ${group.rows.length} 行。`);
      const page = await browserAuth.getOpenPage(await browserAuth.getShopContext());
      page.setDefaultTimeout(25000);
      const backendPage = await browserAuth.ensureShopLoggedIn(page, {
        ...(payload || {}),
        forceShopRelogin: true,
        credentialDomain: shopCredentials.domainForSite(group.site),
        credentialGroup: "Website"
      }, logs);
      await openTdkIndex(backendPage, logs);
      const workbookPath = writeOfficialImportWorkbook(group.rows, path.join(jobDir, `tdk-${group.site.siteCode}.xlsx`));
      const imported = await importWorkbook(backendPage, workbookPath, group.rows, logs);
      const verification = await verifyImportedRows(backendPage, group.rows, logs);
      results.push({
        site: group.site,
        rowCount: group.rows.length,
        importMessage: imported.message,
        requests: imported.requests,
        verifiedCount: verification.filter((item) => item.found).length,
        verification
      });
    }
    return {
      submittedRows: groups.reduce((sum, group) => sum + group.rows.length, 0),
      skippedRows: skipped.length,
      skippedRecordIds: skipped,
      siteCount: groups.length,
      results
    };
  }

  return { openTdkIndex, submitRows };
}

module.exports = {
  createTdkManagementFeature,
  REQUIRED_HEADERS,
  text,
  parseTdkWorkbook,
  resolveSiteForRow,
  writeOfficialImportWorkbook,
  groupRowsBySite
};
