const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGa4Connection, SCOPES } = require("./ga4-connection");

test("GA4 OAuth completes authorization and reads a report", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ga4-oauth-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    clientPath: path.join(root, "client.json"),
    configPath: path.join(root, "config.json"),
    tokenPath: path.join(root, "token.json")
  };
  fs.writeFileSync(files.clientPath, JSON.stringify({
    installed: { client_id: "client-id", client_secret: "client-secret" }
  }));
  const requests = [];
  const feature = createGa4Connection({
    ...files,
    redirectUri: "http://localhost:3217/api/ga4/oauth/callback",
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      if (url.includes("oauth2")) {
        return {
          ok: true,
          json: async () => ({ access_token: "token", refresh_token: "refresh", expires_in: 3600 })
        };
      }
      return {
        ok: true,
        json: async () => ({
          dimensionHeaders: [{ name: "date" }],
          metricHeaders: [{ name: "activeUsers" }],
          rows: [{ dimensionValues: [{ value: "20260808" }], metricValues: [{ value: "12" }] }]
        })
      };
    }
  });

  const started = feature.start({ propertyId: "properties/311294431" });
  const authParams = new URL(started.authUrl).searchParams;
  const state = authParams.get("state");
  const result = await feature.complete("authorization-code", state);

  for (const scope of SCOPES) assert.match(authParams.get("scope"), new RegExp(scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(result.propertyId, "311294431");
  assert.deepEqual(result.report.rows, [["20260808", "12"]]);
  assert.equal(requests.length, 2);
  assert.match(requests[1][0], /properties\/311294431:runReport$/);
  assert.deepEqual(feature.status(), {
    configured: true,
    connected: true,
    propertyId: "311294431"
  });
});

test("Search Console lists sites and queries search analytics", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-oauth-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    clientPath: path.join(root, "client.json"),
    configPath: path.join(root, "config.json"),
    tokenPath: path.join(root, "token.json")
  };
  fs.writeFileSync(files.clientPath, JSON.stringify({
    installed: { client_id: "client-id", client_secret: "client-secret" }
  }));
  fs.writeFileSync(files.configPath, JSON.stringify({ propertyId: "311294431" }));
  fs.writeFileSync(files.tokenPath, JSON.stringify({
    access_token: "token",
    refresh_token: "refresh",
    expires_at: Date.now() + 3600000
  }));
  const requests = [];
  const feature = createGa4Connection({
    ...files,
    redirectUri: "http://localhost:3217/api/ga4/oauth/callback",
    fetchImpl: async (url, options = {}) => {
      requests.push([url, options]);
      if (url.endsWith("/sites")) {
        return {
          ok: true,
          json: async () => ({ siteEntry: [{ siteUrl: "https://www.ezviz.com/", permissionLevel: "siteOwner" }] })
        };
      }
      return {
        ok: true,
        json: async () => ({ rows: [{ keys: ["2026-08-08"], clicks: 3, impressions: 30, ctr: 0.1, position: 8.5 }] })
      };
    }
  });

  const sites = await feature.listSearchConsoleSites();
  const query = await feature.querySearchConsole({ siteUrl: "https://www.ezviz.com/" });

  assert.deepEqual(sites, [{ siteUrl: "https://www.ezviz.com/", permissionLevel: "siteOwner" }]);
  assert.equal(query.rows[0].clicks, 3);
  assert.match(requests[1][0], /\/sites\/https%3A%2F%2Fwww\.ezviz\.com%2F\/searchAnalytics\/query$/);
  assert.equal(JSON.parse(requests[1][1].body).dimensions[0], "date");
});
