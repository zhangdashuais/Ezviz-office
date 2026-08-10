# Google GA4 / Search Console local binding

Use this reference when the user asks to connect, verify, migrate, or troubleshoot GA4 or Google Search Console for the Ezviz Office local tool. These checks are read-only unless the user explicitly asks to create OAuth files or change local config.

## Local files

The historical Popup Upload project used fixed local files:

```text
credentials/ga4-oauth-client.json
runtime/ga4-config.json
runtime/ga4-oauth-token.json
```

Never print, commit, or copy the contents of OAuth client JSON or token JSON. It is safe to report only whether the files exist and their paths.

`credentials/*.json` and `runtime/` must stay out of Git.

## Expected binding

For the migrated GA4 setup, bind this property ID:

```json
{
  "propertyId": "311294431"
}
```

PowerShell setup:

```powershell
New-Item -ItemType Directory -Force credentials,runtime
'{"propertyId":"311294431"}' | Set-Content -Encoding UTF8 runtime/ga4-config.json
```

Then place the Google OAuth desktop client JSON at:

```text
credentials/ga4-oauth-client.json
```

## Google Cloud project

Project:

```text
windy-city-494410-v3
```

Required APIs:

```text
analyticsdata.googleapis.com
searchconsole.googleapis.com
```

Required OAuth scopes:

```text
https://www.googleapis.com/auth/analytics.readonly
https://www.googleapis.com/auth/webmasters.readonly
```

If the OAuth app is in testing mode, the login Google account must be added as a test user.

If `gcloud` is available, verify APIs with:

```powershell
gcloud services list --enabled --project windy-city-494410-v3 --filter="config.name:(analyticsdata.googleapis.com OR searchconsole.googleapis.com)" --format="value(config.name)"
```

Enable the Search Console API if missing:

```powershell
gcloud services enable searchconsole.googleapis.com --project windy-city-494410-v3
```

## Local verification flow

Start the backend:

```powershell
npm start
```

Open the Google data page if the project contains it:

```text
http://localhost:3217/google-data.html
```

Click the Google login/connect button. The generated refresh token should stay local:

```text
runtime/ga4-oauth-token.json
```

Check backend status if the route exists:

```powershell
Invoke-RestMethod http://localhost:3217/api/ga4/status
```

Expected connected status:

```json
{
  "ok": true,
  "configured": true,
  "connected": true,
  "propertyId": "311294431"
}
```

UI checks, when available:

- Test GA4 reads recent GA4 rows.
- Read GSC sites lists Search Console properties.
- Test GSC reads recent clicks, impressions, CTR, and position.

## Troubleshooting checklist

- Missing `credentials/ga4-oauth-client.json`: ask the user to place the OAuth desktop client JSON locally; do not request pasted secret contents.
- Missing `runtime/ga4-config.json`: create or repair the local property binding with property ID `311294431`.
- Missing `runtime/ga4-oauth-token.json`: OAuth has not completed yet; start the backend and connect through the browser UI.
- No GA4/GSC permission: reconnect with a Google account that has access to property `311294431` and the target Search Console site.
- Google network timeout: set `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY` before starting the backend.
- `gcloud` unavailable: skip Cloud API verification and report that only local file/route checks were possible.

## Current migration note

The historical `popup-upload.zip` provided documentation only for GA4/GSC. Before claiming that GA4 is connected in the current Ezviz Office project, verify that the current project actually contains GA4 routes or UI files such as `/api/ga4/status` or `google-data.html`; if absent, report that the binding knowledge has been migrated but the application code still needs a GA4/GSC implementation.
