param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [string]$FieldKey = 'HG2_400_4'
)

$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open((Resolve-Path -LiteralPath $InputPath).Path, 0, $true)
  $matches = @()
  foreach ($sheet in $workbook.Worksheets) {
    $lastRow = $sheet.UsedRange.Row + $sheet.UsedRange.Rows.Count - 1
    $keyRange = $sheet.Range("C1:C$lastRow")
    $count = [int]$excel.WorksheetFunction.CountIf($keyRange, $FieldKey)
    if ($count -gt 0) {
      $row = [int]$excel.WorksheetFunction.Match($FieldKey, $keyRange, 0)
      for ($index = 0; $index -lt $count; $index++) {
        $matches += [pscustomobject]@{ Sheet = $sheet; Row = $row }
      }
    }
  }
  if ($matches.Count -ne 1) { throw "$FieldKey matched $($matches.Count) cells." }
  $before = [string]$matches[0].Sheet.Cells.Item($matches[0].Row, 5).Value2
  $after = (($before -split '\s*/\s*' | ForEach-Object {
    ($_ -replace '(?i)\b(?:15|18|20)\s*s\b', '').Trim()
  } | Where-Object { $_ }) -join ' / ')
  [pscustomobject]@{ SheetName = $matches[0].Sheet.Name; RowNumber = $matches[0].Row; TargetAddress = "E$($matches[0].Row)"; Before = $before; After = $after } | ConvertTo-Json -Compress
} finally {
  if ($workbook) { $workbook.Close($false); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { $excel.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}
