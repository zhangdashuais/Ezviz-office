(function() {
  const $ = (id) => document.getElementById(id);

  const elements = {
    pdf: $('specExcelPdfInput'),
    extractPdf: $('specExcelExtractPdfBtn'),
    category: $('specExcelCategorySelect'),
    model: $('specExcelModelInput'),
    outputName: $('specExcelOutputNameInput'),
    rawText: $('specExcelTextInput'),
    generate: $('specExcelGenerateBtn'),
    download: $('specExcelDownloadBtn'),
    clear: $('specExcelClearBtn'),
    status: $('specExcelStatus'),
    preview: $('specExcelPreview')
  };

  if (!elements.generate) return;

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const localeHeaders = [
    '1_English (English-\u82f1\u6587)',
    '2_\u0420\u0443\u0441\u0441\u043a\u0438\u0439 (Russian-\u4fc4\u8bed)',
    '5_Magyar (Hungarian-\u5308\u7259\u5229\u8bed)',
    '6_\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac (Greek-\u5e0c\u814a\u8bed)',
    '7_Deutsch (German-\u5fb7\u8bed)',
    '8_Italiano (Italian-\u610f\u5927\u5229\u8bed)',
    '9_\u010cesk\u00fd (Czech-\u6377\u514b\u8bed)',
    '10_Slovensko (Slovak-\u65af\u6d1b\u4f10\u514b\u8bed)',
    '11_Fran\u00e7ais (France-\u6cd5\u8bed)',
    '12_Polski (Polish-\u6ce2\u5170\u8bed)',
    '13_Nederlands (Dutch-\u8377\u5170\u8bed)',
    '14_Portugu\u00eas (Portuguese-\u8461\u8404\u7259\u8bed)',
    '15_Espa\u00f1ol (Spanish-\u897f\u73ed\u7259\u8bed)',
    '16_Rom\u00e2n (Romanian-\u7f57\u9a6c\u5c3c\u4e9a\u8bed)',
    '25_\ud55c\uad6d\uc5b4 (Korean-\u97e9\u8bed)',
    '27_\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22 (Thai-\u6cf0\u8bed)',
    '28_Ti\u1ebfng Vi\u1ec7t (Vietnamese-\u8d8a\u5357\u8bed)',
    '29_\u65e5\u672c\u8a9e (Japanese-\u65e5\u8bed)',
    '33_Portugu\u00eas - BRAZIL(Brazilian Portuguese-\u5df4\u897f\u8461\u8404\u7259\u8bed )',
    '34_\u0627\u0644\u0639\u0631\u0628\u064a\u0629(Arabic-\u963f\u62c9\u4f2f\u8bed)',
    '36_indonesia(Indonesian-\u5370\u5c3c\u8bed)',
    '42_Espa\u00f1ol (Latinoam\u00e9rica)(Spanish(Latin)_\u62c9\u7f8e\u897f\u73ed\u7259\u8bed\uff09',
    'T\u00fcrk\u00e7e (Turkish-\u571f\u8033\u5176\u8bed)',
    'Suomeksi (Finnish-\u82ac\u5170\u8bed)',
    '\u7e41\u4f53\u4e2d\u6587',
    ''
  ];

  const titleLabels = [
    'Specifications',
    '\u0422\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0445\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0438',
    'Specifik\u00e1ci\u00f3k',
    '\u03a0\u03c1\u03bf\u03b4\u03b9\u03b1\u03b3\u03c1\u03b1\u03c6\u03ad\u03c2',
    'Spezifikationen',
    'Specifiche',
    'Specifikace',
    'Specifikacije',
    'Caract\u00e9ristiques',
    'Specyfikacje',
    'Specificaties',
    'Especifica\u00e7\u00f5es',
    'Presupuesto',
    'Specifica\u021bii',
    '\uba85\uc138\uc11c',
    '\u0e02\u0e49\u0e2d\u0e01\u0e33\u0e2b\u0e19\u0e14',
    'Th\u00f4ng s\u1ed1 k\u1ef9 thu\u1eadt',
    '\u4ed5\u69d8',
    'Especifica\u00e7\u00f5es',
    '\u062a\u062d\u062f\u064a\u062f',
    'Spesifikasi',
    'Presupuesto',
    'Teknik \u00d6zellikler',
    'Tekniset tiedot',
    '\u898f\u683c',
    'Specifications'
  ];

  const modelLabels = [
    'Model',
    '\u041c\u043e\u0434\u0435\u043b\u044c',
    'Modell',
    '\u039c\u03bf\u03bd\u03c4\u03ad\u03bb\u03bf',
    'Modell',
    'Modello',
    'Model',
    'Model',
    'Mod\u00e8le',
    'Model',
    'Model',
    'Modelo',
    'Modelo',
    'Model',
    '\ubaa8\ub378',
    '\u0e41\u0e1a\u0e1a\u0e2d\u0e22\u0e48\u0e32\u0e07',
    'Ng\u01b0\u1eddi m\u1eabu',
    '\u30e2\u30c7\u30eb',
    'Modelo',
    '\u0646\u0645\u0648\u0630\u062c',
    'Model',
    'Modelo',
    'Model',
    'Malli',
    '\u6a21\u578b',
    'Model'
  ];

  const localeColumnWidths = [
    [37.0, 45.109375],
    [37.0, 54.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.0, 53.88671875],
    [37.44140625, 54.44140625],
    [37.33203125, 55.109375],
    [9.0, 13.0]
  ];

  const sectionAliases = new Map([
    ['camera parameters', 'Camera Parameters'],
    ['camera', 'Camera'],
    ['video parameters', 'Video Parameters'],
    ['video & audio', 'Video & Audio'],
    ['audio and video', 'Video & Audio'],
    ['pir sensor', 'PIR Sensor'],
    ['chime', 'Chime'],
    ['network parameters', 'Network Parameters'],
    ['network', 'Network'],
    ['wi-fi parameters', 'Wi-Fi Parameters'],
    ['wifi parameters', 'Wi-Fi Parameters'],
    ['battery', 'Battery'],
    ['function', 'Function'],
    ['functions', 'Functions'],
    ['smart functions', 'Smart Functions'],
    ['smart function', 'Smart Functions'],
    ['interface', 'Interface'],
    ['storage', 'Storage'],
    ['general', 'General'],
    ['in the box', 'In the box'],
    ['package contents', 'In the box'],
    ['box content', 'In the box'],
    ['certifications', 'Certifications'],
    ['certification', 'Certifications']
  ]);

  const sectionOrder = [
    'Camera',
    'Camera Parameters',
    'Video Parameters',
    'Video & Audio',
    'PIR Sensor',
    'Chime',
    'Network',
    'Network Parameters',
    'Wi-Fi Parameters',
    'Battery',
    'Interface',
    'Function',
    'Functions',
    'Smart Functions',
    'Storage',
    'General',
    'In the box',
    'Certifications'
  ];

  const categorySectionOrder = {
    camera: [
      'Camera',
      'Video & Audio',
      'Network',
      'Functions',
      'Storage',
      'General',
      'In the box',
      'Certifications'
    ],
    smarthome: [
      'Camera Parameters',
      'Video Parameters',
      'PIR Sensor',
      'Chime',
      'Network Parameters',
      'Wi-Fi Parameters',
      'Battery',
      'Interface',
      'Functions',
      'Smart Functions',
      'Storage',
      'General',
      'In the box',
      'Certifications'
    ]
  };

  function getProductCategory() {
    return elements.category ? elements.category.value : 'smarthome';
  }

  const knownLabels = [
    'Image Sensor',
    'Shutter Speed',
    'Lens',
    'FOV',
    'PT Angle',
    'Day & Night',
    'Color Night Vision',
    'True-WDR',
    'WDR',
    'DNR',
    'Video Compression',
    'Video Bit Rate',
    'Bit Rate',
    'Max. Resolution',
    'Frame Rate',
    'Privacy Mask',
    'Local Storage',
    'Cloud Storage',
    'Weatherproof',
    'Sensing Angle',
    'Detection Distance',
    'Detection Sensitivity',
    'Communication Method',
    'Multiple Ringtones',
    'Power Supply',
    'Network Protocol',
    'Two-Way Talk',
    'Wi-Fi Standard',
    'Frequency Range',
    'Channel Bandwidth',
    'Battery Capacity',
    'Charging Input',
    'Intelligent Alarm',
    'AI Detection',
    'Motion Detection',
    'Security',
    'Transmission Rate',
    'Audio Input',
    'Audio Output',
    'Voice Changer',
    'Operation Conditions',
    'Product Size (LWH)',
    'Product Dimensions',
    'Dimensions',
    'Packaging Size',
    'Packaging Dimensions',
    'Net Weight',
    'Weight with Package',
    'Weight',
    'Certifications',
    'Model'
  ].sort((a, b) => b.length - a.length);

  let lastWorkbook = null;
  let lastFilename = 'spec.xlsx';

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = 'status' + (type ? ' ' + type : '');
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\ufb01/g, 'fi')
      .replace(/\ufb02/g, 'fl')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[•]/g, '-')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value)
      .replace(/[:：]+$/, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function resolveSection(line) {
    const cleaned = normalizeText(line);
    const direct = sectionAliases.get(normalizeKey(cleaned));
    if (direct) return direct;

    if (isStandaloneSectionTitle(cleaned)) return cleaned.replace(/[:：]+$/, '');
    return null;
  }

  function isStandaloneSectionTitle(line) {
    const cleaned = normalizeText(line).replace(/[:：]+$/, '');
    if (!cleaned || cleaned.length > 40) return false;
    if (/^[-–—]/.test(cleaned)) return false;
    if (/\d/.test(cleaned)) return false;
    if (/\b(Supports?|Max|Min|IEEE|AC|DC|CE|UL|FCC|RoHS|REACH|WEEE|WPA|H\.\d)\b/i.test(cleaned)) return false;
    if (knownLabels.some((label) => label.toLowerCase() === cleaned.toLowerCase())) return false;
    return /^[A-Z][A-Za-z&/() -]+$/.test(cleaned);
  }

  function splitLabelValue(line) {
    const cleaned = normalizeText(line);
    if (!cleaned) return null;

    const colon = cleaned.match(/^([^:：]{2,90})[:：]\s*(.+)$/);
    if (colon) return [normalizeText(colon[1]), normalizeText(colon[2])];

    const spaced = cleaned.match(/^(.{2,90}?)\s{2,}(.+)$/);
    if (spaced) return [normalizeText(spaced[1]), normalizeText(spaced[2])];

    const lower = cleaned.toLowerCase();
    for (const label of knownLabels) {
      const labelLower = label.toLowerCase();
      if (lower === labelLower) return [label, ''];
      if (lower.startsWith(labelLower + ' ')) {
        return [label, normalizeText(cleaned.slice(label.length))];
      }
    }

    const inferred = cleaned.match(/^([A-Z][A-Za-z0-9/&().+\-\s]{2,70}?)\s+((?:Supports?|Max(?:\.|:)?|Min(?:\.|:)?|IEEE|AC|DC|CE\b|UL\b|FCC\b|RoHS\b|REACH\b|WEEE\b|[0-9-]|H\.\d|IR\b|AES\b|TLS\b|WPA\b|EZVIZ\b).+)$/);
    if (inferred) return [normalizeText(inferred[1]), normalizeText(inferred[2])];

    return null;
  }

  function parseSpecText(raw, forcedModel) {
    const lines = normalizeText(raw)
      .split(/\r?\n/)
      .map(normalizeText)
      .filter(Boolean);

    const rows = [];
    const boxItems = [];
    let currentSection = 'Camera';
    let pendingLabel = '';
    let lastItem = null;
    let model = normalizeText(forcedModel);

    for (const line of lines) {
      if (/^www\./i.test(line) || /^Specifications are subject to change/i.test(line)) {
        continue;
      }

      const modelOnly = line.match(/^\bCS-[A-Z0-9-]+\b$/i);
      if (modelOnly) {
        if (!model) model = modelOnly[0];
        lastItem = null;
        continue;
      }

      if (/in the box/i.test(line) && /certifications/i.test(line)) {
        currentSection = 'Certifications';
        pendingLabel = '';
        lastItem = null;
        continue;
      }

      const section = resolveSection(line);
      if (section) {
        currentSection = section;
        pendingLabel = '';
        lastItem = null;
        continue;
      }

      if (/^[-–—]\s*/.test(line)) {
        boxItems.push(line.replace(/^[-–—]\s*/, '- ').replace(/^-([^\s])/, '- $1'));
        currentSection = 'In the box';
        pendingLabel = '';
        lastItem = null;
        continue;
      }

      if (/^(CE|FCC|UL|UKCA|RoHS|REACH|WEEE)\b/i.test(line)) {
        lastItem = { section: 'Certifications', label: 'Certifications', value: line };
        rows.push(lastItem);
        currentSection = 'Certifications';
        pendingLabel = '';
        continue;
      }

      const pair = splitLabelValue(line);
      if (pair) {
        const [label, value] = pair;
        if (!value) {
          pendingLabel = label;
          lastItem = null;
          continue;
        }
        const finalSection = label === 'Certifications' ? 'Certifications' : currentSection;
        lastItem = { section: finalSection, label, value };
        rows.push(lastItem);
        if (!model && label.toLowerCase() === 'model') model = value;
        pendingLabel = '';
        continue;
      }

      if (pendingLabel) {
        const finalSection = pendingLabel === 'Certifications' ? 'Certifications' : currentSection;
        lastItem = { section: finalSection, label: pendingLabel, value: line };
        rows.push(lastItem);
        if (!model && pendingLabel.toLowerCase() === 'model') model = line;
        pendingLabel = '';
        continue;
      }

      if (lastItem) {
        lastItem.value += '\n' + line;
      }
    }

    const seen = new Set();
    const uniqueRows = rows.filter((item) => {
      const key = item.section + '|' + item.label + '|' + item.value;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { model, rows: uniqueRows, boxItems };
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) {
      throw new Error('PDF 解析库还没有加载成功，请检查网络后刷新页面。');
    }
    if (!file) {
      throw new Error('请先选择 PDF 文件。');
    }

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .map((item) => ({
          text: normalizeText(item.str),
          x: item.transform[4],
          y: item.transform[5]
        }))
        .filter((item) => item.text);

      items.sort((a, b) => Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x);

      const lines = [];
      let currentY = null;
      let currentLine = [];
      for (const item of items) {
        if (currentY !== null && Math.abs(item.y - currentY) > 4) {
          lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
          currentLine = [];
        }
        currentLine.push(item.text);
        currentY = item.y;
      }
      if (currentLine.length) lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
      pages.push(lines.filter(Boolean).join('\n'));
    }

    return pages.join('\n\n');
  }

  function extractSpecificationsBlock(text) {
    const cleaned = normalizeText(text).replace(/\r/g, '');
    const starts = [
      cleaned.match(/\bCS-[A-Z0-9-]+\b/i),
      cleaned.match(/(^|\n)\s*(Camera Parameters|Camera|Video Parameters|PIR Sensor|Chime|Network Parameters|Wi-Fi Parameters|Interface|Storage|Functions|Smart Functions|Battery|General|Certifications)\s*($|\n)/i),
      cleaned.match(/(^|\n)\s*(Specifications|Specification|Technical Specifications)\s*($|\n)/i)
    ]
      .filter(Boolean)
      .map((match) => match.index)
      .sort((a, b) => a - b);

    if (!starts.length) return cleaned;

    const tail = cleaned.slice(starts[0]);
    const endPatterns = [
      /\n\s*(About EZVIZ|COPYRIGHT|©)\b/i,
      /\n\s*(Disclaimer|All rights reserved)\b/i
    ];

    let endIndex = tail.length;
    for (const pattern of endPatterns) {
      const match = tail.match(pattern);
      if (match && match.index > 200) endIndex = Math.min(endIndex, match.index);
    }

    return tail.slice(0, endIndex).trim();
  }

  function buildWorkbook(parsed) {
    const aoa = [];
    const merges = [];
    const pairCount = localeHeaders.length;

    const headerRow = [];
    const titleRow = [];
    for (let i = 0; i < pairCount; i++) {
      const c = i * 2;
      headerRow[c] = localeHeaders[i];
      headerRow[c + 1] = '';
      titleRow[c] = titleLabels[i];
      titleRow[c + 1] = '';
      merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 1 } });
      merges.push({ s: { r: 1, c }, e: { r: 1, c: c + 1 } });
    }
    aoa.push(headerRow, titleRow);

    addNormalRow(aoa, modelLabels, parsed.model || '', pairCount);

    const grouped = new Map();
    for (const item of parsed.rows) {
      if (item.label.toLowerCase() === 'model') continue;
      if (!grouped.has(item.section)) grouped.set(item.section, []);
      grouped.get(item.section).push(item);
    }

    const preferredOrder = categorySectionOrder[getProductCategory()] || sectionOrder;
    const ordered = [];
    for (const section of preferredOrder) {
      if (grouped.has(section) || (section === 'In the box' && parsed.boxItems.length)) ordered.push(section);
    }
    for (const section of grouped.keys()) {
      if (!ordered.includes(section)) ordered.push(section);
    }

    for (const section of ordered) {
      addSectionRow(aoa, merges, section, pairCount);

      if (section === 'In the box') {
        const start = aoa.length;
        for (const item of parsed.boxItems) {
          const row = [];
          for (let i = 0; i < pairCount; i++) {
            const c = i * 2;
            row[c] = 'In the box';
            row[c + 1] = item;
          }
          aoa.push(row);
        }
        const end = aoa.length - 1;
        if (end > start) {
          for (let i = 0; i < pairCount; i++) {
            merges.push({ s: { r: start, c: i * 2 }, e: { r: end, c: i * 2 } });
          }
        }
        continue;
      }

      for (const item of grouped.get(section) || []) {
        addNormalRow(aoa, localeHeaders.map(() => item.label), item.value, pairCount);
      }
    }

    if (window.ExcelJS) {
      return {
        type: 'exceljs',
        workbook: buildStyledWorkbook(aoa, merges, ordered)
      };
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols'] = localeColumnWidths.flatMap((pair) => [{ wch: pair[0] }, { wch: pair[1] }]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Spec');
    return { type: 'xlsx', workbook: wb };
  }

  function buildStyledWorkbook(aoa, merges, sectionNames) {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Spec');
    const pairCount = localeHeaders.length;
    const sectionSet = new Set(sectionNames);

    aoa.forEach((row) => ws.addRow(row));
    localeColumnWidths.forEach((pair, index) => {
      ws.getColumn(index * 2 + 1).width = pair[0];
      ws.getColumn(index * 2 + 2).width = pair[1];
    });

    merges.forEach((merge) => {
      ws.mergeCells(merge.s.r + 1, merge.s.c + 1, merge.e.r + 1, merge.e.c + 1);
    });

    ws.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const isLabelColumn = colNumber % 2 === 1;
        const firstValue = normalizeText(ws.getRow(rowNumber).getCell(1).value || '');
        const isHeader = rowNumber <= 2;
        const isModel = rowNumber === 3;
        const isSection = sectionSet.has(firstValue) && !normalizeText(ws.getRow(rowNumber).getCell(2).value || '');

        cell.alignment = {
          vertical: isSection || isHeader ? 'middle' : 'top',
          horizontal: isSection || isHeader ? 'center' : (isLabelColumn ? 'center' : 'left'),
          wrapText: true
        };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF000000' } },
          left: { style: 'medium', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          right: { style: 'medium', color: { argb: 'FF000000' } }
        };
        cell.font = {
          name: 'Arial',
          size: 11,
          bold: isHeader || isModel || isSection || isLabelColumn
        };

        if (rowNumber === 1) {
          cell.fill = solidFill('FFD9EAD3');
        } else if (rowNumber === 2 || isSection) {
          cell.fill = solidFill('FFFFFFFF');
        } else if (isLabelColumn) {
          cell.fill = solidFill('FFCCCCCC');
        }
      });

      if (rowNumber <= 3) {
        row.height = 28;
      } else if (sectionSet.has(normalizeText(row.getCell(1).value || ''))) {
        row.height = 24;
      }
    });

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
    return workbook;
  }

  function solidFill(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  }

  function addSectionRow(aoa, merges, label, pairCount) {
    const r = aoa.length;
    const row = [];
    for (let i = 0; i < pairCount; i++) {
      const c = i * 2;
      row[c] = label;
      row[c + 1] = '';
      merges.push({ s: { r, c }, e: { r, c: c + 1 } });
    }
    aoa.push(row);
  }

  function addNormalRow(aoa, labels, value, pairCount) {
    const row = [];
    for (let i = 0; i < pairCount; i++) {
      const c = i * 2;
      row[c] = labels[i] || labels[0] || '';
      row[c + 1] = value;
    }
    aoa.push(row);
  }

  function renderPreview(parsed) {
    const rows = [];
    rows.push('<tr><th>Section</th><th>Item</th><th>Value</th></tr>');
    rows.push(`<tr><td></td><td>Model</td><td>${escapeHtml(parsed.model || '')}</td></tr>`);
    for (const item of parsed.rows) {
      if (item.label.toLowerCase() === 'model') continue;
      rows.push(`<tr><td>${escapeHtml(item.section)}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.value)}</td></tr>`);
    }
    for (const item of parsed.boxItems) {
      rows.push(`<tr><td>In the box</td><td>In the box</td><td>${escapeHtml(item)}</td></tr>`);
    }
    elements.preview.innerHTML = `<table>${rows.join('')}</table>`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  elements.generate.addEventListener('click', async () => {
    if (!window.XLSX) {
      setStatus('XLSX 库还没有加载成功，请检查网络后刷新页面。', 'warn');
      return;
    }

    const raw = elements.rawText.value;
    if (!normalizeText(raw)) {
      setStatus('请先粘贴 Specifications 文本，或先从 PDF 提取。', 'warn');
      return;
    }

    try {
      setStatus('正在解析文本并生成 Excel...');
      const parsed = parseSpecText(raw, elements.model.value);
      if (!parsed.model) parsed.model = normalizeText(elements.model.value);

      lastWorkbook = buildWorkbook(parsed);
      lastFilename = normalizeText(elements.outputName.value) || `${parsed.model || 'product'} spec.xlsx`;
      if (!/\.xlsx$/i.test(lastFilename)) lastFilename += '.xlsx';

      renderPreview(parsed);
      elements.download.disabled = false;
      setStatus(`已生成 ${localeHeaders.length} 组语言列，预览中有 ${parsed.rows.length + parsed.boxItems.length + 1} 条内容。`, 'ok');
    } catch (error) {
      console.error(error);
      setStatus('生成失败：' + (error && error.message ? error.message : error), 'warn');
    }
  });

  elements.download.addEventListener('click', async () => {
    if (!lastWorkbook) return;
    if (lastWorkbook.type === 'exceljs') {
      const buffer = await lastWorkbook.workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = lastFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }
    XLSX.writeFile(lastWorkbook.workbook, lastFilename);
  });

  elements.clear.addEventListener('click', () => {
    elements.rawText.value = '';
    elements.model.value = '';
    elements.outputName.value = '';
    elements.preview.innerHTML = '';
    elements.download.disabled = true;
    lastWorkbook = null;
    setStatus('已清空，可以上传 PDF 或粘贴下一份 Specifications 文本。');
  });

  if (elements.extractPdf) {
    elements.extractPdf.addEventListener('click', async () => {
      try {
        setStatus('正在读取 PDF 文本...');
        const file = elements.pdf && elements.pdf.files ? elements.pdf.files[0] : null;
        const text = await extractPdfText(file);
        const specText = extractSpecificationsBlock(text);
        elements.rawText.value = specText;

        if (!normalizeText(elements.model.value)) {
          const modelMatch = specText.match(/\bCS-[A-Z0-9-]+\b/i) || text.match(/\bCS-[A-Z0-9-]+\b/i);
          if (modelMatch) elements.model.value = modelMatch[0];
        }
        if (!normalizeText(elements.outputName.value) && file) {
          elements.outputName.value = file.name.replace(/\.pdf$/i, ' spec.xlsx');
        }

        const parsed = parseSpecText(specText, elements.model.value);
        renderPreview(parsed);
        setStatus(`PDF 文本已提取，识别到 ${parsed.rows.length + parsed.boxItems.length + 1} 条内容。请检查后生成 Excel。`, 'ok');
      } catch (error) {
        console.error(error);
        setStatus('PDF 提取失败：' + (error && error.message ? error.message : error), 'warn');
      }
    });
  }
})();
