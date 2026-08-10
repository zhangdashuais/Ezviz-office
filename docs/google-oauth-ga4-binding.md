# Google OAuth JSON and GA4 Property Binding

The app uses fixed local binding:

```text
OAuth client JSON -> credentials/ga4-oauth-client.json
GA4 Property ID   -> runtime/ga4-config.json
OAuth token       -> runtime/ga4-oauth-token.json
```

For this project, bind:

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

Then place the downloaded Google OAuth desktop client JSON at:

```text
credentials/ga4-oauth-client.json
```

Start the backend and authorize once:

```powershell
node server.js
```

Open:

```text
http://localhost:3217/google-data.html
```

Click `登录 Google 并连接`. The generated token stays local in `runtime/ga4-oauth-token.json`.
