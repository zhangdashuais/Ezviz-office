param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$FieldKey = 'HG2_400_4'
)

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open((Resolve-Path -LiteralPath $InputPath).Path, 0, $false)
  $matches = @()
  foreach ($sheet in $workbook.Worksheets) {
    $lastRow = $sheet.UsedRange.Row + $sheet.UsedRange.Rows.Count - 1
    $keyRange = $sheet.Range("C1:C$lastRow")
    $count = [int]$excel.WorksheetFunction.CountIf($keyRange, $FieldKey)
    if ($count -gt 0) {
      $row = [int]$excel.WorksheetFunction.Match($FieldKey, $keyRange, 0)
      for ($index = 0; $index -lt $count; $index++) {
        $matches += [pscustomobject]@{ Sheet = $sheet; Row = $row; Column = 3 }
      }
    }
  }
  if ($matches.Count -ne 1) { throw "$FieldKey matched $($matches.Count) cells." }
  $target = $matches[0].Sheet.Cells.Item($matches[0].Row, 5)
  $before = [string]$target.Value2
  $after = (($before -split '\s*/\s*' | ForEach-Object {
    ($_ -replace '(?i)\b(?:15|18|20)\s*s\b', '').Trim()
  } | Where-Object { $_ }) -join ' / ')
  $target.Value2 = $after
  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
  $workbook.SaveAs($resolvedOutput, $workbook.FileFormat)
  [pscustomobject]@{ Sheet = $matches[0].Sheet.Name; Row = $matches[0].Row; Before = $before; After = $after } | ConvertTo-Json -Compress
} finally {
  if ($workbook) { $workbook.Close($false); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { $excel.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}
