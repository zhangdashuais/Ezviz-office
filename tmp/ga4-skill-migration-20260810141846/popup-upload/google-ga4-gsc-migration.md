# GA4 / Search Console Local Migration

This project binds Google OAuth and GA4 by local files. The UI does not upload credential JSON.

## Bound Files

From the project root:

```text
credentials/ga4-oauth-client.json
runtime/ga4-config.json
runtime/ga4-oauth-token.json
```

Commit neither `credentials/*.json` nor `runtime/`. They are ignored by Git.

## Binding Method

1. Put the Google OAuth desktop client JSON here:

```text
credentials/ga4-oauth-client.json
```

2. Bind the GA4 property ID:

```powershell
New-Item -ItemType Directory -Force runtime
'{"propertyId":"311294431"}' | Set-Content -Encoding UTF8 runtime/ga4-config.json
```

3. Start the backend:

```powershell
node server.js
```

4. Open the service page:

```text
http://localhost:3217/google-data.html
```

5. Click `登录 Google 并连接`.

The OAuth refresh token will be generated locally:

```text
runtime/ga4-oauth-token.json
```

## Google Cloud Project

Project:

```text
windy-city-494410-v3
```

Required APIs:

```text
analyticsdata.googleapis.com
searchconsole.googleapis.com
```

Verify:

```powershell
gcloud services list --enabled --project windy-city-494410-v3 --filter="config.name:(analyticsdata.googleapis.com OR searchconsole.googleapis.com)" --format="value(config.name)"
```

Enable Search Console API if missing:

```powershell
gcloud services enable searchconsole.googleapis.com --project windy-city-494410-v3
```

OAuth scopes:

```text
https://www.googleapis.com/auth/analytics.readonly
https://www.googleapis.com/auth/webmasters.readonly
```

If the OAuth app is in testing mode, add the login Google account as a test user.

## Verify

Backend status:

```powershell
Invoke-RestMethod http://localhost:3217/api/ga4/status
```

Expected after OAuth:

```json
{
  "ok": true,
  "configured": true,
  "connected": true,
  "propertyId": "311294431"
}
```

UI checks:

- `测试 GA4` reads recent GA4 rows.
- `读取 GSC 站点` lists Search Console properties.
- `测试 GSC` reads recent search clicks, impressions, CTR, and position.

## Common Fixes

Missing OAuth JSON:

```text
Place the OAuth desktop client JSON at credentials/ga4-oauth-client.json.
```

Wrong GA4 property:

```text
Edit runtime/ga4-config.json and reconnect.
```

No GA4 or GSC permission:

```text
Reconnect with the Google account that has access to property 311294431 and the target Search Console site.
```

Node fetch timeout to Google:

```text
Set HTTPS_PROXY, HTTP_PROXY, or ALL_PROXY before starting node server.js.
```
