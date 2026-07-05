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

    (sheet["!merges"] || []).forEach((merge) => {
      mergeMap["c" + merge.s.c + "r" + merge.s.r] = {
        cols: merge.e.c - merge.s.c + 1,
        rows: merge.e.r - merge.s.r + 1
      };
    });

    for (let col = 0, langIndex = 0; col <= range.e.c; col += 2, langIndex += 1) {
      const firstHeader = getCellValue(sheet, 0, col);
      const secondHeader = getCellValue(sheet, 0, col + 1);
      languageList.push(String(firstHeader || secondHeader || "Language " + (langIndex + 1)));
      excelDataByLang[langIndex] = [];
    }

    Object.keys(sheet).forEach((address) => {
      if (address[0] === "!") return;
      const pos = window.XLSX.utils.decode_cell(address);
      if (pos.r <= 0) return;

      const langIndex = Math.floor(pos.c / 2);
      if (!excelDataByLang[langIndex]) return;

      const rowIndex = pos.r - 1;
      const isFirstCol = pos.c % 2 === 0;
      const mergeKey = "c" + pos.c + "r" + pos.r;
      const cell = sheet[address];

      if (!excelDataByLang[langIndex][rowIndex]) {
        excelDataByLang[langIndex][rowIndex] = [];
      }

      excelDataByLang[langIndex][rowIndex].push({
        name: (isFirstCol ? "A" : "B") + (pos.r + 1),
        position: pos,
        value: cell.w != null ? cell.w : cell.v,
        unitMerge: mergeMap[mergeKey] || { cols: 1, rows: 1 }
      });
    });

    buildLangSelect();
  }

  function renderPcHtml(excelData, title, imageSrc, imageAlt) {
    const rows = excelData
      .filter(Boolean)
      .map((items, index) => {
        const rowClass = items.length > 1 ? "lines" : "line";
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

          if (excelData[0] && excelData[0].length > 3 && index === 0) {
            const width = parseInt(660 / (excelData[0].length - 2) * colspan, 10);
            return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}" width="${width}">${value}</td>`;
          }

          return `<td class="tdline3" colspan="${colspan}" rowspan="${rowspan}">${value}</td>`;
        }).join("");

        return `<tr class="${rowClass}">${cells}</tr>`;
      })
      .join("\n");

    return [
      '<div class="pc-content">',
      '  <div class="p960">',
      '    <div class="pro-img">',
      `      <img class="pro-img__src" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">`,
      "    </div>",
      `    <div class="pro-title">${escapeHtml(title)}</div>`,
      '    <table class="pro_infobox">',
      "      <tbody>",
      rows,
      "      </tbody>",
      "    </table>",
      "  </div>",
      "</div>"
    ].join("\n");
  }

  function renderMobileHtml(excelData, title, imageSrc, imageAlt) {
    const fixedNum = Number(fixedNumSelect.value || 1);
    const mobileData = excelData.filter(Boolean).map((row) => row.slice());

    for (let i = mobileData.length - 1; i >= 0; i -= 1) {
      for (let j = mobileData[i].length - 1; j >= 0; j -= 1) {
        const item = mobileData[i][j];
        if (!item) continue;

        if (item.name.indexOf("A") > -1) {
          mobileData[i].splice(j, 1);
        } else if (fixedNum !== 1 && item.name.indexOf("B") > -1) {
          mobileData[i].splice(j, 1);
        }
      }
    }

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
      '    <div class="pro-img">',
      `      <img class="pro-img__src" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">`,
      "    </div>",
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

  function addCopyStyle(html) {
    return html + "\n<style> td{word-break: normal !important}</style>";
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
    setStatus("生成完成。line / lines 类名按原模板规则输出，没有额外替换。", "ok");
  });

  copyPcBtn.addEventListener("click", () => copyText(addCopyStyle(pcOutput.value), "PC HTML"));
  copyMobileBtn.addEventListener("click", () => copyText(addCopyStyle(mobileOutput.value), "Mobile HTML"));
})();
