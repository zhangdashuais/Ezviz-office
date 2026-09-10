param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$InstructionPath
)

$excel = $null
$workbook = $null
try {
  $instructions = Get-Content -Raw -Encoding UTF8 -LiteralPath $InstructionPath | ConvertFrom-Json
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($InputPath)

  foreach ($update in $instructions.updates) {
    $sheet = $workbook.Worksheets.Item([string]$update.sheetName)
    $sheet.Cells.Item([int]$update.rowNumber, [int]$update.columnNumber).Value2 = [string]$update.value
  }

  foreach ($append in $instructions.appends) {
    $sheet = $workbook.Worksheets.Item([string]$append.sheetName)
    $row = [int]$append.rowNumber
    $usedColumns = [int]$sheet.UsedRange.Columns.Count
    $sourceRange = $sheet.Range($sheet.Cells.Item($row - 1, 1), $sheet.Cells.Item($row - 1, $usedColumns))
    $targetRange = $sheet.Range($sheet.Cells.Item($row, 1), $sheet.Cells.Item($row, $usedColumns))
    $sourceRange.Copy($targetRange)
    $sheet.Cells.Item($row, [int]$append.keyColumnNumber).Value2 = [string]$append.key
    $sheet.Cells.Item($row, [int]$append.sourceColumnNumber).Value2 = [string]$append.source
    $sheet.Cells.Item($row, [int]$append.targetColumnNumber).Value2 = [string]$append.value
  }

  $workbook.SaveAs($OutputPath, $workbook.FileFormat)
  $workbook.Close($false)
  $workbook = $null
} finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
