/**
 * 模块 2：文字/语言包转换逻辑
 */
(function() {
  const textFileInput = document.getElementById('textFileInput');
  const textProcessBtn = document.getElementById('textProcessBtn');
  const textDownloadBtn = document.getElementById('textDownloadBtn');
  const langExcelDownloadBtn = document.getElementById('langExcelDownloadBtn');
  const textOutput = document.getElementById('textOutput');
  const textPreviewFrame = document.getElementById('textPreviewFrame');
  const textStatus = document.getElementById('textStatus');
  const langPrefixInput = document.getElementById('langPrefixInput');
  const langProductNameInput = document.getElementById('langProductNameInput');
  const convertedTabBtn = document.getElementById('convertedTabBtn');
  const alignedTabBtn = document.getElementById('alignedTabBtn');
  const existingTabBtn = document.getElementById('existingTabBtn');
  const productLangExcelInput = document.getElementById('productLangExcelInput');
  const productLangExcelParseBtn = document.getElementById('productLangExcelParseBtn');
  const langExcelInput = document.getElementById('langExcelInput');
  const langExcelParseBtn = document.getElementById('langExcelParseBtn');

  let convertedCount = 0;
  let alignedCount = 0;
  let existingCount = 0;
  const existingValueMap = new Map();
  const productLanguageKeys = new Set();
  let productSourceIndex = new Map();
  let productDuplicateSources = new Set();

  let currentProcessedHtml = '';
  let generatedLanguageRows = [];
  let alignedLanguageRows = [];
  let existingLanguageRows = [];

  textProcessBtn.addEventListener('click', async () => {
    const file = textFileInput.files[0];
    if (!file) {
      updateStatus('请先上传要处理的 HTML 文件。', 'warn');
      return;
    }

    const prefix = window.i18nConversionRules.buildProductPrefix(langPrefixInput.value);
    const productName = langProductNameInput?.value?.trim() || '';
    updateStatus('正在处理中...');
    generatedLanguageRows = [];
    alignedLanguageRows = [];
    existingLanguageRows = [];
    if (langExcelDownloadBtn) langExcelDownloadBtn.disabled = true;

    const htmlText = await readFileAsText(file);
    const existingKeys = extractExistingI18nKeys(htmlText);
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      if (!node.parentNode) continue;
      const tag = node.parentNode.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) continue;
      
      const text = node.nodeValue.trim();
      if (!text || text.includes('{{t(')) continue;
      if (!window.i18nConversionRules?.containsEnglishText(text)) continue;
      const targetText = window.i18nConversionRules?.extractTranslatableText(text, productName) || '';
      if (!targetText) continue;

      textNodes.push({ node, originalText: targetText });
    }

    const conversion = renderTable(textNodes, prefix, existingKeys);
    const existingResult = renderExistingTable(existingKeys);
    updateTableVisibility();
    
    currentProcessedHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    currentProcessedHtml = currentProcessedHtml.replace(/\{\{t\(['"]([^'"]+)['"]\)\}\}/g, '{{t(&#39;$1&#39;)}}');
    
    textOutput.value = currentProcessedHtml;
    textPreviewFrame.srcdoc = currentProcessedHtml;
    textDownloadBtn.disabled = false;
    updateExcelDownloadState();
    const existingSummary = existingResult.total
      ? `；已有字段 ${existingResult.total} 个，总语言包匹配 ${existingResult.resolved} 个${existingResult.missing ? `，缺失 ${existingResult.missing} 个` : ''}`
      : '；HTML 中没有已有语言字段';
    const alignmentSummary = productSourceIndex.size
      ? `复用单产品语言包字段 ${conversion.alignedCount} 个，生成新字段 ${conversion.newCount} 个`
      : `未提供单产品语言包，生成新字段 ${conversion.newCount} 个`;
    updateStatus(`处理成功：${alignmentSummary}${existingSummary}。`, 'ok');
  });

  textDownloadBtn.addEventListener('click', () => {
    if (!currentProcessedHtml) return;
    const blob = new Blob([currentProcessedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (textFileInput.files[0]?.name || 'processed.html').replace('.html', '.i18n.html');
    a.click();
    URL.revokeObjectURL(url);
  });

  if (langExcelDownloadBtn) {
    langExcelDownloadBtn.addEventListener('click', () => {
      if (!generatedLanguageRows.length && !alignedLanguageRows.length && !existingLanguageRows.length) return;
      if (!window.XLSX) {
        updateStatus('缺少表格生成库，请检查 XLSX 脚本是否加载。', 'warn');
        return;
      }
      const workbook = window.XLSX.utils.book_new();
      if (generatedLanguageRows.length) {
        appendWorkbookSheet(workbook, '新语言包字段', [
          ['字段名', '英文原文'],
          ...generatedLanguageRows.map(item => [item.key, item.value])
        ], [{ wch: 48 }, { wch: 90 }]);
      }
      if (alignedLanguageRows.length) {
        appendWorkbookSheet(workbook, '产品包复用字段', [
          ['字段名', '单产品语言包英文原文'],
          ...alignedLanguageRows.map(item => [item.key, item.value])
        ], [{ wch: 48 }, { wch: 90 }]);
      }
      if (existingLanguageRows.length) {
        appendWorkbookSheet(workbook, '已有字段原文', [
          ['字段名', '总语言包英文原文', '匹配状态'],
          ...existingLanguageRows.map(item => [item.key, item.value, item.matched ? '已匹配' : '总语言包未找到'])
        ], [{ wch: 48 }, { wch: 90 }, { wch: 20 }]);
      }
      const prefixName = String(langPrefixInput.value || 'language-package')
        .trim().replace(/^goods\./i, '').replace(/[\\/:*?"<>|]/g, '-');
      window.XLSX.writeFile(workbook, `${prefixName || 'language-package'}.语言字段结果.xlsx`);
    });
  }

  function appendWorkbookSheet(workbook, name, rows, columns) {
    const sheet = window.XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = columns;
    sheet['!autofilter'] = { ref: window.XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length - 1, c: rows[0].length - 1 }) };
    window.XLSX.utils.book_append_sheet(workbook, sheet, name);
  }

  function updateExcelDownloadState() {
    if (langExcelDownloadBtn) {
      langExcelDownloadBtn.disabled = generatedLanguageRows.length === 0
        && alignedLanguageRows.length === 0
        && existingLanguageRows.length === 0;
    }
  }

  if (productLangExcelParseBtn) {
    productLangExcelParseBtn.addEventListener('click', async () => {
      const file = productLangExcelInput?.files?.[0];
      if (!file) {
        updateStatus('请先上传单产品语言包。', 'warn');
        return;
      }
      if (!window.XLSX) {
        updateStatus('缺少表格解析库，请检查 XLSX 脚本是否加载。', 'warn');
        return;
      }

      try {
        const parsed = await parseProductLanguageTable(file);
        const duplicateSummary = parsed.duplicateCount
          ? `；${parsed.duplicateCount} 条原文对应多个字段，已按未匹配文案生成新字段`
          : '';
        updateStatus(`单产品语言包解析完成：${parsed.parsedCount} 个字段${duplicateSummary}。`, 'ok');
        if (textFileInput?.files?.[0]) textProcessBtn.click();
      } catch (err) {
        updateStatus(`单产品语言包解析失败：${err.message || err}。`, 'warn');
      }
    });
  }

  if (langExcelParseBtn) {
    langExcelParseBtn.addEventListener('click', async () => {
      const file = langExcelInput?.files?.[0];
      if (!file) {
        updateStatus('请先上传语言包表格。', 'warn');
        return;
      }
      if (!window.XLSX) {
        updateStatus('缺少表格解析库，请检查 XLSX 脚本是否加载。', 'warn');
        return;
      }

      try {
        const parsed = await parseLanguageTable(file);
        updateStatus(`总语言包解析完成：${parsed.recognizedSheetCount} 个工作表，${parsed.parsedCount} 个字段。`, 'ok');

        const existingKeys = extractExistingI18nKeys(currentProcessedHtml || '');
        if (existingKeys.length > 0) {
          renderExistingTable(existingKeys);
          updateTableVisibility();
          updateExcelDownloadState();
        }
        if (textFileInput?.files?.[0]) {
          textProcessBtn.click();
        }
      } catch (err) {
        updateStatus(`表格解析失败：${err.message || err}。`, 'warn');
      }
    });
  }

  function updateStatus(msg, type = '') {
    textStatus.textContent = msg;
    textStatus.className = 'status ' + type;
  }

  function readFileAsText(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsText(file);
    });
  }

  function renderTable(nodes, prefix, existingKeys = []) {
    const tbody = document.querySelector('#langTable tbody');
    const alignedBody = document.querySelector('#alignedLangTable tbody');
    tbody.innerHTML = '';
    if (alignedBody) alignedBody.innerHTML = '';
    
    const textKeyMap = new Map();
    const renderedAlignedKeys = new Set();
    const reservedKeys = new Set();
    existingKeys.forEach(key => reserveLanguageKey(reservedKeys, key));
    existingValueMap.forEach((_value, key) => reserveLanguageKey(reservedKeys, key));
    productLanguageKeys.forEach(key => reserveLanguageKey(reservedKeys, key));
    let uniqueIndex = 0;

    nodes.forEach((item) => {
      const normalizedText = normalizeTextForKeyReuse(item.originalText);
      const aligned = productSourceIndex.get(normalizedText);
      let key = aligned?.key || textKeyMap.get(normalizedText);

      if (aligned) {
        key = normalizeLangKey(aligned.key)?.full || aligned.key;
        if (!renderedAlignedKeys.has(key)) {
          renderedAlignedKeys.add(key);
          alignedLanguageRows.push({ key, value: aligned.source });
          alignedBody?.appendChild(createLanguageRow(key, aligned.source));
        }
      } else if (!key) {
        do {
          uniqueIndex += 1;
          key = `${prefix}${uniqueIndex}`;
        } while (isReservedLanguageKey(reservedKeys, key));
        textKeyMap.set(normalizedText, key);
        reserveLanguageKey(reservedKeys, key);
        generatedLanguageRows.push({ key, value: item.originalText });

        const tr = createLanguageRow(key, item.originalText);
        tbody.appendChild(tr);
      }

      item.node.nodeValue = item.node.nodeValue.replace(item.originalText, `{{t('${key}')}}`);
    });

    convertedCount = generatedLanguageRows.length;
    alignedCount = alignedLanguageRows.length;
    return {
      newCount: convertedCount,
      alignedCount
    };
  }

  function normalizeTextForKeyReuse(text) {
    return String(text || '')
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function reserveLanguageKey(reservedKeys, key) {
    const normalized = normalizeLangKey(key);
    if (!normalized) return;
    reservedKeys.add(normalized.full);
    reservedKeys.add(normalized.short);
  }

  function isReservedLanguageKey(reservedKeys, key) {
    const normalized = normalizeLangKey(key);
    return !!normalized
      && (reservedKeys.has(normalized.full) || reservedKeys.has(normalized.short));
  }

  function renderExistingTable(keys) {
    const tbody = document.querySelector('#existingLangTable tbody');
    tbody.innerHTML = '';
    let resolved = 0;
    existingLanguageRows = [];

    keys.forEach(key => {
      const value = resolveExistingValue(key);
      if (value) resolved += 1;
      const normalizedKey = normalizeLangKey(key)?.full || String(key || '');
      existingLanguageRows.push({ key: normalizedKey, value, matched: !!value });
      const tr = createLanguageRow(normalizedKey, value || '总语言包中未找到', !value);
      tbody.appendChild(tr);
    });
    existingCount = keys.length;
    return { total: keys.length, resolved, missing: keys.length - resolved };
  }

  function createLanguageRow(key, value, warning = false) {
    const tr = document.createElement('tr');
    const keyCell = document.createElement('td');
    const valueCell = document.createElement('td');
    keyCell.style.cssText = 'padding:6px 10px; border-bottom:1px solid #ccc;';
    valueCell.style.cssText = 'padding:6px 10px; border-bottom:1px solid #ccc;';
    keyCell.textContent = normalizeLangKey(key)?.full || String(key || '');
    valueCell.textContent = value;
    if (warning) valueCell.style.color = '#b45309';
    tr.append(keyCell, valueCell);
    return tr;
  }

  function updateTableVisibility() {
    const container = document.getElementById('tableContainer');
    if (!container) return;

    const hasAny = convertedCount > 0 || alignedCount > 0 || existingCount > 0;
    container.style.display = hasAny ? 'block' : 'none';
    if (!hasAny) return;

    if (convertedCount > 0) {
      setActiveTab('converted');
    } else if (alignedCount > 0) {
      setActiveTab('aligned');
    } else {
      setActiveTab('existing');
    }
  }

  function setActiveTab(type) {
    const convertedPanel = document.getElementById('convertedTablePanel');
    const alignedPanel = document.getElementById('alignedTablePanel');
    const existingPanel = document.getElementById('existingTablePanel');

    if (convertedPanel) convertedPanel.style.display = type === 'converted' ? 'block' : 'none';
    if (alignedPanel) alignedPanel.style.display = type === 'aligned' ? 'block' : 'none';
    if (existingPanel) existingPanel.style.display = type === 'existing' ? 'block' : 'none';

    if (convertedTabBtn) {
      convertedTabBtn.style.background = type === 'converted' ? '#e2e8f0' : '#fff';
    }
    if (alignedTabBtn) {
      alignedTabBtn.style.background = type === 'aligned' ? '#e2e8f0' : '#fff';
    }
    if (existingTabBtn) {
      existingTabBtn.style.background = type === 'existing' ? '#e2e8f0' : '#fff';
    }
  }

  if (convertedTabBtn) {
    convertedTabBtn.addEventListener('click', () => setActiveTab('converted'));
  }
  if (alignedTabBtn) {
    alignedTabBtn.addEventListener('click', () => setActiveTab('aligned'));
  }
  if (existingTabBtn) {
    existingTabBtn.addEventListener('click', () => setActiveTab('existing'));
  }

  function extractExistingI18nKeys(htmlText) {
    const pattern = /\{\{t\(\s*(?:['"]|&#39;)(goods\.[^'"]+?)(?:['"]|&#39;)\s*\)\}\}/g;
    const keys = new Set();
    let match;

    while ((match = pattern.exec(htmlText))) {
      keys.add(match[1]);
    }

    return Array.from(keys);
  }

  async function parseLanguageTable(file) {
    const parsed = await readLanguageTableEntries(file);
    existingValueMap.clear();
    parsed.entries.forEach(({ key, source }) => {
      const normalized = normalizeLangKey(key);
      if (!normalized || existingValueMap.has(normalized.full)) return;
      existingValueMap.set(normalized.full, source);
      existingValueMap.set(normalized.short, source);
    });
    return {
      parsedCount: existingValueMap.size / 2,
      recognizedSheetCount: parsed.recognizedSheetCount
    };
  }

  async function parseProductLanguageTable(file) {
    const parsed = await readLanguageTableEntries(file);
    const indexed = window.i18nConversionRules.buildSourceKeyIndex(parsed.entries);
    productSourceIndex = new Map();
    productLanguageKeys.clear();
    parsed.entries.forEach(entry => {
      const normalizedKey = normalizeLangKey(entry.key)?.full;
      if (normalizedKey) productLanguageKeys.add(normalizedKey);
    });
    indexed.bySource.forEach((entry, source) => {
      const normalizedKey = normalizeLangKey(entry.key)?.full;
      if (!normalizedKey) return;
      productSourceIndex.set(source, { key: normalizedKey, source: entry.source });
    });
    productDuplicateSources = indexed.duplicateSources;
    if (!productSourceIndex.size) {
      throw new Error('没有可用于原文对齐的字段');
    }
    return {
      parsedCount: productLanguageKeys.size,
      duplicateCount: productDuplicateSources.size,
      recognizedSheetCount: parsed.recognizedSheetCount
    };
  }

  async function readLanguageTableEntries(file) {
    const data = await readFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(data, { type: 'array' });
    const entries = [];
    let recognizedSheetCount = 0;
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      let layout;
      try {
        layout = window.i18nConversionRules.detectLanguageTableLayout(rows);
      } catch {
        return;
      }
      recognizedSheetCount += 1;
      rows.slice(layout.firstDataRow).forEach(row => {
        const rawKey = String(row[layout.keyColumn] || '').trim();
        const source = String(row[layout.sourceColumn] || '').trim();
        if (!rawKey || !source) return;
        entries.push({ key: rawKey, source });
      });
    });
    if (!entries.length) {
      throw new Error(recognizedSheetCount
        ? '已识别语言包表头，但没有可用的字段名和 en-US 原文'
        : '没有识别到字段名列和 en-US 原文列');
    }
    return { entries, recognizedSheetCount };
  }

  function normalizeLangKey(rawKey) {
    let key = rawKey
      .replace(/^\{\{t\(\s*(?:['"]|&#39;)/, '')
      .replace(/(?:['"]|&#39;)\s*\)\}\}$/, '')
      .trim();

    if (!key) return null;

    const full = key.startsWith('goods.') ? key : `goods.${key}`;
    const short = key.replace(/^goods\./, '');
    return { full, short };
  }

  function resolveExistingValue(fullKey) {
    if (!fullKey) return '';
    const shortKey = fullKey.replace(/^goods\./, '');
    return existingValueMap.get(fullKey) || existingValueMap.get(shortKey) || '';
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsArrayBuffer(file);
    });
  }
})();
