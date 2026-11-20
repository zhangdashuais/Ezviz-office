const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const XLSX = require('xlsx');

const packageDir = path.resolve(__dirname, '../../outputs/i18n-converter-sheet1-20261028');
const pageUrl = pathToFileURL(path.join(packageDir, 'index.html')).href;
function xlsx(rows, sheetName = 'Datasheet', secondSheetRows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
  if (secondSheetRows) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(secondSheetRows), 'Sheet2');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pageUrl);
    assert.equal(await page.title(), 'EZVIZ i18n 语言转换');
    await page.locator('#productLangExcelInput').setInputFiles({
      name: 'product.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx([['字段名', '英文原文'], ['goods.reuse', 'Reusable text']])
    });
    await page.locator('#productLangExcelParseBtn').click();
    await page.locator('#textStatus.ok').waitFor();
    await page.locator('#langExcelInput').setInputFiles({
      name: 'global.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx(
        [['Category (cannot be modified)', 'Serial number', 'Single word (cannot be modified)', 'en-US(cannot be modified)'], ['common', 'C0000001', 'old', 'Old text']],
        'Sheet1',
        [['Category (cannot be modified)', 'Serial number', 'Single word (cannot be modified)', 'en-US(cannot be modified)'], ['goods', 'G0000001', 'old', 'Wrong Sheet2 text']]
      )
    });
    await page.locator('#langExcelParseBtn').click();
    await page.locator('#textStatus.ok').waitFor();
    await page.locator('#textFileInput').setInputFiles({
      name: 'sample.html', mimeType: 'text/html',
      buffer: Buffer.from('<link rel="stylesheet" href="https://example.com/site.css"><p>Reusable text</p><p>Fresh sentence</p><p>{{t(\'common.old\')}}</p>')
    });
    await page.locator('#langPrefixInput').fill('CP4 Lite');
    await page.locator('#textProcessBtn').click();
    await page.getByText(/处理成功：/).waitFor();
    const html = await page.locator('#textOutput').inputValue();
    assert.match(html, /goods\.reuse/);
    assert.match(html, /goods\.CP4_Lite_1/);
    assert.match(html, /common\.old/);
    assert.match(await page.locator('#existingLangTable').innerText(), /Old text/);
    assert.doesNotMatch(await page.locator('#existingLangTable').innerText(), /Wrong Sheet2 text/);
    assert.match(html, /<link rel="stylesheet" href="https:\/\/example\.com\/site\.css">/);
    const [htmlDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#textDownloadBtn').click()]);
    assert.equal(htmlDownload.suggestedFilename(), 'sample.i18n.html');
    const [excelDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#langExcelDownloadBtn').click()]);
    assert.match(excelDownload.suggestedFilename(), /\.xlsx$/);
    const result = XLSX.read(fs.readFileSync(await excelDownload.path()), { type: 'buffer' });
    assert.deepEqual(result.SheetNames, ['新语言包字段', '产品包复用字段', '已有字段原文']);
    await page.locator('#langExcelInput').setInputFiles({
      name: 'sheet2-only.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx([['字段名', 'en-US'], ['goods.old', 'Wrong Sheet2 text']], 'Sheet2')
    });
    await page.locator('#langExcelParseBtn').click();
    assert.match(await page.locator('#textStatus.warn').innerText(), /缺少 Sheet1/);
    assert.deepEqual(errors, []);
    console.log('file:// offline i18n conversion and both downloads: OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
