param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Write-JsonMessage {
  param([hashtable]$Message)
  [Console]::Out.WriteLine(($Message | ConvertTo-Json -Depth 12 -Compress))
}

function Write-ProgressMessage {
  param([string]$Message)
  Write-JsonMessage @{ type = 'progress'; message = $Message }
}

function Escape-ODataString {
  param([string]$Value)
  return $Value.Replace("'", "''")
}

function Normalize-RelativePath {
  param([string]$Value)
  return (($Value -replace '\\', '/') -replace '^/+|/+$', '')
}

try {
  $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
  $siteUrl = ([string]$manifest.siteUrl).TrimEnd('/')
  if (-not $siteUrl) { throw 'SharePoint siteUrl is required.' }
  $siteUri = [Uri]$siteUrl
  $siteRelativePath = [Uri]::UnescapeDataString($siteUri.AbsolutePath.TrimEnd('/'))
  if (-not $siteRelativePath) { $siteRelativePath = '/' }

  Write-ProgressMessage "Connecting to SharePoint: $siteUrl"
  $context = Invoke-RestMethod -Method Post -Uri "$siteUrl/_api/contextinfo" -UseDefaultCredentials -Headers @{ Accept = 'application/json;odata=verbose' } -TimeoutSec 60
  $digest = $context.d.GetContextWebInformation.FormDigestValue
  if (-not $digest) { throw 'SharePoint did not return FormDigestValue.' }

  $writeHeaders = @{
    Accept = 'application/json;odata=verbose'
    'X-RequestDigest' = $digest
  }

  function Test-FolderExists {
    param([string]$ServerRelativeUrl)
    $escaped = Escape-ODataString $ServerRelativeUrl
    try {
      Invoke-RestMethod -Method Get -Uri "$siteUrl/_api/web/GetFolderByServerRelativeUrl('$escaped')?`$select=Exists" -UseDefaultCredentials -Headers @{ Accept = 'application/json;odata=verbose' } -TimeoutSec 60 | Out-Null
      return $true
    } catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { return $false }
      throw
    }
  }

  function Ensure-Folder {
    param([string]$FolderPath)
    $relative = Normalize-RelativePath $FolderPath
    $current = $siteRelativePath.TrimEnd('/')
    foreach ($segment in ($relative -split '/')) {
      if (-not $segment) { continue }
      $current = "$current/$segment"
      if (Test-FolderExists $current) { continue }
      Write-ProgressMessage "Creating SharePoint folder: $current"
      $payload = @{ '__metadata' = @{ type = 'SP.Folder' }; ServerRelativeUrl = $current } | ConvertTo-Json -Depth 4
      $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
      Invoke-RestMethod -Method Post -Uri "$siteUrl/_api/web/folders" -UseDefaultCredentials -Headers $writeHeaders -ContentType 'application/json;odata=verbose;charset=utf-8' -Body $bytes -TimeoutSec 60 | Out-Null
    }
    return $current
  }

  $createdFolders = @()
  foreach ($folder in @($manifest.folders)) {
    $folderPath = [string]$folder
    if (-not $folderPath) { continue }
    [void](Ensure-Folder $folderPath)
    $createdFolders += $folderPath
  }

  $results = @()
  $overwrite = [bool]$manifest.overwrite
  $overwriteLiteral = if ($overwrite) { 'true' } else { 'false' }
  foreach ($file in @($manifest.files)) {
    $localPath = [string]$file.localPath
    $folderPath = Normalize-RelativePath ([string]$file.folderPath)
    $name = [string]$file.name
    $role = [string]$file.role
    try {
      if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) { throw "Local file does not exist: $localPath" }
      $folderServerRelative = Ensure-Folder $folderPath
      $folderEscaped = Escape-ODataString $folderServerRelative
      $nameEscaped = Escape-ODataString $name
      Write-ProgressMessage "Uploading SharePoint file: $folderPath/$name"
      $bytes = [IO.File]::ReadAllBytes($localPath)
      $uploadUrl = "$siteUrl/_api/web/GetFolderByServerRelativeUrl('$folderEscaped')/Files/add(url='$nameEscaped',overwrite=$overwriteLiteral)"
      Invoke-RestMethod -Method Post -Uri $uploadUrl -UseDefaultCredentials -Headers $writeHeaders -ContentType 'application/octet-stream' -Body $bytes -TimeoutSec 600 | Out-Null

      $fileServerRelative = "$folderServerRelative/$name"
      $fileEscaped = Escape-ODataString $fileServerRelative
      $verified = Invoke-RestMethod -Method Get -Uri "$siteUrl/_api/web/GetFileByServerRelativeUrl('$fileEscaped')?`$select=Name,Length,ServerRelativeUrl,TimeLastModified" -UseDefaultCredentials -Headers @{ Accept = 'application/json;odata=verbose' } -TimeoutSec 60
      $remoteLength = [int64]$verified.d.Length
      if ($remoteLength -ne [int64]$bytes.Length) {
        throw "Uploaded file size mismatch: local $($bytes.Length), SharePoint $remoteLength"
      }
      $results += [pscustomobject]@{
        status = 'completed'
        name = $name
        role = $role
        folderPath = $folderPath
        serverRelativeUrl = [string]$verified.d.ServerRelativeUrl
        size = $remoteLength
        timeLastModified = [string]$verified.d.TimeLastModified
      }
    } catch {
      $message = $_.Exception.Message
      Write-ProgressMessage "SharePoint upload failed: $name / $message"
      $results += [pscustomobject]@{
        status = 'failed'
        name = $name
        role = $role
        folderPath = $folderPath
        error = $message
      }
    }
  }

  $successCount = @($results | Where-Object { $_.status -eq 'completed' }).Count
  $failedCount = @($results | Where-Object { $_.status -eq 'failed' }).Count
  Write-JsonMessage @{
    type = 'result'
    result = @{
      status = if ($failedCount -eq 0) { 'completed' } else { 'partial' }
      siteUrl = $siteUrl
      overwrite = $overwrite
      createdFolders = $createdFolders
      successCount = $successCount
      failedCount = $failedCount
      files = $results
    }
  }
  exit 0
} catch {
  Write-JsonMessage @{ type = 'error'; message = $_.Exception.Message }
  exit 1
}
