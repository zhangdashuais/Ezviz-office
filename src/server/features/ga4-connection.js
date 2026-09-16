const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCOPES = [
  "https://www.googleapis.com/auth/analytics",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/spreadsheets"
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GSC_API = "https://www.googleapis.com/webmasters/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_PRODUCT_TRACKER = {
  spreadsheetId: "1WB-qHIK6_jjH56ubzytJyOerl_HsrYJ08zslkMg3Vig",
  sheetId: 0,
  sheetTitle: "Product Status",
  timeZone: "Asia/Shanghai"
};
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;

if (PROXY_URL) {
  const { ProxyAgent, setGlobalDispatcher } = require("undici");
  setGlobalDispatcher(new ProxyAgent(PROXY_URL));
}

function propertyId(value) {
  const id = String(value || "").trim().replace(/^properties\//, "");
  if (!/^\d+$/.test(id)) throw new Error("GA4 Property ID must be numeric.");
  return id;
}

function oauthClient(value) {
  const json = typeof value === "string" || Buffer.isBuffer(value) ? JSON.parse(value.toString("utf8")) : value;
  const client = json?.installed || json?.web;
  if (!client?.client_id || !client?.client_secret) throw new Error("Invalid Google OAuth client JSON.");
  return { client_id: client.client_id, client_secret: client.client_secret };
}

const isoDateDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

function createGa4Connection(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const { clientPath, configPath, tokenPath, redirectUri } = options;
  const pending = new Map();
  const productTracker = { ...DEFAULT_PRODUCT_TRACKER, ...(options.productTracker || {}) };
  let cachedToken = null;

  const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const readClient = () => {
    if (!fs.existsSync(clientPath)) throw new Error(`Missing OAuth client JSON: ${clientPath}`);
    return oauthClient(readJson(clientPath));
  };
  const saveJson = (file, value, mode) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), mode ? { mode } : undefined);
  };

  async function json(url, options = {}) {
    const response = await fetchImpl(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 403 && String(url).startsWith(SHEETS_API)) {
        throw new Error("Google Sheets 权限不足。请先在 Google Cloud 启用 Google Sheets API，再到 GA4 / Google 数据页面点击“登录 Google 并连接”重新授权。");
      }
      throw new Error(data.error_description || data.error?.message || data.error || `Google request failed (${response.status}).`);
    }
    return data;
  }

  async function tokenRequest(params) {
    const data = await json(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params)
    });
    if (!data.access_token) throw new Error("Google OAuth did not return an access token.");
    return data;
  }

  async function accessToken() {
    if (cachedToken?.expiresAt > Date.now() + 60000) return cachedToken.value;
    const token = readJson(tokenPath);
    if (token.access_token && token.expires_at > Date.now() + 60000) return token.access_token;
    if (!token.refresh_token) throw new Error("Google authorization expired. Reconnect first.");
    const refreshed = await tokenRequest({ ...readClient(), refresh_token: token.refresh_token, grant_type: "refresh_token" });
    const saved = { ...token, ...refreshed, refresh_token: token.refresh_token, expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000 };
    saveJson(tokenPath, saved, 0o600);
    cachedToken = { value: saved.access_token, expiresAt: saved.expires_at };
    return saved.access_token;
  }

  async function google(url, body, token) {
    return json(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token || await accessToken()}`,
        ...(body ? { "content-type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }

  async function runReport(id, token) {
    const data = await google(`${DATA_API}/properties/${propertyId(id)}:runReport`, {
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: ["activeUsers", "sessions", "screenPageViews"].map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: "date" }, desc: true }],
      limit: 7
    }, token);
    return {
      headers: [...(data.dimensionHeaders || []), ...(data.metricHeaders || [])].map((item) => item.name),
      rows: (data.rows || []).map((row) => [...(row.dimensionValues || []), ...(row.metricValues || [])].map((item) => item.value))
    };
  }

  function start(input) {
    const id = propertyId(input?.propertyId);
    const client = readClient();
    saveJson(configPath, { propertyId: id });
    const state = crypto.randomBytes(24).toString("hex");
    pending.set(state, { propertyId: id, createdAt: Date.now() });
    return {
      propertyId: id,
      authUrl: `${AUTH_URL}?${new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state
      })}`
    };
  }

  async function complete(code, state) {
    const request = pending.get(String(state || ""));
    pending.delete(String(state || ""));
    if (!request || Date.now() - request.createdAt > 600000) throw new Error("OAuth request expired. Reconnect first.");
    const token = await tokenRequest({ ...readClient(), code: String(code || ""), redirect_uri: redirectUri, grant_type: "authorization_code" });
    if (!token.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve again.");
    token.scope = token.scope || SCOPES.join(" ");
    token.expires_at = Date.now() + Number(token.expires_in || 3600) * 1000;
    saveJson(tokenPath, token, 0o600);
    cachedToken = { value: token.access_token, expiresAt: token.expires_at };
    return { propertyId: request.propertyId, report: await runReport(request.propertyId, token.access_token) };
  }

  async function test() {
    const id = propertyId(readJson(configPath).propertyId);
    const token = readJson(tokenPath);
    return { propertyId: id, sheetsConnected: String(token.scope || "").split(/\s+/).includes(SCOPES[3]), report: await runReport(id) };
  }

  async function listSearchConsoleSites() {
    const data = await google(`${GSC_API}/sites`);
    return (data.siteEntry || []).map(({ siteUrl, permissionLevel }) => ({ siteUrl, permissionLevel }));
  }

  async function querySearchConsole(input = {}) {
    const siteUrl = String(input.siteUrl || "").trim();
    if (!siteUrl) throw new Error("Search Console siteUrl is required.");
    const data = await google(`${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      startDate: input.startDate || isoDateDaysAgo(7),
      endDate: input.endDate || isoDateDaysAgo(1),
      dimensions: input.dimensions || ["date"],
      rowLimit: Number(input.rowLimit || 10)
    });
    return {
      siteUrl,
      rows: (data.rows || []).map(({ keys = [], clicks = 0, impressions = 0, ctr = 0, position = 0 }) => ({ keys, clicks, impressions, ctr, position }))
    };
  }

  function currentDateSerial() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: productTracker.timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric"
    }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000 + 25569;
  }

  const normalizedProductName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const trackerRange = () => encodeURIComponent(`'${productTracker.sheetTitle.replace(/'/g, "''")}'!A:D`);

  async function inspectServiceCenterProduct(productName) {
    const name = String(productName || "").trim();
    if (!name) throw new Error("产品名称不能为空。");
    const base = `${SHEETS_API}/${productTracker.spreadsheetId}`;
    const metadata = await google(`${base}?fields=sheets(properties)`);
    const sheet = (metadata.sheets || []).find(({ properties }) => (
      Number(properties?.sheetId) === Number(productTracker.sheetId)
      && properties?.title === productTracker.sheetTitle
    ));
    if (!sheet) throw new Error(`Google Sheet 中未找到 ${productTracker.sheetTitle}（gid=${productTracker.sheetId}）。`);
    const data = await google(`${base}/values/${trackerRange()}?majorDimension=ROWS`);
    const rows = data.values || [];
    const matchIndex = rows.findIndex((row) => normalizedProductName(row[0]) === normalizedProductName(name));
    let lastRow = 0;
    rows.forEach((row, index) => {
      if (row.some((value) => String(value ?? "").trim())) lastRow = index + 1;
    });
    return {
      exists: matchIndex >= 0,
      row: matchIndex >= 0 ? matchIndex + 1 : null,
      values: matchIndex >= 0 ? rows[matchIndex].slice(0, 4) : null,
      lastRow,
      spreadsheetId: productTracker.spreadsheetId,
      sheetTitle: productTracker.sheetTitle
    };
  }

  async function syncServiceCenterProduct(productName) {
    const before = await inspectServiceCenterProduct(productName);
    if (before.exists) return { ...before, status: "exists" };
    if (before.lastRow < 4) throw new Error("Product Status 缺少可复制的示例数据行，已停止写入。");
    const destinationRow = before.lastRow + 1;
    const startRowIndex = destinationRow - 1;
    await google(`${SHEETS_API}/${productTracker.spreadsheetId}:batchUpdate`, {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId: productTracker.sheetId,
              startRowIndex: before.lastRow - 1,
              endRowIndex: before.lastRow,
              startColumnIndex: 0,
              endColumnIndex: 4
            },
            destination: {
              sheetId: productTracker.sheetId,
              startRowIndex,
              endRowIndex: startRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 4
            },
            pasteType: "PASTE_NORMAL",
            pasteOrientation: "NORMAL"
          }
        },
        {
          updateCells: {
            range: {
              sheetId: productTracker.sheetId,
              startRowIndex,
              endRowIndex: startRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 4
            },
            rows: [{ values: [
              { userEnteredValue: { stringValue: String(productName).trim() } },
              { userEnteredValue: { numberValue: currentDateSerial() } },
              { userEnteredValue: { stringValue: "Live" } },
              { userEnteredValue: { stringValue: "Live" } }
            ] }],
            fields: "userEnteredValue"
          }
        }
      ]
    });
    const after = await inspectServiceCenterProduct(productName);
    if (!after.exists || after.row !== destinationRow || after.values?.[2] !== "Live" || after.values?.[3] !== "Live") {
      throw new Error("Google Sheet 写入后的回读验证失败，请人工检查目标表。");
    }
    return { ...after, status: "appended" };
  }

  function status() {
    let id = "";
    try {
      id = propertyId(readJson(configPath).propertyId);
      readClient();
      const token = fs.existsSync(tokenPath) ? readJson(tokenPath) : {};
      return {
        configured: true,
        connected: Boolean(token.refresh_token),
        sheetsConnected: String(token.scope || "").split(/\s+/).includes(SCOPES[3]),
        propertyId: id
      };
    } catch {
      return { configured: fs.existsSync(clientPath), connected: false, sheetsConnected: false, propertyId: id };
    }
  }

  return {
    start,
    complete,
    test,
    status,
    listSearchConsoleSites,
    querySearchConsole,
    inspectServiceCenterProduct,
    syncServiceCenterProduct
  };
}

module.exports = { propertyId, oauthClient, createGa4Connection, SCOPES, isoDateDaysAgo, DEFAULT_PRODUCT_TRACKER };
