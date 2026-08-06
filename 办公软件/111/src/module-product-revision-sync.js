/** 国际站产品修订内容同步到多个目标站点。 */
(function () {
  const serviceBase = window.location.origin;
  const operationSelect = document.getElementById("revisionSyncOperation");
  const sourceSiteSelect = document.getElementById("revisionSyncSourceSite");
  const sourceSiteLabel = document.getElementById("revisionSyncSourceSiteLabel");
  const productNameInput = document.getElementById("revisionSyncProductName");
  const excelInput = document.getElementById("revisionSyncExcel");
  const languageDatasheetInput = document.getElementById("revisionSyncLanguageDatasheet");
  const targetsElement = document.getElementById("revisionSyncTargets");
  const selectMatchedButton = document.getElementById("revisionSyncSelectMatched");
  const clearTargetsButton = document.getElementById("revisionSyncClearTargets");
  const selectedCountElement = document.getElementById("revisionSyncSelectedCount");
  const previewButton = document.getElementById("revisionSyncPreview");
  const submitButton = document.getElementById("revisionSyncSubmit");
  const statusElement = document.getElementById("revisionSyncStatus");
  const outputElement = document.getElementById("revisionSyncOutput");
  const folderInput = document.getElementById("revisionSyncFolder");
  const folderLabel = document.getElementById("revisionSyncFolderLabel");
  const folderGroup = document.getElementById("revisionSyncFolderGroup");
  const productNameLabel = document.getElementById("revisionSyncProductNameLabel");
  const excelLabel = document.getElementById("revisionSyncExcelLabel");
  const languageDatasheetLabel = document.getElementById("revisionSyncLanguageDatasheetLabel");
  const delistLabel = document.getElementById("revisionSyncDelistLabel");
  const delistProductsInput = document.getElementById("revisionSyncDelistProducts");
  const languageHelp = document.getElementById("revisionSyncLanguageHelp");
  const targetsHeading = document.getElementById("revisionSyncTargetsHeading");
  const targetsHelp = document.getElementById("revisionSyncTargetsHelp");
  if (!operationSelect || !sourceSiteSelect || !productNameInput || !excelInput || !languageDatasheetInput
    || !targetsElement
    || !selectMatchedButton || !clearTargetsButton || !selectedCountElement || !previewButton
    || !submitButton || !statusElement || !outputElement || !folderInput || !folderGroup
    || !folderLabel || !productNameLabel || !excelLabel || !languageDatasheetLabel
    || !delistLabel || !delistProductsInput || !sourceSiteLabel || !languageHelp
    || !targetsHeading || !targetsHelp) return;

  const languageNeedles = {
    hq: ["english"], us: ["english"], uk: ["english"], eu: ["english"],
    ca: ["english"], au: ["english"], in: ["english"], my: ["english"],
    af: ["english"], cis: ["russian", "русский"],
    de: ["german", "deutsch"], fr: ["france", "french", "français"],
    be: ["france", "french", "français"], it: ["italian", "italiano"],
    es: ["spanish-", "español"], pl: ["polish", "polski"],
    cz: ["czech", "český"], nl: ["dutch", "nederlands"],
    tr: ["turkish", "türkçe"], ro: ["romanian", "român"],
    th: ["thai", "ภาษาไทย"], vn: ["vietnamese", "tiếng việt"],
    jp: ["japanese", "日本語"], kr: ["korean", "한국어"],
    id: ["indonesian", "indonesia"],
    br: ["brazilian portuguese", "português - brazil"],
    la: ["spanish(latin)", "latinoamérica"],
    arg: ["spanish(latin)", "latinoamérica"],
    ar: ["arabic", "العربية"], sa: ["arabic", "العربية"],
    cn: ["繁体中文", "chinese"]
  };

  let sites = [];
  let specificationHeaders = [];
  let languagePackageHeaders = [];
  let validatedPreview = null;
  let validatedSignature = "";
  let batchProducts = [];
  const maxTargets = 50;

  const currentMode = () => operationSelect.value;
  const isBatchPublishing = () => currentMode() === "publish-batch";
  const isDelisting = () => currentMode() === "delist";

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function invalidatePreview() {
    validatedPreview = null;
    validatedSignature = "";
    submitButton.disabled = true;
  }

  function targetRows() {
    return [...targetsElement.querySelectorAll("tbody tr")];
  }

  function updateSelectedCount() {
    const rows = targetRows();
    const selected = rows.filter((row) =>
      row.querySelector(".revision-target-check")?.checked).length;
    selectedCountElement.textContent = `已选择 ${selected} 个站点（最多 ${maxTargets} 个）`;
    const checkAll = targetsElement.querySelector(".revision-target-check-all");
    if (checkAll) {
      checkAll.checked = Boolean(rows.length && selected === rows.length);
      checkAll.indeterminate = selected > 0 && selected < rows.length;
    }
  }

  function selectAllExecutableTargets() {
    let selected = 0;
    let executable = 0;
    targetRows().forEach((row) => {
      const language = row.querySelector(".revision-target-language");
      const packageLanguage = row.querySelector(".revision-target-package-language");
      const checkbox = row.querySelector(".revision-target-check");
      const canRun = isDelisting() || Boolean(language?.value && packageLanguage?.value);
      if (canRun) executable += 1;
      checkbox.checked = canRun && selected < maxTargets;
      if (checkbox.checked) selected += 1;
    });
    invalidatePreview();
    updateSelectedCount();
    setStatus(
      executable > maxTargets
        ? `已选择前 ${maxTargets} 个可执行站点；还有 ${executable - maxTargets} 个请分批执行。`
        : `已一键选择 ${selected} 个可执行站点，将在一次操作中批量处理。`,
      executable ? "ok" : "warn"
    );
  }

  function autoLanguageHeader(siteCode, headers) {
    const needles = languageNeedles[siteCode] || [siteCode];
    const matches = headers.filter((header) => {
      const value = header.toLowerCase();
      return needles.some((needle) => value.includes(String(needle).toLowerCase()));
    });
    return matches.length === 1 ? matches[0] : "";
  }

  function renderTargets() {
    invalidatePreview();
    const sourceCode = sourceSiteSelect.value;
    const targetSites = sites.filter((site) =>
      site.enabled !== false && (isDelisting() || isBatchPublishing() || site.siteCode !== sourceCode));
    if (!isDelisting() && (!specificationHeaders.length || !languagePackageHeaders.length)) {
      targetsElement.textContent = "上传 Specification Excel 和语言包 Datasheet 后显示站点与语言列。";
      updateSelectedCount();
      return;
    }
    if (isDelisting()) {
      targetsElement.innerHTML = [
        "<table>",
        '<thead><tr><th><input class="revision-target-check-all" type="checkbox" '
          + 'aria-label="全选目标站点"> 下架</th><th>目标站点</th></tr></thead>',
        "<tbody>",
        ...targetSites.map((site) => [
          `<tr data-site-code="${escapeHtml(site.siteCode)}">`,
          '<td><input class="revision-target-check" type="checkbox"></td>',
          `<td>${escapeHtml(site.name)} (${escapeHtml(site.siteCode)})</td>`,
          "</tr>"
        ].join("")),
        "</tbody></table>"
      ].join("");
      bindTargetEvents();
      return;
    }
    const specificationOptions = ['<option value="">请选择语言列</option>']
      .concat(specificationHeaders.map((header) =>
        `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`))
      .join("");
    const languagePackageOptions = ['<option value="">请选择译文列</option>']
      .concat(languagePackageHeaders.map((header) =>
        `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`))
      .join("");
    targetsElement.innerHTML = [
      "<table>",
      '<thead><tr><th><input class="revision-target-check-all" type="checkbox" '
        + 'aria-label="全选可执行目标站点"> 同步</th><th>目标站点</th>'
        + "<th>Specification 语言列</th><th>本站使用的 Datasheet 译文列</th></tr></thead>",
      "<tbody>",
      ...targetSites.map((site) => [
        `<tr data-site-code="${escapeHtml(site.siteCode)}">`,
        '<td><input class="revision-target-check" type="checkbox"></td>',
        `<td>${escapeHtml(site.name)} (${escapeHtml(site.siteCode)})</td>`,
        `<td><select class="revision-target-language">${specificationOptions}</select></td>`,
        `<td><select class="revision-target-package-language">${languagePackageOptions}</select></td>`,
        "</tr>"
      ].join("")),
      "</tbody></table>"
    ].join("");
    targetSites.forEach((site) => {
      const row = [...targetsElement.querySelectorAll("tbody tr")]
        .find((candidate) => candidate.dataset.siteCode === site.siteCode);
      const specificationMatched = autoLanguageHeader(
        site.siteCode,
        specificationHeaders
      );
      const packageMatched = autoLanguageHeader(site.siteCode, languagePackageHeaders);
      if (row && specificationMatched) {
        row.querySelector(".revision-target-language").value = specificationMatched;
      }
      if (row && packageMatched) {
        row.querySelector(".revision-target-package-language").value = packageMatched;
      }
    });
    bindTargetEvents();
  }

  function bindTargetEvents() {
    targetsElement.querySelectorAll("select").forEach((element) =>
      element.addEventListener("change", () => {
        invalidatePreview();
        updateSelectedCount();
      }));
    targetsElement.querySelectorAll(".revision-target-check").forEach((checkbox) =>
      checkbox.addEventListener("change", () => {
        const selected = targetRows().filter((row) =>
          row.querySelector(".revision-target-check")?.checked).length;
        if (selected > maxTargets) {
          checkbox.checked = false;
          setStatus(`一次最多选择 ${maxTargets} 个目标站点，请分批执行。`, "warn");
        }
        invalidatePreview();
        updateSelectedCount();
      }));
    const checkAll = targetsElement.querySelector(".revision-target-check-all");
    checkAll?.addEventListener("change", () => {
      if (checkAll.checked) {
        selectAllExecutableTargets();
      } else {
        targetRows().forEach((row) => {
          row.querySelector(".revision-target-check").checked = false;
        });
        invalidatePreview();
        updateSelectedCount();
        setStatus("已清空目标站点。");
      }
    });
    updateSelectedCount();
  }

  async function parseExcel(file) {
    if (!file) {
      specificationHeaders = [];
      renderTargets();
      return;
    }
    if (!window.XLSX) throw new Error("Excel 解析库尚未加载，请刷新页面后重试。");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet?.["!ref"]) throw new Error("Specification Excel 的第一个工作表为空。");
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    specificationHeaders = [];
    for (let column = range.s.c; column <= range.e.c; column += 2) {
      const first = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
      const second = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column + 1 })];
      const header = String(first?.w ?? first?.v ?? second?.w ?? second?.v ?? "").trim();
      if (header) specificationHeaders.push(header);
    }
    if (!specificationHeaders.length) {
      throw new Error("没有识别到语言列；每种语言应占相邻两列。");
    }
    renderTargets();
  }

  async function parseLanguageDatasheet(file) {
    if (!file) {
      languagePackageHeaders = [];
      renderTargets();
      return;
    }
    if (!window.XLSX) throw new Error("Excel 解析库尚未加载，请刷新页面后重试。");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet?.["!ref"]) throw new Error("语言包 Datasheet 的第一个工作表为空。");
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    if (range.e.c < range.s.c + 2) {
      throw new Error("语言包 Datasheet 至少需要字段名、原文和一种译文三列。");
    }
    languagePackageHeaders = [];
    for (let column = range.s.c + 2; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
      const header = String(cell?.w ?? cell?.v ?? "").trim();
      if (header) languagePackageHeaders.push(header);
    }
    if (!languagePackageHeaders.length) {
      throw new Error("语言包 Datasheet 中没有识别到译文列。");
    }
    renderTargets();
  }

  async function workbookHeaders(file, kind) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet?.["!ref"]) throw new Error(`${file.webkitRelativePath || file.name} 的工作表为空。`);
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headers = [];
    if (kind === "specification") {
      for (let column = range.s.c; column <= range.e.c; column += 2) {
        const first = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
        const second = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column + 1 })];
        const header = String(first?.w ?? first?.v ?? second?.w ?? second?.v ?? "").trim();
        if (header) headers.push(header);
      }
    } else {
      for (let column = range.s.c + 2; column <= range.e.c; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
        const header = String(cell?.w ?? cell?.v ?? "").trim();
        if (header) headers.push(header);
      }
    }
    return headers;
  }

  function batchFileKind(file) {
    const name = file.name.toLowerCase();
    if (!/\.xlsx?$/.test(name)) return "";
    if (/specifications?|(?:^|[\s_-])spec(?:[\s_.-]|$)/i.test(name)) return "specification";
    if (/datasheet/i.test(name)) return "datasheet";
    return "";
  }

  function batchProductName(file) {
    const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length > 2) return segments[segments.length - 2].trim();
    return file.name.replace(/\.[^.]+$/, "")
      .replace(/\b(?:product[\s_-]*)?datasheet\b/ig, "")
      .replace(/\b(?:product[\s_-]*)?specifications?\b/ig, "")
      .replace(/(?:^|[\s_-])spec(?:[\s_-]|$)/ig, " ")
      .replace(/[\s_-]+$/g, "").trim();
  }

  async function parseBatchFolder() {
    if (!window.XLSX) throw new Error("Excel 解析库尚未加载，请刷新页面后重试。");
    const groups = new Map();
    [...folderInput.files].forEach((file) => {
      const kind = batchFileKind(file);
      if (!kind) return;
      const productName = batchProductName(file);
      if (!productName) return;
      const key = productName.toLowerCase();
      const group = groups.get(key) || { productName, files: {} };
      if (group.files[kind]) throw new Error(`${productName} 存在多份 ${kind} 文件。`);
      group.files[kind] = file;
      groups.set(key, group);
    });
    batchProducts = [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName));
    if (!batchProducts.length) throw new Error("文件夹中没有识别到产品 Excel。");
    if (batchProducts.length > 20) throw new Error("一次最多上架 20 个产品，请分批执行。");
    batchProducts.forEach((product) => {
      if (!product.files.specification || !product.files.datasheet) {
        throw new Error(`${product.productName} 必须同时包含 Datasheet 和 Specifications Excel。`);
      }
    });
    const specHeaderSets = [];
    const datasheetHeaderSets = [];
    for (const product of batchProducts) {
      specHeaderSets.push(await workbookHeaders(product.files.specification, "specification"));
      datasheetHeaderSets.push(await workbookHeaders(product.files.datasheet, "datasheet"));
    }
    specificationHeaders = specHeaderSets[0].filter((header) =>
      specHeaderSets.every((headers) => headers.includes(header)));
    languagePackageHeaders = datasheetHeaderSets[0].filter((header) =>
      datasheetHeaderSets.every((headers) => headers.includes(header)));
    if (!specificationHeaders.length || !languagePackageHeaders.length) {
      throw new Error("多个产品的 Excel 没有共同语言列，请统一语言列后重试。");
    }
    renderTargets();
  }

  function selectedTargets() {
    return [...targetsElement.querySelectorAll("tbody tr")]
      .filter((row) => row.querySelector(".revision-target-check")?.checked)
      .map((row) => {
        const siteCode = row.dataset.siteCode;
        const localeHeader = row.querySelector(".revision-target-language")?.value || "";
        const languagePackageHeader = row.querySelector(
          ".revision-target-package-language"
        )?.value || "";
        if (!isDelisting() && !localeHeader) throw new Error(`${siteCode} 尚未选择 Excel 语言列。`);
        if (!isDelisting() && !languagePackageHeader) {
          throw new Error(`${siteCode} 尚未选择语言包 Datasheet 译文列。`);
        }
        return { siteCode, localeHeader, languagePackageHeader };
      });
  }

  function inputSignature(targets) {
    const file = excelInput.files?.[0];
    const languageDatasheet = languageDatasheetInput.files?.[0];
    return JSON.stringify({
      operation: operationSelect.value,
      sourceSiteCode: sourceSiteSelect.value,
      productName: productNameInput.value.trim(),
      delistProducts: delistProductsInput.value.trim(),
      file: file ? [file.name, file.size, file.lastModified] : null,
      languageDatasheet: languageDatasheet
        ? [languageDatasheet.name, languageDatasheet.size, languageDatasheet.lastModified]
        : null,
      folder: batchProducts.map((product) => [
        product.productName,
        product.files.specification.name,
        product.files.specification.size,
        product.files.specification.lastModified,
        product.files.datasheet.name,
        product.files.datasheet.size,
        product.files.datasheet.lastModified
      ]),
      targets
    });
  }

  function buildForm(extra) {
    const targets = selectedTargets();
    if (!targets.length) throw new Error("请至少勾选一个目标站点。");
    const form = new FormData();
    form.append("sourceSiteCode", sourceSiteSelect.value || "hq");
    form.append("targetsJson", JSON.stringify(targets));
    if (isBatchPublishing()) {
      if (!batchProducts.length) throw new Error("请选择并解析待上架产品文件夹。");
      const manifest = [];
      let index = 0;
      batchProducts.forEach((product) => {
        [product.files.specification, product.files.datasheet].forEach((file) => {
          const uploadName = `${String(index).padStart(4, "0")}__${file.name}`;
          form.append("productFiles", file, uploadName);
          manifest.push({ uploadName, relativePath: file.webkitRelativePath || file.name });
          index += 1;
        });
      });
      form.append("batchManifest", JSON.stringify(manifest));
    } else if (isDelisting()) {
      const productNames = delistProductsInput.value.trim();
      if (!productNames) throw new Error("请填写需要下架的产品名称。");
      form.append("productNames", productNames);
    } else {
    const file = excelInput.files?.[0];
    const languageDatasheet = languageDatasheetInput.files?.[0];
    if (!file) throw new Error("请上传 Specification 翻译 Excel。");
    if (!languageDatasheet) throw new Error("请上传语言包 Datasheet。");
    const productName = productNameInput.value.trim();
    if (!productName) throw new Error("请填写产品名称。");
    form.append("specExcel", file);
    form.append("languageDatasheet", languageDatasheet);
    form.append("productName", productName);
    }
    Object.entries(extra || {}).forEach(([key, value]) => form.append(key, value));
    return { form, targets, signature: inputSignature(targets) };
  }

  async function postForm(path, form) {
    const response = await fetch(serviceBase + path, { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
      error.logs = data.logs || [];
      throw error;
    }
    return data;
  }

  function renderPreview(data) {
    const result = data.result;
    const publishing = result.mode === "product-publishing-preview";
    const lines = [
      publishing ? "产品上架预览（尚未复制或保存）" : "产品修订同步预览（尚未保存）",
      `产品：${result.productName}`,
      ...(publishing ? [
        "复制源：逐目标站从本站国际产品列表读取，不登录国际站账号"
      ] : [
        `源站点：${result.source.site.name} (${result.source.site.siteCode})`,
        `源站 Goods ID：${result.source.goodsId}`,
        `源 Detail：${result.source.overviewLength} 字符`,
        `源 Specification：${result.source.specificationLength} 字符`,
        `自动继承图片：${result.source.image.src}`,
        `图片 alt：${result.source.image.alt || "（空）"}`
      ]),
      `Excel 工作表：${result.workbook.sheetName}`,
      `语言包 Datasheet：${result.languageDatasheet.sheetName}，`
        + `${result.languageDatasheet.fieldCount} 个字段`,
      `目标站点：${result.targetCount}，待更新：${result.readyCount}，`
        + `无需更新：${result.noChangeCount}，失败：${result.failedCount}`,
      "",
      "逐站点结果："
    ];
    result.results.forEach((item) => {
      if (item.status === "failed") {
        lines.push(`- 失败 | ${item.site.name} (${item.site.siteCode}) | ${item.error}`);
        if (item.languagePackage?.missing?.length) {
          lines.push(
            "  · 语言包缺少字段：" + item.languagePackage.missing
              .map((entry) => entry.key).join("、")
          );
        }
        if (item.languagePackage?.sourceMismatches?.length) {
          lines.push(
            "  · 语言包原文不一致：" + item.languagePackage.sourceMismatches
              .map((entry) => entry.key).join("、")
          );
        }
        return;
      }
      if (publishing && item.copySource) {
        lines.push(
          `- 待上架 | ${item.site.name} (${item.site.siteCode}) | `
          + `国际站类目 ${item.copySource.category.text} | Goods ID ${item.copySource.goodsId}`
        );
        lines.push(
          `  · 复制源 Detail：${item.copySource.overviewLength} 字符；`
          + `Specification：${item.copySource.specificationLength} 字符；`
          + `图片：${item.copySource.image?.src || "无图"}`
        );
      }
      lines.push(
        `- ${item.status === "ready" ? "待更新" : "无需更新"} | `
        + `${item.site.name} (${item.site.siteCode}) | ${item.localeHeader}`
      );
      lines.push(
        `  · Detail：${item.detailChanged ? "将替换" : "相同"} `
        + `(${item.currentOverviewLength} → ${item.desiredOverviewLength} 字符)`
      );
      lines.push(
        `  · Specification：${item.specificationChanged ? "将替换" : "相同"} `
        + `(${item.currentSpecificationLength} → ${item.desiredSpecificationLength} 字符)`
      );
      lines.push(
        `  · Product Description：${item.descriptionChanged ? "将更新" : "相同"} `
        + `| ${item.productDescriptionHeader || ""} | ${item.desiredProductDescription || ""}`
      );
      if (item.languagePackage) {
        lines.push(
          `  · 语言包：${item.languagePackage.changedCellCount
            ? `将更新 ${item.languagePackage.changedCellCount} 个单元格`
            : "相同"} | ${item.languagePackage.translationHeader} | `
          + `匹配字段 ${item.languagePackage.matchedFieldCount}，`
          + `空译文跳过 ${item.languagePackage.skippedBlankCount}`
        );
        if (item.languagePackage.missing?.length) {
          lines.push(
            "    缺少字段：" + item.languagePackage.missing
              .map((entry) => entry.key).join("、")
          );
        }
        if (item.languagePackage.sourceMismatches?.length) {
          lines.push(
            "    原文不一致：" + item.languagePackage.sourceMismatches
              .map((entry) => entry.key).join("、")
          );
        }
      }
    });
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    outputElement.value = lines.join("\n");
  }

  function renderSubmit(data) {
    const result = data.result;
    const publishing = result.mode === "product-publishing-submit";
    const lines = [
      publishing ? "产品上架执行结果" : "产品修订同步执行结果",
      `产品：${result.productName}`,
      `源站点：${result.sourceSite.name} (${result.sourceSite.siteCode})`,
      `目标：${result.targetCount}，成功：${result.completedCount}，`
        + `无需更新：${result.noChangeCount}，失败：${result.failedCount}`,
      "",
      "逐站点结果："
    ];
    result.results.forEach((item) => {
      if (item.status === "completed") {
        lines.push(
          `- 成功并回读通过 | ${item.site.name} (${item.site.siteCode}) `
          + `| ${item.localeHeader} | Goods ID ${item.goodsId}`
        );
        lines.push(
          `  · 复制：${item.components?.copy || "未知"}；`
          + `Detail：${item.components?.detail || "未知"}；`
          + `Specification：${item.components?.specification || "未知"}；`
          + `Product Description：${item.components?.description || "未知"}；`
          + `语言包：${item.components?.languagePackage || "未知"}`
        );
      } else if (item.status === "no-change") {
        lines.push(`- 跳过（内容相同）| ${item.site.name} (${item.site.siteCode})`);
      } else {
        lines.push(`- 失败 | ${item.site.name} (${item.site.siteCode}) | ${item.error}`);
      }
    });
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    outputElement.value = lines.join("\n");
  }

  function renderBatchPreview(data) {
    const result = data.result;
    const lines = [
      "批量产品上架预览（尚未复制或保存）",
      `产品：${result.productCount}，可执行：${result.readyCount}，部分失败：${result.partialCount}，失败：${result.failedCount}`,
      ""
    ];
    result.results.forEach((item) => {
      lines.push(`- ${item.productName} | ${item.status}`);
      if (item.error) lines.push(`  · ${item.error}`);
      if (item.result) {
        lines.push(`  · 目标站点 ${item.result.targetCount}，待上架 ${item.result.readyCount}，失败 ${item.result.failedCount}`);
        item.result.results.forEach((siteResult) => {
          lines.push(
            `    - ${siteResult.site.name} (${siteResult.site.siteCode}) | ${siteResult.status}`
            + (siteResult.error ? ` | ${siteResult.error}` : "")
          );
          if (siteResult.desiredProductDescription) {
            lines.push(`      Product Description：${siteResult.desiredProductDescription}`);
          }
        });
      }
    });
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    outputElement.value = lines.join("\n");
  }

  function renderBatchSubmit(data) {
    const result = data.result;
    const lines = [
      "批量产品上架执行结果",
      `产品：${result.productCount}，完成：${result.completedCount}，部分失败：${result.partialCount}，失败：${result.failedCount}`,
      ""
    ];
    result.results.forEach((item) => {
      lines.push(`- ${item.productName} | ${item.status}${item.error ? ` | ${item.error}` : ""}`);
      item.result?.results?.forEach((siteResult) => {
        lines.push(`  - ${siteResult.site.name} (${siteResult.site.siteCode}) | ${siteResult.status}`
          + (siteResult.error ? ` | ${siteResult.error}` : ""));
      });
    });
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    outputElement.value = lines.join("\n");
  }

  function renderDelisting(data) {
    const result = data.result;
    const preview = result.mode === "product-delisting-preview";
    const lines = [
      preview ? "产品下架预览（尚未保存）" : "产品下架执行结果",
      `产品 ${result.productCount} 个 × 站点 ${result.siteCount} 个 = ${result.operationCount} 项`,
      preview
        ? `待下架 ${result.readyCount}，无需修改 ${result.noChangeCount}，失败 ${result.failedCount}`
        : `完成 ${result.completedCount}，无需修改 ${result.noChangeCount}，失败 ${result.failedCount}`,
      "",
      "目标状态：Searchable = false；Type of listing = No Set Uptime (whenType = 0)"
    ];
    result.results.forEach((item) => lines.push(
      `- ${item.productName} | ${item.site.name} (${item.site.siteCode}) | ${item.status}`
      + (item.error ? ` | ${item.error}` : "")
    ));
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    outputElement.value = lines.join("\n");
  }

  async function loadSites() {
    sourceSiteSelect.disabled = true;
    try {
      const response = await fetch(serviceBase + "/api/campaign/sites");
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "站点加载失败");
      sites = (data.sites || []).filter((site) => site.enabled !== false);
      sourceSiteSelect.innerHTML = sites.map((site) =>
        `<option value="${escapeHtml(site.siteCode)}">${escapeHtml(site.name)} (${escapeHtml(site.siteCode)})</option>`
      ).join("");
      if (sites.some((site) => site.siteCode === "hq")) sourceSiteSelect.value = "hq";
      renderTargets();
      setStatus(`已加载 ${sites.length} 个站点。请填写产品并上传两份 Excel。`, "ok");
    } catch (error) {
      sourceSiteSelect.innerHTML = '<option value="">站点加载失败</option>';
      setStatus("站点加载失败：" + (error.message || error), "warn");
    } finally {
      sourceSiteSelect.disabled = false;
    }
  }

  sourceSiteSelect.addEventListener("change", renderTargets);
  function updateModeUi() {
    invalidatePreview();
    const batch = isBatchPublishing();
    const delist = isDelisting();
    folderLabel.hidden = !batch;
    folderGroup.hidden = !batch;
    productNameLabel.hidden = batch || delist;
    productNameInput.hidden = batch || delist;
    excelLabel.hidden = batch || delist;
    excelInput.hidden = batch || delist;
    languageDatasheetLabel.hidden = batch || delist;
    languageDatasheetInput.hidden = batch || delist;
    delistLabel.hidden = !delist;
    delistProductsInput.hidden = !delist;
    sourceSiteLabel.hidden = delist || batch;
    sourceSiteSelect.hidden = delist || batch;
    languageHelp.hidden = delist;
    targetsHeading.textContent = delist ? "下架目标站点" : "目标站点与两份 Excel 的语言列";
    targetsHelp.textContent = delist
      ? "选择需要执行下架的国家站点；每个产品、每个站点都会独立预览、保存和回读。"
      : "每一行都是独立映射：目标站点 → Specification 语言列 → 本站使用的 Datasheet 译文列。系统会自动匹配，执行前可逐站核对。";
    previewButton.textContent = batch
      ? "预览批量上架（不复制）"
      : delist ? "预览下架（不保存）" : "预览同步（不保存）";
    submitButton.textContent = batch
      ? "确认并批量上架"
      : delist ? "确认并执行下架" : "确认并执行同步";
    renderTargets();
    setStatus(batch
      ? "批量上架模式：选择资料文件夹，预览确认后逐产品、逐站点执行。"
      : delist
        ? "下架模式：只关闭 Searchable，并将 Type of listing 设为 No Set Uptime。"
        : "修订模式：只修改目标站点已经存在的产品。");
  }
  operationSelect.addEventListener("change", updateModeUi);
  productNameInput.addEventListener("input", invalidatePreview);
  delistProductsInput.addEventListener("input", invalidatePreview);
  folderInput.addEventListener("change", async () => {
    invalidatePreview();
    try {
      await parseBatchFolder();
      setStatus(`已识别 ${batchProducts.length} 个产品及共同语言列，请选择目标站点。`, "ok");
    } catch (error) {
      batchProducts = [];
      specificationHeaders = [];
      languagePackageHeaders = [];
      renderTargets();
      setStatus("产品文件夹解析失败：" + (error.message || error), "warn");
    }
  });
  excelInput.addEventListener("change", async () => {
    invalidatePreview();
    try {
      await parseExcel(excelInput.files?.[0]);
      setStatus(`已识别 ${specificationHeaders.length} 个 Specification 语言列。`, "ok");
    } catch (error) {
      specificationHeaders = [];
      renderTargets();
      setStatus("Excel 解析失败：" + (error.message || error), "warn");
    }
  });
  languageDatasheetInput.addEventListener("change", async () => {
    invalidatePreview();
    try {
      await parseLanguageDatasheet(languageDatasheetInput.files?.[0]);
      setStatus(`已识别 ${languagePackageHeaders.length} 个语言包译文列。`, "ok");
    } catch (error) {
      languagePackageHeaders = [];
      renderTargets();
      setStatus("语言包 Datasheet 解析失败：" + (error.message || error), "warn");
    }
  });

  selectMatchedButton.addEventListener("click", () => {
    selectAllExecutableTargets();
  });

  clearTargetsButton.addEventListener("click", () => {
    targetsElement.querySelectorAll(".revision-target-check").forEach((checkbox) => {
      checkbox.checked = false;
    });
    invalidatePreview();
    updateSelectedCount();
    setStatus("已清空目标站点。");
  });

  previewButton.addEventListener("click", async () => {
    invalidatePreview();
    previewButton.disabled = true;
    try {
      const request = buildForm();
      setStatus("正在执行只读预览，不会复制或保存产品...");
      const endpoint = isBatchPublishing()
        ? "/api/product-publishing/batch-preview"
        : isDelisting() ? "/api/product-delisting/preview" : "/api/product-revision-sync/preview";
      const data = await postForm(endpoint, request.form);
      if (isBatchPublishing()) renderBatchPreview(data);
      else if (isDelisting()) renderDelisting(data);
      else renderPreview(data);
      validatedPreview = data.result;
      validatedSignature = request.signature;
      submitButton.disabled = !data.result.readyCount;
      setStatus(`预览完成：待执行 ${data.result.readyCount}，失败 ${data.result.failedCount}。`,
        data.result.failedCount ? "warn" : "ok");
    } catch (error) {
      outputElement.value = ["预览失败：" + (error.message || error), ...(error.logs || [])].join("\n");
      setStatus("预览失败：" + (error.message || error), "warn");
    } finally {
      previewButton.disabled = false;
    }
  });

  submitButton.addEventListener("click", async () => {
    let request;
    try {
      let extra = {};
      if (isBatchPublishing()) {
        extra.expectedBatchPreviews = JSON.stringify(Object.fromEntries(
          (validatedPreview?.results || [])
            .filter((item) => item.result && ["ready", "partial"].includes(item.status))
            .map((item) => [item.productName, item.result])
        ));
      } else if (isDelisting()) {
        extra.expectedFingerprints = JSON.stringify(Object.fromEntries(
          (validatedPreview?.results || [])
            .filter((item) => item.before?.fingerprint)
            .map((item) => [
              `${item.site.siteCode}\n${item.productName.toLowerCase()}`,
              item.before.fingerprint
            ])
        ));
      } else {
        extra = {
          expectedSourceFingerprint: validatedPreview?.source?.fingerprint || "",
          expectedCopySourceFingerprints: JSON.stringify(Object.fromEntries(
            (validatedPreview?.results || [])
              .filter((item) => item.copySource?.sourceFingerprint)
              .map((item) => [item.site.siteCode, item.copySource.sourceFingerprint])
          )),
          expectedWorkbookFingerprint: validatedPreview?.workbook?.fingerprint || "",
          expectedLanguageDatasheetFingerprint:
            validatedPreview?.languageDatasheet?.fingerprint || "",
          expectedLanguagePackageFingerprints: JSON.stringify(Object.fromEntries(
            (validatedPreview?.results || [])
              .filter((item) => item.languagePackage?.sourceFingerprint)
              .map((item) => [item.site.siteCode, item.languagePackage.sourceFingerprint])
          ))
        };
      }
      request = buildForm(extra);
    } catch (error) {
      setStatus(error.message || error, "warn");
      return;
    }
    if (!validatedPreview || request.signature !== validatedSignature) {
      invalidatePreview();
      setStatus("产品、Excel、Datasheet 或目标站点已变化，请重新预览。", "warn");
      return;
    }
    const confirmed = window.confirm(isBatchPublishing()
      ? `将批量上架 ${validatedPreview.productCount} 个产品，逐站复制并同步 Product Description、Detail、Specification 和语言包。确认继续？`
      : isDelisting()
        ? `将执行 ${validatedPreview.readyCount} 项下架：取消 Searchable，并把 Type of listing 改为 No Set Uptime。确认继续？`
        : `将把 ${validatedPreview.source.site.name} 的产品 ${validatedPreview.productName} 同步到 ${validatedPreview.readyCount} 个目标站点。确认继续？`);
    if (!confirmed) return;

    previewButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在逐产品、逐站点执行并回读验证，请勿关闭页面...");
    try {
      const endpoint = isBatchPublishing()
        ? "/api/product-publishing/batch-submit"
        : isDelisting() ? "/api/product-delisting/submit" : "/api/product-revision-sync/submit";
      const data = await postForm(endpoint, request.form);
      if (isBatchPublishing()) renderBatchSubmit(data);
      else if (isDelisting()) renderDelisting(data);
      else renderSubmit(data);
      setStatus(`执行完成：失败 ${data.result.failedCount}。`,
        data.result.failedCount ? "warn" : "ok");
      invalidatePreview();
    } catch (error) {
      outputElement.value = ["执行失败：" + (error.message || error), ...(error.logs || [])].join("\n");
      setStatus("执行失败：" + (error.message || error), "warn");
    } finally {
      previewButton.disabled = false;
    }
  });

  updateModeUi();
  loadSites();
})();
