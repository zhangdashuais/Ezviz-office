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

    const prefix = buildProductPrefix(langPrefixInput.value);
    updateStatus('正在处理中...');

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
    const conversion = renderTable(textNodes, prefix, existingKeys);
    renderExistingTable([...new Set([...existingKeys, ...reusedExistingKeys])]);
    updateTableVisibility();
    
    currentProcessedHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    currentProcessedHtml = currentProcessedHtml.replace(/\{\{t\(['"]([^'"]+)['"]\)\}\}/g, '{{t(&#39;$1&#39;)}}');
    
    textOutput.value = currentProcessedHtml;
    textPreviewFrame.srcdoc = currentProcessedHtml;
    textDownloadBtn.disabled = false;
    updateStatus(
      conversion.existingProduct
        ? `处理成功：已有产品 ${conversion.existingProduct} 命中 ${conversion.matchCount} 个字段，已复用该产品字段。`
        : existingTextKeyMap.size
          ? `处理成功：没有已有产品达到 10 个匹配字段，已使用新产品 ${conversion.newProduct}。`
          : `处理成功：已使用新产品 ${conversion.newProduct}。`,
      'ok'
    );
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
    tbody.innerHTML = '';
    
    const textKeyMap = new Map();
    const reusePlan = selectExistingProduct(nodes);
    const effectivePrefix = reusePlan ? reusePlan.prefix : prefix;
    const reservedKeys = new Set();
    existingKeys.forEach(key => reserveLanguageKey(reservedKeys, key));
    existingValueMap.forEach((_value, key) => reserveLanguageKey(reservedKeys, key));
    let uniqueIndex = 0;

    nodes.forEach((item) => {
      const normalizedText = normalizeTextForKeyReuse(item.originalText);
      let key = resolveExistingKeyByValue(normalizedText, reusePlan?.product)
        || textKeyMap.get(normalizedText);

      if (!key) {
        do {
          uniqueIndex += 1;
          key = `${effectivePrefix}${uniqueIndex}`;
        } while (isReservedLanguageKey(reservedKeys, key));
        textKeyMap.set(normalizedText, key);
        reserveLanguageKey(reservedKeys, key);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:6px 10px; border-bottom:1px solid #ccc;">${displayLanguageKey(key)}</td>
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
    return {
      existingProduct: reusePlan?.product || '',
      matchCount: reusePlan?.matchCount || 0,
      newProduct: productNameFromPrefix(effectivePrefix)
    };
  }

  function buildProductPrefix(rawPrefix) {
    const short = String(rawPrefix || '')
      .trim()
      .replace(/^goods\./i, '')
      .replace(/[_.]+$/, '');
    return `goods.${short || 'new_product'}_`;
  }

  function productNameFromPrefix(prefix) {
    return String(prefix || '')
      .replace(/^goods\./, '')
      .replace(/[_.]+$/, '');
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

  function describeProductKey(key) {
    const normalized = normalizeLangKey(key);
    if (!normalized) return null;
    const short = normalized.short;
    if (short.includes('.')) {
      const product = short.split('.')[0];
      return { product, prefix: `goods.${product}.` };
    }
    const numbered = short.match(/^(.*)_\d+$/);
    if (!numbered?.[1]) return null;
    return { product: numbered[1], prefix: `goods.${numbered[1]}_` };
  }

  function selectExistingProduct(nodes) {
    const matchesByProduct = new Map();
    const uniqueTexts = new Set(
      nodes.map(item => normalizeTextForKeyReuse(item.originalText)).filter(Boolean)
    );
    uniqueTexts.forEach(text => {
      (existingTextKeyMap.get(text) || []).forEach(key => {
        const descriptor = describeProductKey(key);
        if (!descriptor) return;
        const current = matchesByProduct.get(descriptor.product)
          || { ...descriptor, keys: new Set() };
        current.keys.add(normalizeLangKey(key).full);
        matchesByProduct.set(descriptor.product, current);
      });
    });
    const best = [...matchesByProduct.values()]
      .sort((left, right) => right.keys.size - left.keys.size
        || left.product.localeCompare(right.product))[0];
    return best && best.keys.size >= 10
      ? { product: best.product, prefix: best.prefix, matchCount: best.keys.size }
      : null;
  }

  function resolveExistingKeyByValue(text, product) {
    if (!product) return '';
    const normalized = normalizeTextForKeyReuse(text);
    return (existingTextKeyMap.get(normalized) || []).find(key =>
      describeProductKey(key)?.product === product) || '';
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
          <td style="padding:6px 10px; border-bottom:1px solid #ccc;">${displayLanguageKey(key)}</td>
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
    existingValueMap.clear();
    existingTextKeyMap.clear();

    let parsedCount = 0;
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const layout = detectLanguageTableLayout(rows);
      rows.slice(layout.firstDataRow).forEach(row => {
        const rawKey = String(row[layout.keyColumn] || '').trim();
        const value = String(row[layout.sourceColumn] || '').trim();
        if (!rawKey || !value) return;

        const normalized = normalizeLangKey(rawKey);
        if (!normalized) return;

        if (!existingValueMap.has(normalized.full)) {
          existingValueMap.set(normalized.full, value);
          existingValueMap.set(normalized.short, value);
          parsedCount += 1;
        }
        const normalizedValue = normalizeTextForKeyReuse(value);
        const storedValue = normalizeTextForKeyReuse(existingValueMap.get(normalized.full));
        if (normalizedValue === storedValue) {
          const keys = existingTextKeyMap.get(normalizedValue) || [];
          if (!keys.includes(normalized.full)) keys.push(normalized.full);
          existingTextKeyMap.set(normalizedValue, keys);
        }
      });
    });
    if (!parsedCount) {
      throw new Error('没有识别到字段名和原文列');
    }
  }

  function detectLanguageTableLayout(rows) {
    const headerLimit = Math.min(rows.length, 12);
    for (let rowIndex = 0; rowIndex < headerLimit; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      let keyColumn = -1;
      let sourceColumn = -1;
      row.forEach((cell, columnIndex) => {
        const header = normalizeTextForKeyReuse(cell).toLowerCase();
        if (/^(?:key|field)$|single\s*word|field\s*(?:name|key)|i18n\s*key|variable\s*name|变量名|字段名/.test(header)) {
          keyColumn = columnIndex;
        }
        if (/^(?:value|source|original)$|^en-us\b|source\s*(?:text|value)|original\s*(?:text|value)|原文(?:内容)?/.test(header)) {
          sourceColumn = columnIndex;
        }
      });
      if (keyColumn >= 0 && sourceColumn >= 0) {
        return { keyColumn, sourceColumn, firstDataRow: rowIndex + 1 };
      }
    }
    return { keyColumn: 0, sourceColumn: 1, firstDataRow: 0 };
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

  function displayLanguageKey(key) {
    return normalizeLangKey(key)?.short || String(key || '');
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
