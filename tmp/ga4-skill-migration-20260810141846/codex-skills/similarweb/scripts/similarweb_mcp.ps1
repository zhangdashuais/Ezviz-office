param(
  [switch]$ListTools,
  [string]$Tool,
  [string]$ArgumentsJson = "{}",
  [string]$ReadResource,
  [string]$Endpoint = "https://mcp.similarweb.com"
)

$ErrorActionPreference = "Stop"

$apiKey = [Environment]::GetEnvironmentVariable("SIMILARWEB_API_KEY", "Process")
if (-not $apiKey) { $apiKey = [Environment]::GetEnvironmentVariable("SIMILARWEB_API_KEY", "User") }
if (-not $apiKey) { $apiKey = [Environment]::GetEnvironmentVariable("SIMILARWEB_API_KEY", "Machine") }
if (-not $apiKey) {
  throw "SIMILARWEB_API_KEY is not set. Set it as a local environment variable; do not paste it into chat."
}

$headers = @{
  "api-key" = $apiKey
  "Accept" = "application/json, text/event-stream"
  "Content-Type" = "application/json"
}

function Invoke-Mcp($method, $params) {
  $body = @{
    jsonrpc = "2.0"
    id = 1
    method = $method
    params = $params
  } | ConvertTo-Json -Depth 50

  $response = Invoke-WebRequest -Uri $Endpoint -Method Post -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 120
  return $response.Content | ConvertFrom-Json
}

if ($ListTools) {
  $result = Invoke-Mcp "tools/list" @{}
  $result.result.tools | Select-Object name, description | ConvertTo-Json -Depth 8
  exit 0
}

if ($ReadResource) {
  $result = Invoke-Mcp "resources/read" @{ uri = $ReadResource }
  $result | ConvertTo-Json -Depth 50
  exit 0
}

if ($Tool) {
  $arguments = $ArgumentsJson | ConvertFrom-Json
  $result = Invoke-Mcp "tools/call" @{ name = $Tool; arguments = $arguments }
  $result | ConvertTo-Json -Depth 80
  exit 0
}

throw "Specify -ListTools, -ReadResource, or -Tool."
