(function () {
  const fileInput = document.getElementById("languageFilterFile");
  if (!fileInput) return;

  const rules = window.languageColumnFilterRules;
  const datasheetSelect = document.getElementById("languageFilterDatasheet");
  const specSelect = document.getElementById("languageFilterSpec");
  const datasheetButton = document.getElementById("languageFilterDownloadDatasheet");
  const specButton = document.getElementById("languageFilterDownloadSpec");
  const status = document.getElementById("languageFilterStatus");
  let sourceBuffer = null;
  let detected = null;

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ""}`;
  }

  function sheetHeaders(sheet) {
    const values = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = cell.text;
    });
    return values;
  }

  function findSheet(workbook, pattern, label) {
    const sheet = workbook.worksheets.find((item) => pattern.test(item.name));
    if (!sheet) throw new Error(`没有检测到 ${label} 工作表。`);
    return sheet;
  }

  function fillSelect(select, info) {
    select.innerHTML = "";
    info.blocks.forEach((block) => {
      const option = document.createElement("option");
      option.value = String(block.start);
      option.textContent = block.header;
      if (!rules.isEnglish(block.header)) select.appendChild(option);
    });
    if (!select.options.length) {
      const option = document.createElement("option");
      option.value = String(info.english.start);
      option.textContent = info.english.header;
      select.appendChild(option);
    }
    select.disabled = false;
  }

  function copySheet(source, target, keptColumns) {
    const columnMap = new Map(keptColumns.map((column, index) => [column + 1, index + 1]));
    const rowMap = new Map();
    let targetRowNumber = 0;
    keptColumns.forEach((sourceColumn, targetIndex) => {
      const sourceCol = source.getColumn(sourceColumn + 1);
      const targetCol = target.getColumn(targetIndex + 1);
      targetCol.width = sourceCol.width;
      targetCol.hidden = sourceCol.hidden;
      targetCol.outlineLevel = sourceCol.outlineLevel;
    });
    source.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
      const values = keptColumns.map((sourceColumn) => sourceRow.getCell(sourceColumn + 1).text);
      if (rules.isStatusRow(values)) {
        rowMap.set(rowNumber, null);
        return;
      }
      targetRowNumber += 1;
      rowMap.set(rowNumber, targetRowNumber);
      const targetRow = target.getRow(targetRowNumber);
      targetRow.height = sourceRow.height;
      targetRow.hidden = sourceRow.hidden;
      targetRow.outlineLevel = sourceRow.outlineLevel;
      keptColumns.forEach((sourceColumn, targetIndex) => {
        const sourceCell = sourceRow.getCell(sourceColumn + 1);
        const targetCell = targetRow.getCell(targetIndex + 1);
        targetCell.value = sourceCell.value;
        targetCell.style = structuredClone(sourceCell.style);
        if (sourceCell.note) targetCell.note = structuredClone(sourceCell.note);
      });
    });
    (source.model.merges || []).forEach((address) => {
      const match = String(address).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match) return;
      const start = source.getCell(`${match[1]}${match[2]}`).col;
      const end = source.getCell(`${match[3]}${match[4]}`).col;
      if (!columnMap.has(start) || !columnMap.has(end)) return;
      const mappedStart = rowMap.get(Number(match[2]));
      const mappedEnd = rowMap.get(Number(match[4]));
      if (!mappedStart || !mappedEnd) return;
      target.mergeCells(mappedStart, columnMap.get(start), mappedEnd, columnMap.get(end));
    });
    target.views = structuredClone(source.views || []);
    target.pageSetup = structuredClone(source.pageSetup || {});
    target.properties = structuredClone(source.properties || {});
  }

  function findBlock(info, start) {
    return info.blocks.find((item) => item.start === Number(start));
  }

  async function download(kind) {
    const workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(sourceBuffer.slice(0));
    const isDatasheet = kind === "datasheet";
    const sheet = findSheet(workbook, isDatasheet ? /datasheet/i : /^(spec|specification)/i, isDatasheet ? "Datasheet" : "Specification");
    const info = isDatasheet ? detected.datasheet : detected.specification;
    const select = isDatasheet ? datasheetSelect : specSelect;
    const target = findBlock(info, select.value);
    const columns = rules.selectedColumns(kind, info.english, target);
    const output = new window.ExcelJS.Workbook();
    output.creator = workbook.creator;
    output.modified = new Date();
    copySheet(sheet, output.addWorksheet(sheet.name), columns);
    const blob = new Blob([await output.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const base = fileInput.files[0].name.replace(/\.xlsx$/i, "");
    saveAs(blob, `${base}_${isDatasheet ? "Datasheet" : "Specification"}_${target.header}.xlsx`);
  }

  function saveAs(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name.replace(/[\\/:*?"<>|]/g, "_");
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  fileInput.addEventListener("change", async () => {
    datasheetButton.disabled = specButton.disabled = true;
    try {
      const file = fileInput.files[0];
      if (!file) return;
      sourceBuffer = await file.arrayBuffer();
      const workbook = new window.ExcelJS.Workbook();
      await workbook.xlsx.load(sourceBuffer.slice(0));
      const datasheet = findSheet(workbook, /datasheet/i, "Datasheet");
      const specification = findSheet(workbook, /^(spec|specification)/i, "Specification");
      detected = {
        datasheet: rules.detectLanguageBlocks(sheetHeaders(datasheet), "datasheet"),
        specification: rules.detectLanguageBlocks(sheetHeaders(specification), "specification")
      };
      fillSelect(datasheetSelect, detected.datasheet);
      fillSelect(specSelect, detected.specification);
      datasheetButton.disabled = specButton.disabled = false;
      setStatus(`已检测：Datasheet ${detected.datasheet.blocks.length} 种语言，Specification ${detected.specification.blocks.length} 种语言。`, "ok");
    } catch (error) {
      setStatus(error.message || String(error), "warn");
    }
  });

  datasheetButton.addEventListener("click", () => download("datasheet").catch((error) => setStatus(error.message, "warn")));
  specButton.addEventListener("click", () => download("specification").catch((error) => setStatus(error.message, "warn")));
})();
