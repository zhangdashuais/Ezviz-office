(function () {
  const fileInput = document.getElementById("specFileInput");
  const fixedNumSelect = document.getElementById("specFixedNumSelect");
  const langSelect = document.getElementById("specLangSelect");
  const titleInput = document.getElementById("specTitleInput");
  const imageSrcInput = document.getElementById("specImageSrcInput");
  const imageAltInput = document.getElementById("specImageAltInput");
  const generateBtn = document.getElementById("specGenerateBtn");
  const statusEl = document.getElementById("specStatus");
  const pcOutput = document.getElementById("specPcOutput");
  const mobileOutput = document.getElementById("specMobileOutput");
  const pcPreview = document.getElementById("specPcPreview");
  const mobilePreview = document.getElementById("specMobilePreview");
  const copyPcBtn = document.getElementById("specCopyPcBtn");
  const copyMobileBtn = document.getElementById("specCopyMobileBtn");

  if (!fileInput || !generateBtn) return;

  let fileName = "";
  let languageList = [];
  let excelDataByLang = [];

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCellValue(sheet, row, col) {
    const cell = sheet[window.XLSX.utils.encode_cell({ r: row, c: col })];
    if (!cell) return "";
    return cell.w != null ? cell.w : cell.v;
  }

  function isStatusRow(values) {
    return window.languageColumnFilterRules.isStatusRow(values);
  }

  function buildLangSelect() {
    langSelect.innerHTML = "";
    languageList.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      langSelect.appendChild(option);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = () => reject(new Error("读取文件失败: " + file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  async function parseWorkbook(file) {
    if (!window.XLSX) {
      throw new Error("XLSX 解析库还没有加载完成。");
    }

    fileName = file.name;
    languageList = [];
    excelDataByLang = [];

    const data = await readFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = window.XLSX.utils.decode_range(sheet["!ref"]);
    const mergeMap = {};
    const mergedCells = new Set();

    (sheet["!merges"] || []).forEach((merge) => {
      mergeMap["c" + merge.s.c + "r" + merge.s.r] = {
        cols: merge.e.c - merge.s.c + 1,
        rows: merge.e.r - merge.s.r + 1
      };
      for (let row = merge.s.r; row <= merge.e.r; row += 1) {
        for (let col = merge.s.c; col <= merge.e.c; col += 1) {
          if (row !== merge.s.r || col !== merge.s.c) mergedCells.add(`${row}:${col}`);
        }
      }
    });

    for (let col = range.s.c; col <= range.e.c; col += 2) {
      const header = String(getCellValue(sheet, range.s.r, col)
        || getCellValue(sheet, range.s.r, col + 1) || "").trim();
      if (!header) continue;
      const rows = [];
      for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const items = [];
        for (let cellCol = col; cellCol <= Math.min(col + 1, range.e.c); cellCol += 1) {
          const cell = sheet[window.XLSX.utils.encode_cell({ r: row, c: cellCol })];
          if (!cell || mergedCells.has(`${row}:${cellCol}`)) continue;
          items.push({
            name: `${cellCol === col ? "A" : "B"}${row + 1}`,
            value: cell.w != null ? cell.w : cell.v,
            unitMerge: mergeMap[`c${cellCol}r${row}`] || { cols: 1, rows: 1 }
          });
        }
        if (isStatusRow(items.map((item) => item.value))) continue;
        if (items.length) rows.push(items);
      }
      languageList.push(header);
      excelDataByLang.push(rows);
    }

    buildLangSelect();
  }

  function renderPcHtml(excelData, title, imageSrc, imageAlt) {
    const visibleRows = excelData.filter(Boolean);
    const rows = visibleRows
      .map((items, index) => {
        const rowClass = items.length > 1 ? ' class="lines"'
          : index === 0 && items[0]?.unitMerge?.cols > 1 ? ' class="firstRow"' : "";
        const cells = items.map((item, key) => {
          const value = escapeHtml(item.value);
          const colspan = item.unitMerge.cols;
          const rowspan = item.unitMerge.rows;

          if (item.name.indexOf("A") > -1) {
            if (colspan > 1) {
              return `<th class="title" colspan="${colspan}" rowspan="${rowspan}">${value}</th>`;
            }
            return `<th colspan="${colspan}" rowspan="${rowspan}" width="200">${value}</th>`;
          }

          if (index === 0 && key === 1 && items.length > 2) {
            return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}" width="160">${value}</td>`;
          }

          if (visibleRows[0]?.length > 3 && index === 0) {
            const width = parseInt(660 / (visibleRows[0].length - 2) * colspan, 10);
            return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}" width="${width}">${value}</td>`;
          }

          return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}">${value}</td>`;
        }).join("");

        return `<tr${rowClass}>${cells}</tr>`;
      })
      .join("\n");

    return [
      '<div class="p960">',
      ...(imageSrc ? [
        '    <div class="pro-img">',
        `      <img class="pro-img__src" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">`,
        "    </div>"
      ] : []),
      `  <div class="pro-title">${escapeHtml(title)}</div>`,
      '  <table class="pro_infobox">',
      "    <tbody>",
      rows,
      "    </tbody>",
      "  </table>",
      "</div>"
    ].join("\n");
  }

  function renderMobileHtml(excelData, title, imageSrc, imageAlt) {
    const rows = excelData
      .filter(Boolean)
      .map((items) => items.map((item) => {
        const value = escapeHtml(item.value);

        if (item.name.indexOf("A") > -1) {
          if (item.unitMerge.cols > 1) {
            return `<tr class="line"><th><div class="tit">${value}</div></th></tr>`;
          }
          return `<tr class="lines"><th><div class="name">${value}</div></th></tr>`;
        }

        return `<tr class="lines"><td>${value}</td></tr>`;
      }).join(""))
      .join("\n");

    return [
      '<div class="mobile-mall_us-content">',
      '  <div class="product-spec">',
      ...(imageSrc ? [
        '    <div class="pro-img">',
        `      <img class="pro-img__src" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">`,
        "    </div>"
      ] : []),
      `    <div class="pro-title">${escapeHtml(title)}</div>`,
      '    <div class="table">',
      "      <table>",
      "        <tbody>",
      rows,
      "        </tbody>",
      "      </table>",
      "    </div>",
      "  </div>",
      "</div>"
    ].join("\n");
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(label + " 已复制。", "ok");
    } catch (_) {
      const scratch = document.createElement("textarea");
      scratch.value = text;
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand("copy");
      scratch.remove();
      setStatus(label + " 已复制。", "ok");
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      setStatus("正在解析 Excel...");
      await parseWorkbook(file);
      setStatus("Excel 已解析，请选择语种后点击生成。", "ok");
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), "warn");
    }
  });

  generateBtn.addEventListener("click", () => {
    const langIndex = Number(langSelect.value || 0);
    const excelData = excelDataByLang[langIndex] || [];

    if (!excelData.length) {
      setStatus("请先上传 Excel，并确认已识别到详细参数。", "warn");
      return;
    }

    const title = titleInput.value.trim() || "Specifications";
    const imageSrc = imageSrcInput.value.trim();
    const imageAlt = imageAltInput.value.trim();
    const pcHtml = renderPcHtml(excelData, title, imageSrc, imageAlt);
    const mobileHtml = renderMobileHtml(excelData, title, imageSrc, imageAlt);

    pcOutput.value = pcHtml;
    mobileOutput.value = mobileHtml;
    pcPreview.innerHTML = pcHtml;
    mobilePreview.innerHTML = mobileHtml;
    copyPcBtn.disabled = false;
    copyMobileBtn.disabled = false;
    setStatus("生成完成，已按标准表格结构输出并忽略 OK 状态行。", "ok");
  });

  copyPcBtn.addEventListener("click", () => copyText(pcOutput.value, "PC HTML"));
  copyMobileBtn.addEventListener("click", () => copyText(mobileOutput.value, "Mobile HTML"));
})();
