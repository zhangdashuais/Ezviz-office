/**
 * 模块 2：文字/语言包转换逻辑
 */
(function() {
  const textFileInput = document.getElementById('textFileInput');
  const textProcessBtn = document.getElementById('textProcessBtn');
  const textDownloadBtn = document.getElementById('textDownloadBtn');
  const textOutput = document.getElementById('textOutput');
  const textPreviewFrame = document.getElementById('textPreviewFrame');
  const textStatus = document.getElementById('textStatus');
  const langPrefixInput = document.getElementById('langPrefixInput');
  const convertedTabBtn = document.getElementById('convertedTabBtn');
  const existingTabBtn = document.getElementById('existingTabBtn');
  const langExcelInput = document.getElementById('langExcelInput');
  const langExcelParseBtn = document.getElementById('langExcelParseBtn');

  let convertedCount = 0;
  let existingCount = 0;
  const existingValueMap = new Map();
  const existingTextKeyMap = new Map();
  let reusedExistingKeys = new Set();

  let currentProcessedHtml = '';

  textProcessBtn.addEventListener('click', async () => {
    const file = textFileInput.files[0];
    if (!file) {
      updateStatus('请先上传要处理的 HTML 文件。', 'warn');
      return;
    }

    const prefix = langPrefixInput.value.trim() ? langPrefixInput.value.trim() + '_' : '';
    updateStatus('正在处理中...');

    const htmlText = await readFileAsText(file);
    const existingKeys = extractExistingI18nKeys(htmlText);
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    
    let counter = 1;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      if (!node.parentNode) continue;
      const tag = node.parentNode.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) continue;
      
      const text = node.nodeValue.trim();
      if (!text || text.includes('{{t(')) continue;
      if (/^[\d\s]+$/.test(text)) continue;

      let targetText = text;
      const endNumMatch = text.match(/^(.*?)(\s*\d+)$/);
      if (endNumMatch && endNumMatch[1].trim() !== '') {
        targetText = endNumMatch[1].trim();
      }

      if (!targetText || /^[\d\s]+$/.test(targetText)) continue;

      textNodes.push({ node, originalText: targetText });
    }

    reusedExistingKeys = new Set();
    renderTable(textNodes, prefix);
    renderExistingTable([...new Set([...existingKeys, ...reusedExistingKeys])]);
    updateTableVisibility();
    
    currentProcessedHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    currentProcessedHtml = currentProcessedHtml.replace(/\{\{t\(['"]([^'"]+)['"]\)\}\}/g, '{{t(&#39;$1&#39;)}}');
    
    textOutput.value = currentProcessedHtml;
    textPreviewFrame.srcdoc = currentProcessedHtml;
    textDownloadBtn.disabled = false;
    updateStatus('处理成功！可在下方预览并下载。', 'ok');
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
        await parseLanguageTable(file);
        updateStatus('语言包表格解析完成。', 'ok');

        const existingKeys = extractExistingI18nKeys(currentProcessedHtml || '');
        if (existingKeys.length > 0) {
          renderExistingTable([...new Set([...existingKeys, ...reusedExistingKeys])]);
          updateTableVisibility();
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

  function renderTable(nodes, prefix) {
    const tbody = document.querySelector('#langTable tbody');
    tbody.innerHTML = '';
    
    const textKeyMap = new Map();
    let uniqueIndex = 0;

    nodes.forEach((item) => {
      const normalizedText = normalizeTextForKeyReuse(item.originalText);
      let key = resolveExistingKeyByValue(normalizedText) || textKeyMap.get(normalizedText);

      if (!key) {
        uniqueIndex += 1;
        key = `${prefix}${uniqueIndex}`;
        textKeyMap.set(normalizedText, key);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:6px 10px; border-bottom:1px solid #ccc;">${key}</td>
          <td style="padding:6px 10px; border-bottom:1px solid #ccc;">${item.originalText}</td>
        `;
        tbody.appendChild(tr);
      } else if (isExistingLanguageKey(key)) {
        reusedExistingKeys.add(key);
      } else {
        textKeyMap.set(normalizedText, key);
      }

      item.node.nodeValue = item.node.nodeValue.replace(item.originalText, `{{t('${key}')}}`);
    });

    convertedCount = textKeyMap.size;
  }

  function normalizeTextForKeyReuse(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolveExistingKeyByValue(text) {
    const normalized = normalizeTextForKeyReuse(text);
    return existingTextKeyMap.get(normalized) || '';
  }

  function isExistingLanguageKey(key) {
    if (!key) return false;
    const normalized = normalizeLangKey(key);
    return !!(normalized && (existingValueMap.has(normalized.full) || existingValueMap.has(normalized.short)));
  }

  function renderExistingTable(keys) {
    const tbody = document.querySelector('#existingLangTable tbody');
    tbody.innerHTML = '';

    keys.forEach(key => {
      const value = resolveExistingValue(key);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 10px; border-bottom:1px solid #ccc;">${key}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #ccc;">${value || ''}</td>
      `;
      tbody.appendChild(tr);
    });
    existingCount = keys.length;
  }

  function updateTableVisibility() {
    const container = document.getElementById('tableContainer');
    if (!container) return;

    const hasAny = convertedCount > 0 || existingCount > 0;
    container.style.display = hasAny ? 'block' : 'none';
    if (!hasAny) return;

    if (convertedCount > 0) {
      setActiveTab('converted');
    } else {
      setActiveTab('existing');
    }
  }

  function setActiveTab(type) {
    const convertedPanel = document.getElementById('convertedTablePanel');
    const existingPanel = document.getElementById('existingTablePanel');

    if (convertedPanel) convertedPanel.style.display = type === 'converted' ? 'block' : 'none';
    if (existingPanel) existingPanel.style.display = type === 'existing' ? 'block' : 'none';

    if (convertedTabBtn) {
      convertedTabBtn.style.background = type === 'converted' ? '#e2e8f0' : '#fff';
    }
    if (existingTabBtn) {
      existingTabBtn.style.background = type === 'existing' ? '#e2e8f0' : '#fff';
    }
  }

  if (convertedTabBtn) {
    convertedTabBtn.addEventListener('click', () => setActiveTab('converted'));
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
    const data = await readFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    existingValueMap.clear();
    existingTextKeyMap.clear();

    rows.forEach(row => {
      const rawKey = (row[0] || '').toString().trim();
      const value = (row[1] || '').toString().trim();
      if (!rawKey) return;

      const normalized = normalizeLangKey(rawKey);
      if (!normalized) return;

      existingValueMap.set(normalized.full, value);
      existingValueMap.set(normalized.short, value);
      const normalizedValue = normalizeTextForKeyReuse(value);
      if (normalizedValue && !existingTextKeyMap.has(normalizedValue)) {
        existingTextKeyMap.set(normalizedValue, normalized.full);
      }
    });
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
