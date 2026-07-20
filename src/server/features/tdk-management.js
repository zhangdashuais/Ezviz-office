const XLSX = require("xlsx");

const TDK_FIELDS = ["urlPath", "title", "keyword", "description"];
const TDK_HEADERS = ["Url Path", "Title", "Keyword", "Discription"];
const HEADER_ALIASES = new Map([
  ["url path", "urlPath"],
  ["urlpath", "urlPath"],
  ["title", "title"],
  ["keyword", "keyword"],
  ["keywords", "keyword"],
  ["discription", "description"],
  ["description", "description"]
]);

function cleanText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeHeader(value) {
  return cleanText(value).replace(/\s+/g, " ").toLowerCase();
}

function canonicalHeader(value) {
  return HEADER_ALIASES.get(normalizeHeader(value)) || "";
}

function parseTdkWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name === "TDK配置") || workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel 中没有工作表。");

  const values = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false
  });
  const sourceHeaders = (values[0] || []).map(cleanText);
  const fieldColumns = {};
  sourceHeaders.forEach((header, columnIndex) => {
    const field = canonicalHeader(header);
    if (field && fieldColumns[field] == null) fieldColumns[field] = columnIndex;
  });

  const headerIssues = TDK_FIELDS
    .filter((field) => fieldColumns[field] == null)
    .map((field) => `缺少必填表头：${TDK_HEADERS[TDK_FIELDS.indexOf(field)]}`);

  const rows = values.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    urlPath: cleanText(cells[fieldColumns.urlPath]),
    title: cleanText(cells[fieldColumns.title]),
    keyword: cleanText(cells[fieldColumns.keyword]),
    description: cleanText(cells[fieldColumns.description])
  })).filter((row) => TDK_FIELDS.some((field) => row[field]));

  return { sheetName, sourceHeaders, rows, headerIssues };
}

function validateTdkRows(rows, headerIssues = []) {
  const issues = [...headerIssues];
  const seenPaths = new Map();
  if (!rows.length) issues.push("Excel 中没有可提交的 TDK 数据行。");

  for (const row of rows) {
    for (const field of TDK_FIELDS) {
      if (!row[field]) {
        issues.push(`第 ${row.rowNumber} 行缺少 ${TDK_HEADERS[TDK_FIELDS.indexOf(field)]}`);
      }
    }
    if (row.urlPath && (!row.urlPath.startsWith("/") || /^https?:\/\//i.test(row.urlPath))) {
      issues.push(`第 ${row.rowNumber} 行 Url Path 必须是以 / 开头的相对路径`);
    }
    if (row.urlPath) {
      if (seenPaths.has(row.urlPath)) {
        issues.push(`第 ${row.rowNumber} 行 Url Path 与第 ${seenPaths.get(row.urlPath)} 行重复：${row.urlPath}`);
      } else {
        seenPaths.set(row.urlPath, row.rowNumber);
      }
    }
  }
  return issues;
}

function createTdkManagement(deps) {
  const {
    fs,
    logLine,
    NEW_SHOP_API_BASE,
    NEW_SHOP_TDK_INDEX_URL,
    readCampaignConfig,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite
  } = deps;

  function buildPlan(body, files) {
    const file = files?.tdkExcel?.[0];
    if (!file?.path || !fs.existsSync(file.path)) throw new Error("请先选择 TDK Excel 文件。");
    const parsed = parseTdkWorkbook(file.path);
    const issues = validateTdkRows(parsed.rows, parsed.headerIssues);
    return {
      fileName: file.originalname || file.filename || "",
      sheetName: parsed.sheetName,
      headers: parsed.sourceHeaders,
      rowCount: parsed.rows.length,
      rows: parsed.rows,
      issues
    };
  }

  async function postTdk(page, payload) {
    const response = await page.request.post(NEW_SHOP_API_BASE + "/seo-tdk/create", {
      data: payload,
      headers: { "operator-from": "shop" },
      timeout: 60000
    });
    const responseText = await response.text().catch(() => "");
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("TDK 接口返回的不是 JSON：" + responseText.slice(0, 200));
    }
    const code = Number(data?.code);
    if (!response.ok() || ![0, 200].includes(code)) {
      throw new Error(data?.msg || data?.message || `TDK 接口返回异常（HTTP ${response.status()}）`);
    }
    return data;
  }

  async function submit(body, files, logs) {
    const config = readCampaignConfig();
    const site = requireSingleCampaignSite(config, body);
    if (String(site.siteCode || "").toLowerCase() !== "hq") {
      throw new Error("TDK 快速配置当前仅开放国际站（hq）。");
    }

    const plan = buildPlan(body, files);
    if (plan.issues.length) {
      throw new Error("TDK Excel 校验未通过：" + plan.issues.slice(0, 8).join("；"));
    }

    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(30000);
    page = await ensureShopLoggedIn(page, {
      ...body,
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);

    logLine(logs, "进入国际站 TDK 管理页以建立后台登录态。");
    await page.goto(NEW_SHOP_TDK_INDEX_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const results = [];
    for (const row of plan.rows) {
      const payload = {
        urlPath: row.urlPath,
        title: row.title,
        keyword: row.keyword,
        description: row.description,
        shareExtra: { facebook: { image: "" } }
      };
      try {
        const response = await postTdk(page, payload);
        const seoTdkNo = response?.data?.seoTdkNo || "";
        results.push({ rowNumber: row.rowNumber, urlPath: row.urlPath, status: "completed", seoTdkNo });
        logLine(logs, `第 ${row.rowNumber} 行提交成功：${row.urlPath}${seoTdkNo ? "（" + seoTdkNo + "）" : ""}`);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        results.push({ rowNumber: row.rowNumber, urlPath: row.urlPath, status: "failed", error: message });
        logLine(logs, `第 ${row.rowNumber} 行提交失败：${row.urlPath}；${message}`);
      }
    }

    const completed = results.filter((item) => item.status === "completed").length;
    const failed = results.length - completed;
    logLine(logs, `TDK 批量提交完成：成功 ${completed} 条，失败 ${failed} 条。`);
    return {
      mode: "direct-post",
      site,
      apiUrl: NEW_SHOP_API_BASE + "/seo-tdk/create",
      total: results.length,
      completed,
      failed,
      results,
      currentUrl: page.url()
    };
  }

  return { buildPlan, submit };
}

module.exports = {
  TDK_FIELDS,
  TDK_HEADERS,
  canonicalHeader,
  parseTdkWorkbook,
  validateTdkRows,
  createTdkManagement
};
