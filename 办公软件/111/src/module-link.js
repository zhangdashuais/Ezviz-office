/**
 * 模块 3：下载链接生成逻辑
 */
(function() {
  const apiHeadersInput = document.getElementById('apiHeadersInput');
  const productNameInput = document.getElementById('productNameInput');
  const generateLinkBtn = document.getElementById('generateLinkBtn');
  const linkStatus = document.getElementById('linkStatus');
  const linkResultContainer = document.getElementById('linkResultContainer');
  const generatedLink = document.getElementById('generatedLink');
  const productList = document.getElementById('productList');
  const apiHeadersParsed = document.getElementById('apiHeadersParsed');
  const linkPageInput = document.getElementById('linkPageInput');
  const linkPageSizeInput = document.getElementById('linkPageSizeInput');
  const manualDownloadIdInput = document.getElementById('manualDownloadIdInput');
  const manualProductTitleInput = document.getElementById('manualProductTitleInput');
  const manualGenerateBtn = document.getElementById('manualGenerateBtn');

  generateLinkBtn.addEventListener('click', async () => {
    linkResultContainer.style.display = 'none';
    const productName = productNameInput.value.trim();
    if (!productName) {
      showStatus('请输入产品名称！', 'warn');
      return;
    }

    showStatus('正在请求接口查询中...');
    const rawHeaders = parseHeaders(apiHeadersInput.value.trim());
    const headerResult = buildHeaders(rawHeaders);
    if (headerResult.missing.length > 0) {
      showStatus(`缺少必需请求头：${headerResult.missing.join(', ')}。请从成功请求中复制完整 Headers。`, 'warn');
      return;
    }
    const headers = headerResult.headers;
    const page = normalizePositiveInt(linkPageInput?.value, 1);
    const pageSize = normalizePositiveInt(linkPageSizeInput?.value, 20);

    try {
      const res = await fetch('https://ecadmin-api.ys7.com/api/route/euJavaApi/get/support/ecadmin/download_info/list', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ page, pageSize })
      });

      if (!res.ok) throw new Error(`HTTP 错误: ${res.status}`);
      const parsed = await res.json();
      const dataList = parsed.data?.data || (Array.isArray(parsed) ? parsed : []);

      // 渲染前端返回的一部分产品（最多 10 条）到页面上，便于手动选择
      renderProductList(dataList.slice(0, 10));

      const product = dataList.find(item => item.title?.toLowerCase() === productName.toLowerCase());

      if (product) {
        generateAndOpen(product, `查询成功！已找到“${product.title}”，自动打开中...`);
      } else {
        showStatus(`在当前页未找到“${productName}”。已展示前 ${Math.min(10, dataList.length)} 条结果供参考。`, 'warn');
      }
    } catch (e) {
      showStatus(`请求出错：${e.message}。请检查 Token/权限。`, 'warn');
    }
  });

  if (apiHeadersInput) {
    apiHeadersInput.addEventListener('input', () => {
      const rawHeaders = parseHeaders(apiHeadersInput.value.trim());
      renderParsedHeaders(rawHeaders);
    });
  }

  if (manualGenerateBtn) {
    manualGenerateBtn.addEventListener('click', () => {
      const downloadId = (manualDownloadIdInput?.value || '').trim();
      const title = (manualProductTitleInput?.value || '').trim();

      if (!downloadId || !title) {
        showStatus('请填写 downloadId 和产品名称。', 'warn');
        return;
      }

      generateAndOpen({ downloadId, title }, `已为“${title}”生成并打开链接。`);
    });
  }

  function renderProductList(list) {
    if (!productList) return;
    productList.innerHTML = '';
    if (!list || list.length === 0) {
      productList.style.display = 'none';
      return;
    }

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';

    list.forEach(item => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '6px 0';
      li.style.borderBottom = '1px solid var(--border)';

      const title = document.createElement('div');
      title.textContent = `${item.title || item.name || '未命名'} ${item.downloadId ? `(${item.downloadId})` : ''}`;
      title.style.flex = '1';
      title.style.marginRight = '12px';

      const btn = document.createElement('button');
      btn.textContent = '打开/生成链接';
      btn.addEventListener('click', () => generateAndOpen(item, `已为“${item.title || item.name}” 生成并打开链接。`));

      li.appendChild(title);
      li.appendChild(btn);
      ul.appendChild(li);
    });

    productList.appendChild(ul);
    productList.style.display = 'block';
  }

  function generateAndOpen(product, statusMsg) {
    const url = `https://support.ezviz.com/backend/api/ecadmin_support_download_info_extend?download_id=${product.downloadId}&language_title=${encodeURIComponent(product.title || product.name || '')}`;
    showStatus(statusMsg || '已生成链接，准备打开...', 'ok');
    generatedLink.href = url;
    generatedLink.textContent = url;
    linkResultContainer.style.display = 'block';
    window.open(url, '_blank');
  }

  function showStatus(msg, type = '') {
    linkStatus.textContent = msg;
    linkStatus.className = 'status ' + type;
  }

  function parseHeaders(str) {
    const h = {};
    const lines = str.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        h[match[1].trim()] = match[2].trim();
        continue;
      }

      const next = lines[i + 1];
      if (next && !next.includes(':')) {
        h[line] = next.trim();
        i += 1;
      }
    }
    return h;
  }

  function renderParsedHeaders(headers) {
    if (!apiHeadersParsed) return;
    const entries = Object.entries(headers || {});
    if (entries.length === 0) {
      apiHeadersParsed.textContent = '未识别到有效的请求头。';
      return;
    }

    const list = entries
      .map(([key, value]) => `<div><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value)}</div>`)
      .join('');

    apiHeadersParsed.innerHTML = list;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePositiveInt(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function buildHeaders(inputHeaders) {
    const normalized = normalizeHeaderKeys(inputHeaders);
    // 可选但建议提供的头
    const defaults = {
      'appurl': 'https://ecadmin-api.ys7.com',
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      'action-log-url': 'https://ecadmin.ys7.com/#/app-support/Support/SupportOvs/SupportDownloadCenter/SupportDownloadInfo/SupportDownloadInfoList?table%5Bpage%5D=1&table%5BpageSize%5D=20',
      'time-zone': 'Asia/Shanghai',
      'lang': 'zh-CN',
      'ecadmin-area': 'support'
    };

    Object.keys(defaults).forEach(key => {
      if (!normalized[key]) normalized[key] = defaults[key];
    });

    const missing = [];

    // 必需头：缺少会直接 401
    const required = ['authorization', 'apptimestamp', 'sign', 'appurl'];
    required.forEach(key => {
      if (!normalized[key]) missing.push(key);
    });

    // 自动补 apptimestamp（如果用户没有提供）
    if (!inputHeaders.Apptimestamp && !inputHeaders.apptimestamp && !inputHeaders.APPTIMESTAMP) {
      normalized.apptimestamp = Math.floor(Date.now() / 1000).toString();
      if (!normalized.sign) missing.push('sign');
    }

    return {
      headers: denormalizeHeaderKeys(normalized),
      missing: Array.from(new Set(missing))
    };
  }

  function normalizeHeaderKeys(headers) {
    const result = {};
    Object.keys(headers || {}).forEach(key => {
      result[key.toLowerCase()] = headers[key];
    });
    return result;
  }

  function denormalizeHeaderKeys(headers) {
    const result = {};
    Object.keys(headers || {}).forEach(key => {
      const titleCase = key.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-');
      result[titleCase] = headers[key];
    });
    return result;
  }
})();
