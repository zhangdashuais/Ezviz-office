/** 批量执行产品 PC Detail 操作和 Product Album 高清图覆盖。 */
(function () {
  const serviceBase = window.location.origin;
  const operationSelect = document.getElementById("detailAddressOperationSelect");
  const siteSelect = document.getElementById("detailAddressSiteSelect");
  const selectAllSitesButton = document.getElementById("detailAddressSelectAllSites");
  const clearSitesButton = document.getElementById("detailAddressClearSites");
  const productNamesInput = document.getElementById("detailAddressProductNamesInput");
  const excelInput = document.getElementById("detailAddressExcelInput");
  const oldUrlInput = document.getElementById("detailAddressOldUrlInput");
  const newUrlInput = document.getElementById("detailAddressNewUrlInput");
  const usernameInput = document.getElementById("detailAddressUsernameInput");
  const passwordInput = document.getElementById("detailAddressPasswordInput");
  const previewButton = document.getElementById("detailAddressPreviewBtn");
  const submitButton = document.getElementById("detailAddressSubmitBtn");
  const statusElement = document.getElementById("detailAddressStatus");
  const outputElement = document.getElementById("detailAddressOutput");
  const targetLabel = document.getElementById("detailAddressTargetLabel");
  const replacementLabel = document.getElementById("detailAddressReplacementLabel");
  const deleteCodeInput = document.getElementById("detailAddressDeleteCodeInput");
  const deleteCodeLabel = document.getElementById("detailAddressDeleteCodeLabel");
  const albumImageInput = document.getElementById("detailAddressAlbumImageInput");
  const albumImageLabel = document.getElementById("detailAddressAlbumImageLabel");
  if (!operationSelect || !siteSelect || !productNamesInput || !excelInput
    || !oldUrlInput || !newUrlInput || !previewButton || !submitButton
    || !statusElement || !outputElement || !targetLabel || !replacementLabel
    || !deleteCodeInput || !deleteCodeLabel || !albumImageInput || !albumImageLabel
    || !selectAllSitesButton || !clearSitesButton) return;

  const templateHeaders = [
    "Product_Name",
    "Old_Address_1",
    "New_Address_1",
    "Old_Address_2",
    "New_Address_2",
    "Delete_Code_Block",
    "Product_Album_Image"
  ];
  let importedItems = null;
  let validatedPreview = null;
  let validatedFingerprint = "";

  function selectedSiteCodes() {
    return [...siteSelect.querySelectorAll(".detail-address-site-check:checked")]
      .map((input) => input.value)
      .filter(Boolean);
  }

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function invalidatePreview() {
    validatedPreview = null;
    validatedFingerprint = "";
    submitButton.disabled = true;
  }

  function clearImportedItems() {
    if (!importedItems) return;
    importedItems = null;
    excelInput.value = "";
    invalidatePreview();
  }

  function requestPayload() {
    const sites = selectedSiteCodes();
    const siteCode = sites[0];
    if (!siteCode) throw new Error("请选择国家站点。");
    const credentials = {
      shopUsername: usernameInput?.value.trim() || "",
      shopPassword: passwordInput?.value || ""
    };
    if (importedItems) {
      return {
        operation: "batch",
        sites,
        items: importedItems,
        ...credentials
      };
    }

    const operation = operationSelect.value;
    const productNames = productNamesInput.value.trim();
    const isAll = operation === "all";
    const isAlbumImage = operation === "replace-album-image-source";
    const oldUrl = operation === "delete" ? oldUrlInput.value : oldUrlInput.value.trim();
    const newUrl = newUrlInput.value.trim();
    if (!productNames) throw new Error("请手工填写产品名称，或上传信息 Excel。");
    if (isAll) {
      if ((oldUrl && !newUrl) || (!oldUrl && newUrl)) throw new Error("地址替换前后必须同时填写。");
      const deleteCodeBlock = deleteCodeInput.value;
      const productAlbumImage = albumImageInput.value.trim();
      if (!oldUrl && !deleteCodeBlock.trim() && !productAlbumImage) {
        throw new Error("全选模式请至少填写一项地址替换、代码块删除或高清图覆盖。");
      }
      const seen = new Set();
      const names = productNames.split(/[\n,;，；]+/).map((name) => name.trim()).filter((name) => {
        const key = name.toLowerCase();
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        operation: "batch",
        sites,
        items: names.map((productName) => ({
          productName,
          replacements: oldUrl ? [{ oldAddress: oldUrl, newAddress: newUrl }] : [],
          deleteCodeBlock,
          productAlbumImage
        })),
        ...credentials
      };
    }
    if (!oldUrl.trim()) {
      throw new Error(operation === "delete"
        ? "请填写要删除的完整代码块。"
        : isAlbumImage
          ? "请填写 Product Album 高清图本机路径或 HTTPS 地址。"
          : "请填写被替换地址。");
    }
    if (operation !== "delete" && !isAlbumImage && !newUrl) throw new Error("请填写替换后的地址。");
    if (operation !== "delete" && !isAlbumImage && oldUrl === newUrl) {
      throw new Error("两个地址不能相同。");
    }
    return {
      operation,
      sites,
      productNames,
      targetText: oldUrl,
      replacementText: operation === "delete" || isAlbumImage ? "" : newUrl,
      productAlbumImage: isAlbumImage ? oldUrl : "",
      ...credentials
    };
  }

  function fingerprint(payload) {
    return JSON.stringify({
      sites: payload.sites,
      operation: payload.operation,
      items: payload.items,
      productNames: payload.productNames,
      targetText: payload.targetText,
      replacementText: payload.replacementText,
      productAlbumImage: payload.productAlbumImage
    });
  }

  function readCell(row, indexes, header) {
    return String(row[indexes[header]] ?? "");
  }

  async function importTemporaryOperations(file) {
    if (!file) return;
    if (!window.XLSX) throw new Error("Excel 解析库尚未加载，请刷新页面后重试。");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("请选择 .xlsx 或 .xls 文件。");
    const workbook = window.XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellText: true
    });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("Excel 中没有可读取的工作表。");
    const rows = window.XLSX.utils.sheet_to_json(
      workbook.Sheets[firstSheetName],
      { header: 1, defval: "", raw: false }
    );
    const headers = (rows[0] || []).map((value) => String(value).trim());
    const missingHeaders = templateHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      throw new Error(`Excel 第一行缺少表头：${missingHeaders.join("、")}。`);
    }
    const indexes = Object.fromEntries(
      templateHeaders.map((header) => [header, headers.indexOf(header)])
    );
    const seen = new Set();
    const items = [];
    rows.slice(1).forEach((row, rowIndex) => {
      const productName = readCell(row, indexes, "Product_Name").trim();
      const rowHasAnyValue = row.some((value) => String(value).trim());
      if (!productName && !rowHasAnyValue) return;
      if (!productName) throw new Error(`Excel 第 ${rowIndex + 2} 行缺少 Product_Name。`);
      if (seen.has(productName)) throw new Error(`Product_Name 重复：${productName}。`);
      seen.add(productName);

      const replacements = [1, 2].map((number) => ({
        oldAddress: readCell(row, indexes, `Old_Address_${number}`).trim(),
        newAddress: readCell(row, indexes, `New_Address_${number}`).trim()
      }));
      replacements.forEach((replacement, replacementIndex) => {
        if (Boolean(replacement.oldAddress) !== Boolean(replacement.newAddress)) {
          throw new Error(
            `${productName} 的地址 ${replacementIndex + 1} 必须同时填写替换前和替换后地址。`
          );
        }
      });
      const deleteCodeBlock = readCell(row, indexes, "Delete_Code_Block");
      const productAlbumImage = readCell(row, indexes, "Product_Album_Image").trim();
      if (!replacements.some((replacement) => replacement.oldAddress)
        && !deleteCodeBlock.trim()
        && !productAlbumImage) {
        throw new Error(`${productName} 没有填写任何 Detail 或 Product Album 操作。`);
      }
      items.push({
        productName,
        replacements,
        deleteCodeBlock,
        productAlbumImage
      });
    });
    if (!items.length) throw new Error("Excel 中没有可执行的产品数据。");
    if (items.length > 50) {
      throw new Error(`Excel 中有 ${items.length} 个产品，一次最多处理 50 个。`);
    }

    importedItems = items;
    productNamesInput.value = items.map((item) => item.productName).join("\n");
    oldUrlInput.value = "";
    newUrlInput.value = "";
    invalidatePreview();
    const addressCount = items.reduce(
      (sum, item) => sum + item.replacements.filter((pair) => pair.oldAddress).length,
      0
    );
    const codeCount = items.filter((item) => item.deleteCodeBlock.trim()).length;
    const albumCount = items.filter((item) => item.productAlbumImage).length;
    setStatus(
      `已导入 ${items.length} 个产品、${addressCount} 组地址替换、`
      + `${codeCount} 个代码块删除、${albumCount} 组 Product Album 高清图替换。`
      + "将以 Excel 数据为准。",
      "ok"
    );
    outputElement.value = [
      `Excel：${file.name}`,
      `产品数：${items.length}`,
      `地址替换：${addressCount} 组`,
      `代码块删除：${codeCount} 个`,
      `Product Album 高清图替换：${albumCount} 组`,
      "",
      ...items.map((item) => {
        const operationCount = item.replacements.filter((pair) => pair.oldAddress).length
          + (item.deleteCodeBlock.trim() ? 1 : 0)
          + (item.productAlbumImage ? 1 : 0);
        return `- ${item.productName}：${operationCount} 项操作`;
      })
    ].join("\n");
  }

  async function postJson(path, payload) {
    const response = await fetch(serviceBase + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
      error.logs = data.logs || [];
      throw error;
    }
    return data;
  }

  function renderOperation(lines, operation, prefix) {
    lines.push(
      `${prefix}${operation.label} | ${operation.type === "delete" ? "删除" : "替换"} `
      + `${operation.matchCount} 处`
    );
    (operation.matches || []).forEach((match) =>
      lines.push(`      · ${match.path}：${match.count} 处`));
  }

  function renderPreview(data) {
    const result = data.result;
    if (result.mode === "detail-temporary-operation-multi-preview") {
      outputElement.value = result.sites.map((siteResult) => [
        `站点：${siteResult.site?.name || ""} (${siteResult.site?.siteCode || ""})`,
        siteResult.error ? `失败：${siteResult.error}` : `命中 ${siteResult.matchCount} 处，失败 ${siteResult.failedCount}`
      ].join("\n")).join("\n\n");
      return;
    }
    const lines = [
      "临时功能预览",
      `站点：${result.site.name} (${result.site.siteCode})`,
      `后台身份：${result.authenticatedIdentity}`,
      `产品：${result.productCount}，有命中：${result.readyCount}，`
      + `无命中：${result.noMatchCount}，失败：${result.failedCount}`,
      `总命中次数：${result.matchCount}`,
      "",
      "逐产品结果："
    ];
    result.results.forEach((item) => {
      if (item.status === "failed") {
        lines.push(`- 失败 | ${item.productName} | ${item.error}`);
        return;
      }
      lines.push(
        `- ${item.status === "ready" ? "可执行" : "无命中"} | `
        + `${item.productName} | Goods ID ${item.goodsId} | ${item.matchCount} 处`
      );
      (item.operations || []).forEach((operation) =>
        renderOperation(lines, operation, "  · "));
    });
    if (data.logs?.length) {
      lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    }
    outputElement.value = lines.join("\n");
  }

  function renderSubmit(data) {
    const result = data.result;
    if (result.mode === "authenticated-detail-temporary-operation-multi") {
      outputElement.value = result.sites.map((siteResult) => [
        `站点：${siteResult.site?.name || ""} (${siteResult.site?.siteCode || ""})`,
        siteResult.error
          ? `失败：${siteResult.error}`
          : `完成 ${siteResult.completedCount}，失败 ${siteResult.failedCount}，处理 ${siteResult.replacementCount} 处`
      ].join("\n")).join("\n\n");
      return;
    }
    const lines = [
      "临时功能执行结果",
      `站点：${result.site.name} (${result.site.siteCode})`,
      `后台身份：${result.authenticatedIdentity}`,
      `产品：${result.productCount}，成功：${result.completedCount}，`
      + `无命中：${result.noMatchCount}，失败：${result.failedCount}`,
      `实际处理：${result.replacementCount} 处`,
      "",
      "逐产品结果："
    ];
    result.results.forEach((item) => {
      if (item.status === "completed") {
        lines.push(
          `- 成功 | ${item.productName} | Goods ID ${item.goodsId} | ${item.matchCount} 处`
        );
        (item.backendCheck?.operations || []).forEach((check) =>
          lines.push(
            `  · ${check.label}回读通过：目标剩余 ${check.remainingTargetCount}`
          ));
      } else if (item.status === "no-match") {
        lines.push(`- 跳过（无命中）| ${item.productName} | Goods ID ${item.goodsId}`);
      } else {
        lines.push(`- 失败 | ${item.productName} | ${item.error}`);
      }
    });
    if (data.logs?.length) {
      lines.push("", "执行日志：", ...data.logs.map((line) => "- " + line));
    }
    outputElement.value = lines.join("\n");
  }

  async function loadSites() {
    siteSelect.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(serviceBase + "/api/campaign/sites");
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "站点加载失败");
      const sites = (data.sites || []).filter((site) => site.enabled !== false);
      siteSelect.innerHTML = "";
      sites.forEach((site) => {
        const label = document.createElement("label");
        label.className = "site-option";

        const input = document.createElement("input");
        input.className = "detail-address-site-check";
        input.type = "checkbox";
        input.value = site.siteCode;
        input.checked = !!site.enabled;
        input.addEventListener("change", invalidatePreview);

        const name = document.createElement("span");
        name.className = "site-name";
        name.textContent = `${site.name} (${site.siteCode})`;

        const url = document.createElement("span");
        url.className = "site-url";
        url.textContent = site.url || "";

        label.append(input, name, url);
        siteSelect.appendChild(label);
      });
      setStatus(`已加载 ${sites.length} 个站点。建议下载模板后批量导入。`, "ok");
    } catch (error) {
      siteSelect.textContent = "站点加载失败";
      setStatus("站点加载失败：" + (error.message || error), "warn");
    } finally {
      siteSelect.removeAttribute("aria-busy");
    }
  }

  selectAllSitesButton.addEventListener("click", () => {
    siteSelect.querySelectorAll(".detail-address-site-check").forEach((input) => {
      input.checked = true;
    });
    invalidatePreview();
  });

  clearSitesButton.addEventListener("click", () => {
    siteSelect.querySelectorAll(".detail-address-site-check").forEach((input) => {
      input.checked = false;
    });
    invalidatePreview();
  });

  function updateOperationUi() {
    clearImportedItems();
    const isAll = operationSelect.value === "all";
    const isDelete = operationSelect.value === "delete";
    const isAlbum = operationSelect.value === "replace-album-image-source";
    targetLabel.textContent = isAll
      ? "被替换地址（可留空）"
      : isDelete
      ? "要删除的完整代码块（手工模式）"
      : isAlbum
        ? "Product Album 高清图（本机路径或 HTTPS 地址，手工模式）"
        : "被替换地址（手工模式）";
    replacementLabel.textContent = isAll ? "替换后的完整地址（可留空）" : "替换后的完整地址";
    oldUrlInput.placeholder = isAll
      ? "需要地址替换时填写旧地址"
      : isDelete
      ? "粘贴需要精确删除的完整 HTML / script / style 代码块"
      : isAlbum
        ? "C:\\Users\\name\\Desktop\\product.jpg 或 https://mfs.ezvizlife.com/product.jpg"
        : "https://mfs.ezvizlife.com/old-image.jpg";
    oldUrlInput.rows = isDelete ? 4 : 2;
    replacementLabel.hidden = isDelete || isAlbum;
    newUrlInput.hidden = isDelete || isAlbum;
    deleteCodeLabel.hidden = !isAll;
    deleteCodeInput.hidden = !isAll;
    albumImageLabel.hidden = !isAll;
    albumImageInput.hidden = !isAll;
    if (isDelete || isAlbum) newUrlInput.value = "";
    invalidatePreview();
  }

  siteSelect.addEventListener("change", invalidatePreview);
  [productNamesInput, oldUrlInput, newUrlInput, deleteCodeInput, albumImageInput].forEach((element) => {
    element.addEventListener("input", () => {
      clearImportedItems();
      invalidatePreview();
    });
  });
  operationSelect.addEventListener("change", updateOperationUi);
  excelInput.addEventListener("change", async () => {
    try {
      await importTemporaryOperations(excelInput.files?.[0]);
    } catch (error) {
      importedItems = null;
      productNamesInput.value = "";
      invalidatePreview();
      setStatus("Excel 导入失败：" + (error?.message || error), "warn");
    }
  });

  previewButton.addEventListener("click", async () => {
    invalidatePreview();
    previewButton.disabled = true;
    try {
      const payload = requestPayload();
      setStatus("正在登录后台并逐产品预览全部操作，不会保存产品...");
      const data = await postJson("/api/detail-address-replacement/preview", payload);
      renderPreview(data);
      validatedPreview = data.result;
      if (validatedPreview.sites && !validatedPreview.site) {
        validatedPreview.site = { name: `${validatedPreview.siteCount} 个国家站点`, siteCode: "multi" };
      }
      validatedFingerprint = fingerprint(payload);
      submitButton.disabled = !data.result.matchCount;
      setStatus(
        data.result.matchCount
          ? `预览完成：${data.result.readyCount} 个产品共命中 `
            + `${data.result.matchCount} 处，请核对后确认。`
          : "预览完成：没有任何命中，不会提交。",
        data.result.matchCount ? "ok" : "warn"
      );
    } catch (error) {
      outputElement.value = [
        "预览失败：" + (error.message || error),
        ...(error.logs || [])
      ].join("\n");
      setStatus("预览失败：" + (error.message || error), "warn");
    } finally {
      previewButton.disabled = false;
    }
  });

  submitButton.addEventListener("click", async () => {
    let payload;
    try {
      payload = requestPayload();
    } catch (error) {
      setStatus(error.message || error, "warn");
      return;
    }
    if (!validatedPreview || fingerprint(payload) !== validatedFingerprint) {
      invalidatePreview();
      setStatus("输入内容已变化，请重新预览后再提交。", "warn");
      return;
    }
    const confirmed = window.confirm(
      `将修改 ${validatedPreview.site.name} (${validatedPreview.site.siteCode}) `
      + `${validatedPreview.readyCount} 个产品，共处理 `
      + `${validatedPreview.matchCount} 处内容。确认继续？`
    );
    if (!confirmed) return;

    previewButton.disabled = true;
    submitButton.disabled = true;
    setStatus("正在逐产品一次性保存全部操作并回读验证，请勿关闭页面...");
    try {
      const data = await postJson("/api/detail-address-replacement/submit", payload);
      renderSubmit(data);
      const failed = data.result.failedCount;
      setStatus(
        `执行完成：成功 ${data.result.completedCount} 个，处理 `
        + `${data.result.replacementCount} 处，失败 ${failed} 个。`,
        failed ? "warn" : "ok"
      );
      invalidatePreview();
    } catch (error) {
      outputElement.value = [
        "执行失败：" + (error.message || error),
        ...(error.logs || [])
      ].join("\n");
      setStatus("执行失败：" + (error.message || error), "warn");
    } finally {
      previewButton.disabled = false;
    }
  });

  updateOperationUi();
  loadSites();
})();
