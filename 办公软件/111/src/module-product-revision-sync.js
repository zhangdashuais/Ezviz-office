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
  const europeDriveCheckbox = document.getElementById("revisionSyncEuropeDrive");
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
  const syncHeading = document.getElementById("revisionSyncHeading");
  const syncDescription = document.getElementById("revisionSyncDescription");
  const operationLabel = document.getElementById("revisionSyncOperationLabel");
  const revisionModeTabs = document.getElementById("revisionModeTabs");
  const sameProductTab = document.getElementById("revisionSameProductTab");
  const commonPartTab = document.getElementById("revisionCommonPartTab");
  const sameProductPanel = document.getElementById("revisionSameProductPanel");
  const commonPartPanel = document.getElementById("revisionCommonPartPanel");
  const mainCard = document.getElementById("revisionSyncMainCard");
  const targetsCard = document.getElementById("revisionSyncTargetsCard");
  const resultCard = document.getElementById("revisionSyncResultCard");
  if (!operationSelect || !sourceSiteSelect || !productNameInput || !excelInput || !languageDatasheetInput
    || !targetsElement
    || !selectMatchedButton || !clearTargetsButton || !selectedCountElement || !previewButton
    || !submitButton || !statusElement || !outputElement || !folderInput || !europeDriveCheckbox || !folderGroup
    || !folderLabel || !productNameLabel || !excelLabel || !languageDatasheetLabel
    || !delistLabel || !delistProductsInput || !sourceSiteLabel || !languageHelp
    || !targetsHeading || !targetsHelp || !revisionModeTabs || !sameProductTab || !commonPartTab
    || !sameProductPanel || !commonPartPanel || !syncHeading || !syncDescription || !operationLabel
    || !mainCard || !targetsCard || !resultCard) return;

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
  const isSpecificationLanguageOnly = () => currentMode() === "specification-language";
  const isCommonRevision = () => currentMode() === "common";
  const usesSourceSite = () => currentMode() === "revision";

  function showRevisionPanel(panel) {
    const common = panel === "common";
    sameProductPanel.hidden = false;
    commonPartPanel.hidden = !common;
    sameProductTab.setAttribute("aria-selected", String(!common));
    commonPartTab.setAttribute("aria-selected", String(common));
  }

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
    if (isCommonRevision()) {
      targetsElement.textContent = "多产品相同内容修订使用下方独立表单选择站点。";
      updateSelectedCount();
      return;
    }
    const sourceCode = sourceSiteSelect.value;
    const targetSites = sites.filter((site) =>
      site.enabled !== false && (!usesSourceSite() || site.siteCode !== sourceCode));
    if (!isBatchPublishing() && !isDelisting()
      && (!specificationHeaders.length || !languagePackageHeaders.length)) {
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
    specificationHeaders = file ? await workbookHeaders(file, "specification") : [];
    if (!specificationHeaders.length) {
      if (file) throw new Error("没有识别到语言列；每种语言应占相邻两列。");
    }
    renderTargets();
  }

  async function parseLanguageDatasheet(file) {
    languagePackageHeaders = file ? await workbookHeaders(file, "datasheet") : [];
    if (!languagePackageHeaders.length) {
      if (file) throw new Error("语言包 Datasheet 中没有识别到译文列。");
    }
    renderTargets();
  }

  async function workbookHeaders(file, kind) {
    if (!window.XLSX) throw new Error("Excel 解析库尚未加载，请刷新页面后重试。");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet?.["!ref"]) throw new Error(`${file.webkitRelativePath || file.name} 的工作表为空。`);
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    if (kind === "datasheet" && range.e.c < range.s.c + 2) {
      throw new Error("语言包 Datasheet 至少需要字段名、原文和一种译文三列。");
    }
    const headers = [];
    const specification = kind === "specification";
    for (let column = range.s.c + (specification ? 0 : 2);
      column <= range.e.c; column += specification ? 2 : 1) {
      const cells = [column, ...(specification ? [column + 1] : [])]
        .map((c) => sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]);
      const cell = cells.find((item) => item?.w != null || item?.v != null);
      const header = String(cell?.w ?? cell?.v ?? "").trim();
      if (header) headers.push(header);
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

  function productNameMatchKey(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u207a＋]/g, "+")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  async function splitEuropeDriveWorkbook(file, productName) {
    if (!window.ExcelJS) throw new Error("Excel 拆分库尚未加载，请刷新页面后重试。");
    const workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheets = [
      ["datasheet", /datasheet/i, "Datasheet"],
      ["specification", /^(spec|specification)/i, "Specifications"]
    ];
    const split = {};
    for (const [kind, pattern, suffix] of sheets) {
      const sourceSheet = workbook.worksheets.find((sheet) => pattern.test(sheet.name));
      if (!sourceSheet) throw new Error(`${file.name} 没有检测到 ${suffix} 工作表。`);
      const output = new window.ExcelJS.Workbook();
      await output.xlsx.load(await file.arrayBuffer());
      output.worksheets
        .filter((sheet) => sheet.name !== sourceSheet.name)
        .forEach((sheet) => output.removeWorksheet(sheet.id));
      split[kind] = new File(
        [await output.xlsx.writeBuffer()],
        `${productName} ${suffix}.xlsx`,
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      );
    }
    return split;
  }

  async function isCombinedPublishingWorkbook(file) {
    if (!/\.xlsx$/i.test(file.name)) return false;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: true });
    return window.productPublishingInputRules.hasCombinedPublishingSheets(workbook.SheetNames);
  }

  async function parseBatchFolder() {
    if (!window.XLSX) throw new Error("Excel 解析库尚未加载，请刷新页面后重试。");
    const groups = new Map();
    const files = [...folderInput.files];
    for (const file of files) {
      if (!/\.xlsx?$/i.test(file.name)) continue;
      if (await isCombinedPublishingWorkbook(file)) {
        const productName = window.productPublishingInputRules
          .productNameFromCombinedWorkbook(file.name);
        if (!productName) throw new Error(`无法从文件名识别产品名称：${file.name}`);
        const key = productNameMatchKey(productName);
        if (groups.has(key)) throw new Error(`${productName} 存在多份欧洲云盘翻译表。`);
        groups.set(key, { productName, files: await splitEuropeDriveWorkbook(file, productName) });
        continue;
      }
      const kind = batchFileKind(file);
      if (!kind) continue;
      const productName = batchProductName(file);
      if (!productName) continue;
      const key = productNameMatchKey(productName);
      const group = groups.get(key) || { productName, files: {} };
      if (group.files[kind]) throw new Error(`${productName} 存在多份 ${kind} 文件。`);
      group.files[kind] = file;
      groups.set(key, group);
    }
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
      combinedWorkbookDetection: true,
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
    if (isSpecificationLanguageOnly()) form.append("updateScope", "specification-language");
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

  function productEndpoint(action) {
    if (isBatchPublishing()) return `/api/product-publishing/batch-${action}`;
    if (isDelisting()) return `/api/product-delisting/${action}`;
    return `/api/product-revision-sync/${action}`;
  }

  function renderProductResult(data, submitting) {
    if (isBatchPublishing()) return submitting ? renderBatchSubmit(data) : renderBatchPreview(data);
    if (isDelisting()) return renderDelisting(data);
    return submitting ? renderSubmit(data) : renderPreview(data);
  }

  function showRequestError(prefix, error) {
    const message = error.message || error;
    outputElement.value = [`${prefix}失败：${message}`, ...(error.logs || [])].join("\n");
    setStatus(`${prefix}失败：${message}`, "warn");
  }

  function showLines(lines, data) {
    if (data.logs?.length) lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    outputElement.value = lines.join("\n");
  }

  function renderPreview(data) {
    const result = data.result;
    const publishing = result.mode === "product-publishing-preview";
    const languageOnly = !publishing && !result.source;
    const lines = [
      publishing
        ? "产品上架预览（尚未复制或保存）"
        : languageOnly
          ? "只改语言包 / Specification 文案预览（尚未保存）"
          : "产品修订同步预览（尚未保存）",
      `产品：${result.productName}`,
      ...(publishing ? [
        "复制源：逐目标站从本站国际产品列表读取，不登录国际站账号"
      ] : languageOnly ? [
        "源站点：不使用源站；保留目标站当前 Overview 和规格图"
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
      if (publishing && item.targetProductName && item.targetProductName !== result.productName) {
        lines.push(`  · 日本站上架名称：${result.productName} → ${item.targetProductName}`);
      }
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
        (item.languagePackage.warnings || []).slice(0, 5).forEach((warning) => {
          lines.push(`    警告：${warning.message}`);
        });
      }
      (item.warnings || []).slice(0, 5).forEach((warning) => {
        lines.push(`  · 警告：${warning.message}`);
      });
    });
    showLines(lines, data);
  }

  function renderSubmit(data) {
    const result = data.result;
    const publishing = result.mode === "product-publishing-submit";
    const languageOnly = !publishing && !result.sourceSite;
    const lines = [
      publishing
        ? "产品上架执行结果"
        : languageOnly
          ? "只改语言包 / Specification 文案执行结果"
          : "产品修订同步执行结果",
      `产品：${result.productName}`,
      languageOnly
        ? "源站点：不使用源站"
        : `源站点：${result.sourceSite.name} (${result.sourceSite.siteCode})`,
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
        if (publishing && item.targetProductName && item.targetProductName !== result.productName) {
          lines.push(`  · 日本站产品名称：${item.targetProductName}`);
        }
        (item.warnings || []).slice(0, 5).forEach((warning) => {
          lines.push(`  · 警告：${warning.message}`);
        });
        lines.push(
          `  · 复制：${item.components?.copy || "未知"}；`
          + `产品名称：${item.components?.productName || "未知"}；`
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
    showLines(lines, data);
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
        lines.push(`  · 目标站点 ${item.result.targetCount}，待执行 ${item.result.readyCount}，失败 ${item.result.failedCount}`);
        item.result.results.forEach((siteResult) => {
          lines.push(
            `    - ${siteResult.site.name} (${siteResult.site.siteCode}) | ${siteResult.status}`
            + (siteResult.error ? ` | ${siteResult.error}` : "")
          );
          if (siteResult.targetProductName && siteResult.targetProductName !== item.productName) {
            lines.push(`      日本站上架名称：${item.productName} → ${siteResult.targetProductName}`);
          }
          if (siteResult.copyRequired === false) {
            lines.push("      已存在目标站产品：跳过国际站复制，只更新产品名称 / Specification / Product Description / 语言包。");
          }
          if (siteResult.desiredProductDescription) {
            lines.push(`      Product Description：${siteResult.desiredProductDescription}`);
          }
          (siteResult.warnings || []).slice(0, 3).forEach((warning) => {
            lines.push(`      警告：${warning.message}`);
          });
        });
      }
    });
    showLines(lines, data);
  }

  function renderBatchSubmit(data) {
    const result = data.result;
    const lines = [
      "批量产品上架执行结果",
      `产品：${result.productCount}，完成：${result.completedCount}，部分失败：${result.partialCount}，失败：${result.failedCount}`,
      ...(result.warnings?.length
        ? [`警告：${result.warnings.slice(0, 5).map((item) => item.message).join("；")}`]
        : []),
      ""
    ];
    result.results.forEach((item) => {
      lines.push(`- ${item.productName} | ${item.status}${item.error ? ` | ${item.error}` : ""}`);
      item.result?.results?.forEach((siteResult) => {
        lines.push(`  - ${siteResult.site.name} (${siteResult.site.siteCode}) | ${siteResult.status}`
          + (siteResult.error ? ` | ${siteResult.error}` : ""));
        if (siteResult.targetProductName && siteResult.targetProductName !== item.productName) {
          lines.push(`    日本站产品名称：${siteResult.targetProductName}`);
        }
      });
    });
    showLines(lines, data);
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
    showLines(lines, data);
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
    const languageOnly = isSpecificationLanguageOnly();
    const common = isCommonRevision();
    const revision = usesSourceSite();
    revisionModeTabs.hidden = true;
    showRevisionPanel(common ? "common" : "same");
    mainCard.hidden = false;
    targetsCard.hidden = common;
    statusElement.hidden = common;
    resultCard.hidden = common;
    operationLabel.hidden = false;
    operationSelect.hidden = false;
    selectMatchedButton.hidden = common;
    clearTargetsButton.hidden = common;
    selectedCountElement.hidden = common;
    syncHeading.textContent = "后台产品资料操作";
    syncDescription.textContent = ({
      "publish-batch": "从本地文件夹识别多个产品，逐站执行国际站复制、Product Description 翻译、Overview/Specification 和语言包更新。",
      revision: "将一个源站点中已有产品的 Product Description、Detail、Specification 和语言包同步到多个已存在该产品的目标站点。只修订，不复制新产品。",
      "specification-language": "只修改目标站点已有产品的 Specification 文案、Specification 输入框名称、Product Description 和语言包；不使用源站，不改 Overview。",
      common: "在下方表单中选择多个站点和多个产品，对 Detail 或 Specification 执行同一条精确删除/替换。",
      delist: "只关闭 Searchable，并将 Type of listing 设为 No Set Uptime。"
    })[currentMode()] || "选择操作类型后，页面只显示该流程需要的字段。所有写操作都必须先预览。";
    folderLabel.hidden = !batch;
    folderGroup.hidden = !batch;
    productNameLabel.hidden = batch || delist || common;
    productNameInput.hidden = batch || delist || common;
    excelLabel.hidden = batch || delist || common;
    excelInput.hidden = batch || delist || common;
    languageDatasheetLabel.hidden = batch || delist || common;
    languageDatasheetInput.hidden = batch || delist || common;
    delistLabel.hidden = !delist;
    delistProductsInput.hidden = !delist;
    sourceSiteLabel.hidden = !revision;
    sourceSiteSelect.hidden = !revision;
    languageHelp.hidden = delist || common;
    languageHelp.textContent = languageOnly
      ? "只改文案模式：按目标站点选择 Specification 语言列和 Datasheet 译文列；系统会更新 Specification 内容、Custom Page Name 输入框、Product Description 和总语言包，不改 Overview。"
      : "产品上架/修订语言包操作：先按目标站点选择 Datasheet 语种列 → 下载该站当前总语言包 → 以站点包的字段键和原文列为准，仅把 Datasheet 对应译文覆盖到目标列 → 上传新语言包 → 再次下载回读验证。";
    targetsHeading.textContent = delist ? "下架目标站点" : "目标站点与两份 Excel 的语言列";
    targetsHelp.textContent = delist
      ? "选择需要执行下架的国家站点；每个产品、每个站点都会独立预览、保存和回读。"
      : languageOnly
        ? "选择已有产品所在的目标站点；系统会按站点语言列生成 Specification，并同步 Custom Page Name 输入框和语言包。"
        : "每一行都是独立映射：目标站点 → Specification 语言列 → 本站使用的 Datasheet 译文列。系统会自动匹配，执行前可逐站核对。";
    previewButton.textContent = batch
      ? "预览批量上架（不复制）"
      : delist
        ? "预览下架（不保存）"
        : languageOnly
          ? "预览文案更新（不保存）"
          : "预览同步（不保存）";
    submitButton.textContent = batch
      ? "确认并批量上架"
      : delist
        ? "确认并执行下架"
        : languageOnly
          ? "确认并更新文案"
          : "确认并执行同步";
    renderTargets();
    setStatus(({
      "publish-batch": "批量上架模式：选择资料文件夹，预览确认后逐产品、逐站点执行；目标站已有同名产品时跳过复制，只更新 Specification / Product Description / 语言包。",
      revision: "修订同步模式：选择源站、目标站和两份 Excel，只修改目标站点已经存在的产品。",
      "specification-language": "文案更新模式：不读取源站，只更新目标站已有产品的 Specification / Product Description / 语言包。",
      common: "多产品相同内容修订：请使用下方表单填写站点、产品和替换/删除内容。",
      delist: "下架模式：只关闭 Searchable，并将 Type of listing 设为 No Set Uptime。"
    })[currentMode()] || "请选择操作类型。");
  }
  operationSelect.addEventListener("change", updateModeUi);
  sameProductTab.addEventListener("click", () => showRevisionPanel("same"));
  commonPartTab.addEventListener("click", () => showRevisionPanel("common"));
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
      const data = await postForm(productEndpoint("preview"), request.form);
      renderProductResult(data, false);
      validatedPreview = data.result;
      validatedSignature = request.signature;
      submitButton.disabled = !data.result.readyCount;
      setStatus(`预览完成：待执行 ${data.result.readyCount}，失败 ${data.result.failedCount}。`,
        data.result.failedCount ? "warn" : "ok");
    } catch (error) {
      showRequestError("预览", error);
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
      ? `将批量处理 ${validatedPreview.productCount} 个产品：未上架的先复制，已存在同名产品的跳过复制并只更新 Specification / Product Description / 语言包。确认继续？`
      : isDelisting()
        ? `将执行 ${validatedPreview.readyCount} 项下架：取消 Searchable，并把 Type of listing 改为 No Set Uptime。确认继续？`
        : isSpecificationLanguageOnly()
          ? `将更新 ${validatedPreview.productName} 在 ${validatedPreview.readyCount} 个目标站点的 Specification 文案、输入框名称、Product Description 和语言包。确认继续？`
          : `将把 ${validatedPreview.source.site.name} 的产品 ${validatedPreview.productName} 同步到 ${validatedPreview.readyCount} 个目标站点。确认继续？`);
    if (!confirmed) return;

    previewButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在逐产品、逐站点执行并回读验证，请勿关闭页面...");
    try {
      const data = await postForm(productEndpoint("submit"), request.form);
      renderProductResult(data, true);
      const warningCount = isBatchPublishing()
        ? (data.result.warnings || []).length
        : (data.result.results || []).reduce(
          (count, item) => count + (item.warnings || []).length,
          0
        );
      setStatus(
        `执行完成：失败 ${data.result.failedCount}，警告 ${warningCount}。`,
        data.result.failedCount || warningCount ? "warn" : "ok"
      );
      invalidatePreview();
    } catch (error) {
      showRequestError("执行", error);
    } finally {
      previewButton.disabled = false;
    }
  });

  updateModeUi();
  loadSites();
})();
