/** 国际站产品修订内容同步到多个目标站点。 */
(function () {
  const serviceBase = window.location.origin;
  const sourceSiteSelect = document.getElementById("revisionSyncSourceSite");
  const productNameInput = document.getElementById("revisionSyncProductName");
  const excelInput = document.getElementById("revisionSyncExcel");
  const languageDatasheetInput = document.getElementById("revisionSyncLanguageDatasheet");
  const targetsElement = document.getElementById("revisionSyncTargets");
  const selectMatchedButton = document.getElementById("revisionSyncSelectMatched");
  const clearTargetsButton = document.getElementById("revisionSyncClearTargets");
  const previewButton = document.getElementById("revisionSyncPreview");
  const submitButton = document.getElementById("revisionSyncSubmit");
  const statusElement = document.getElementById("revisionSyncStatus");
  const outputElement = document.getElementById("revisionSyncOutput");
  if (!sourceSiteSelect || !productNameInput || !excelInput || !languageDatasheetInput
    || !targetsElement
    || !selectMatchedButton || !clearTargetsButton || !previewButton
    || !submitButton || !statusElement || !outputElement) return;

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
      site.enabled !== false && site.siteCode !== sourceCode);
    if (!specificationHeaders.length || !languagePackageHeaders.length) {
      targetsElement.textContent = "上传 Specification Excel 和语言包 Datasheet 后显示站点与语言列。";
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
      "<thead><tr><th>同步</th><th>目标站点</th>"
        + "<th>Specification 语言列</th><th>语言包译文列</th></tr></thead>",
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
    targetsElement.querySelectorAll("input,select").forEach((element) =>
      element.addEventListener("change", invalidatePreview));
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

  function selectedTargets() {
    return [...targetsElement.querySelectorAll("tbody tr")]
      .filter((row) => row.querySelector(".revision-target-check")?.checked)
      .map((row) => {
        const siteCode = row.dataset.siteCode;
        const localeHeader = row.querySelector(".revision-target-language")?.value || "";
        const languagePackageHeader = row.querySelector(
          ".revision-target-package-language"
        )?.value || "";
        if (!localeHeader) throw new Error(`${siteCode} 尚未选择 Excel 语言列。`);
        if (!languagePackageHeader) {
          throw new Error(`${siteCode} 尚未选择语言包 Datasheet 译文列。`);
        }
        return { siteCode, localeHeader, languagePackageHeader };
      });
  }

  function inputSignature(targets) {
    const file = excelInput.files?.[0];
    const languageDatasheet = languageDatasheetInput.files?.[0];
    return JSON.stringify({
      sourceSiteCode: sourceSiteSelect.value,
      productName: productNameInput.value.trim(),
      file: file ? [file.name, file.size, file.lastModified] : null,
      languageDatasheet: languageDatasheet
        ? [languageDatasheet.name, languageDatasheet.size, languageDatasheet.lastModified]
        : null,
      targets
    });
  }

  function buildForm(extra) {
    const file = excelInput.files?.[0];
    const languageDatasheet = languageDatasheetInput.files?.[0];
    if (!file) throw new Error("请上传 Specification 翻译 Excel。");
    if (!languageDatasheet) throw new Error("请上传语言包 Datasheet。");
    const productName = productNameInput.value.trim();
    if (!productName) throw new Error("请填写产品名称。");
    const targets = selectedTargets();
    if (!targets.length) throw new Error("请至少勾选一个目标站点。");
    const form = new FormData();
    form.append("specExcel", file);
    form.append("languageDatasheet", languageDatasheet);
    form.append("sourceSiteCode", sourceSiteSelect.value || "hq");
    form.append("productName", productName);
    form.append("targetsJson", JSON.stringify(targets));
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
    const lines = [
      "产品修订同步预览（尚未保存）",
      `产品：${result.productName}`,
      `源站点：${result.source.site.name} (${result.source.site.siteCode})`,
      `源站 Goods ID：${result.source.goodsId}`,
      `源 Detail：${result.source.overviewLength} 字符`,
      `源 Specification：${result.source.specificationLength} 字符`,
      `自动继承图片：${result.source.image.src}`,
      `图片 alt：${result.source.image.alt || "（空）"}`,
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
    const lines = [
      "产品修订同步执行结果",
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
          `  · Detail：${item.components?.detail || "未知"}；`
          + `Specification：${item.components?.specification || "未知"}；`
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
  productNameInput.addEventListener("input", invalidatePreview);
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
    let selected = 0;
    targetsElement.querySelectorAll("tbody tr").forEach((row) => {
      const language = row.querySelector(".revision-target-language");
      const packageLanguage = row.querySelector(".revision-target-package-language");
      const checkbox = row.querySelector(".revision-target-check");
      checkbox.checked = Boolean(language?.value && packageLanguage?.value);
      if (checkbox.checked) selected += 1;
    });
    invalidatePreview();
    setStatus(`已勾选 ${selected} 个可自动匹配语言列的站点，请核对后预览。`, "ok");
  });

  clearTargetsButton.addEventListener("click", () => {
    targetsElement.querySelectorAll(".revision-target-check").forEach((checkbox) => {
      checkbox.checked = false;
    });
    invalidatePreview();
    setStatus("已清空目标站点。");
  });

  previewButton.addEventListener("click", async () => {
    invalidatePreview();
    previewButton.disabled = true;
    try {
      const request = buildForm();
      setStatus("正在逐站点检查 Detail、Specification 和当前语言包；不会保存...");
      const data = await postForm("/api/product-revision-sync/preview", request.form);
      renderPreview(data);
      validatedPreview = data.result;
      validatedSignature = request.signature;
      submitButton.disabled = !data.result.readyCount;
      setStatus(
        `预览完成：${data.result.readyCount} 个站点待更新，`
        + `${data.result.noChangeCount} 个无需更新，${data.result.failedCount} 个失败。`,
        data.result.failedCount ? "warn" : "ok"
      );
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
      request = buildForm({
        expectedSourceFingerprint: validatedPreview?.source?.fingerprint || "",
        expectedWorkbookFingerprint: validatedPreview?.workbook?.fingerprint || "",
        expectedLanguageDatasheetFingerprint:
          validatedPreview?.languageDatasheet?.fingerprint || "",
        expectedLanguagePackageFingerprints: JSON.stringify(
          Object.fromEntries(
            (validatedPreview?.results || [])
              .filter((item) => item.languagePackage?.sourceFingerprint)
              .map((item) => [
                item.site.siteCode,
                item.languagePackage.sourceFingerprint
              ])
          )
        )
      });
    } catch (error) {
      setStatus(error.message || error, "warn");
      return;
    }
    if (!validatedPreview || request.signature !== validatedSignature) {
      invalidatePreview();
      setStatus("产品、Excel、Datasheet 或目标站点已变化，请重新预览。", "warn");
      return;
    }
    const confirmed = window.confirm(
      `将把 ${validatedPreview.source.site.name} 的产品 ${validatedPreview.productName} `
      + `同步到 ${validatedPreview.readyCount} 个待更新站点，`
      + "并更新对应语言包。确认继续？"
    );
    if (!confirmed) return;

    previewButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在逐站点保存产品、上传语言包并回读验证，请勿关闭页面...");
    try {
      const data = await postForm("/api/product-revision-sync/submit", request.form);
      renderSubmit(data);
      setStatus(
        `执行完成：成功 ${data.result.completedCount}，无需更新 `
        + `${data.result.noChangeCount}，失败 ${data.result.failedCount}。`,
        data.result.failedCount ? "warn" : "ok"
      );
      invalidatePreview();
    } catch (error) {
      outputElement.value = ["执行失败：" + (error.message || error), ...(error.logs || [])].join("\n");
      setStatus("执行失败：" + (error.message || error), "warn");
    } finally {
      previewButton.disabled = false;
    }
  });

  loadSites();
})();
