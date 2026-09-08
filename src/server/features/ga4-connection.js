const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCOPES = [
  "https://www.googleapis.com/auth/analytics",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/webmasters"
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GSC_API = "https://www.googleapis.com/webmasters/v3";
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
    if (!response.ok) throw new Error(data.error_description || data.error?.message || data.error || `Google request failed (${response.status}).`);
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
    token.expires_at = Date.now() + Number(token.expires_in || 3600) * 1000;
    saveJson(tokenPath, token, 0o600);
    cachedToken = { value: token.access_token, expiresAt: token.expires_at };
    return { propertyId: request.propertyId, report: await runReport(request.propertyId, token.access_token) };
  }

  async function test() {
    const id = propertyId(readJson(configPath).propertyId);
    return { propertyId: id, report: await runReport(id) };
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

  function status() {
    let id = "";
    try {
      id = propertyId(readJson(configPath).propertyId);
      readClient();
      return { configured: true, connected: fs.existsSync(tokenPath) && Boolean(readJson(tokenPath).refresh_token), propertyId: id };
    } catch {
      return { configured: fs.existsSync(clientPath), connected: false, propertyId: id };
    }
  }

  return { start, complete, test, status, listSearchConsoleSites, querySearchConsole };
}

module.exports = { propertyId, oauthClient, createGa4Connection, SCOPES, isoDateDaysAgo };
