(function () {
  const serviceBase = "http://localhost:3217";
  const ids = {
    title: "ecProductTitleInput",
    productSearch: "ecProductSearchInput",
    fileType: "ecFileTypeSelect",
    status: "ecStatusSelect",
    weight: "ecWeightInput",
    username: "ecUsernameInput",
    password: "ecPasswordInput",
    folderFiles: "ecFilesInput",
    looseFiles: "ecFilesLooseInput",
    sharePoint: "ecSharePointCheckbox",
    translationRoot: "ecTranslationRootInput",
    materialRoot: "ecMaterialRootInput",
    materialCategory: "ecMaterialCategorySelect",
    materialCategoryCustom: "ecMaterialCategoryCustomInput",
    createDownload: "ecCreateDownloadCheckbox",
    extendLanguages: "ecExtendLanguagesCheckbox",
    updateProductImage: "ecUpdateProductImageCheckbox",
    detected: "ecDetectedFiles",
    run: "ecRunBtn",
    detect: "ecDetectBtn",
    clear: "ecClearBtn",
    statusBox: "ecStatus",
    log: "ecLogOutput"
  };

  const el = {};
  Object.keys(ids).forEach((key) => {
    el[key] = document.getElementById(ids[key]);
  });

  if (!el.title || !el.run || !el.log) return;

  function setStatus(message, type) {
    el.statusBox.textContent = message;
    el.statusBox.className = "status" + (type ? " " + type : "");
  }

  function appendLog(message) {
    const time = new Date().toLocaleTimeString();
    el.log.value += "[" + time + "] " + message + "\n";
    el.log.scrollTop = el.log.scrollHeight;
  }

  function allFiles() {
    const folder = Array.from(el.folderFiles.files || []);
    const loose = Array.from(el.looseFiles.files || []);
    return folder.length ? folder : loose;
  }

  function filePath(file) {
    return file.webkitRelativePath || file.name;
  }

  function isImage(file) {
    return /\.(png|jpe?g|gif)$/i.test(file.name);
  }

  function isDatasheet(file) {
    const path = filePath(file).toLowerCase();
    return /\.pdf$/i.test(file.name) && (
      path.includes("datasheet") ||
      path.includes("data sheet") ||
      path.includes("规格书") ||
      path.includes("spec")
    );
  }

  function isSpecExcel(file) {
    const path = filePath(file).toLowerCase();
    return /\.(xlsx|xls)$/i.test(file.name) && (
      path.includes("spec") ||
      path.includes("规格") ||
      path.includes("parameter") ||
      path.includes("参数")
    );
  }

  function pickFiles(files) {
    const images = files.filter(isImage);
    const highRes = images.find((file) => filePath(file).includes("高清图")) || images[0] || null;
    const datasheet = files.find(isDatasheet) || files.find((file) => /\.pdf$/i.test(file.name)) || null;
    const specExcel = files.find(isSpecExcel) || files.find((file) => /\.(xlsx|xls)$/i.test(file.name)) || null;
    const pickedNames = new Set([highRes, datasheet, specExcel].filter(Boolean).map(filePath));
    const materials = files.filter((file) => !pickedNames.has(filePath(file)));
    return { highRes, datasheet, specExcel, images, materials };
  }

  function renderDetection() {
    const files = allFiles();
    const picked = pickFiles(files);
    const lines = [];

    lines.push("已选择文件：" + files.length + " 个");
    lines.push("高清图：" + (picked.highRes ? filePath(picked.highRes) : "未识别到文件名包含“高清图”的图片"));
    lines.push("Datasheet：" + (picked.datasheet ? filePath(picked.datasheet) : "未识别到 datasheet/PDF"));
    lines.push("Spec Excel：" + (picked.specExcel ? filePath(picked.specExcel) : "未识别到 spec Excel"));
    lines.push("其余素材：" + picked.materials.length + " 个");

    if (picked.images.length > 1) {
      lines.push("");
      lines.push("图片候选：");
      picked.images.slice(0, 8).forEach((file) => lines.push("- " + filePath(file)));
      if (picked.images.length > 8) lines.push("- ...");
    }

    el.detected.textContent = lines.join("\n");
    return picked;
  }

  function appendFile(formData, key, file) {
    if (!file) return;
    formData.append(key, file, filePath(file));
  }

  async function runAutomation() {
    const title = el.title.value.trim();
    const files = allFiles();
    const picked = renderDetection();

    if (!title) {
      setStatus("请先填写产品标题。", "warn");
      return;
    }

    if (!files.length) {
      setStatus("请先选择产品资料文件夹或文件。", "warn");
      return;
    }

    if (el.createDownload.checked && !picked.datasheet) {
      setStatus("创建下载资料需要 datasheet/PDF 文件。", "warn");
      return;
    }

    if ((el.createDownload.checked || el.updateProductImage.checked) && !picked.highRes) {
      setStatus("需要上传高清图，请确认图片文件名包含“高清图”。", "warn");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("productSearch", el.productSearch.value.trim() || title);
    formData.append("fileType", el.fileType.value);
    formData.append("status", el.status.value);
    formData.append("weight", el.weight.value || "0");
    formData.append("username", el.username.value.trim());
    formData.append("password", el.password.value);
    formData.append("createDownload", el.createDownload.checked ? "1" : "0");
    formData.append("extendLanguages", el.extendLanguages.checked ? "1" : "0");
    formData.append("updateProductImage", el.updateProductImage.checked ? "1" : "0");
    appendFile(formData, "datasheet", picked.datasheet);
    appendFile(formData, "highResImage", picked.highRes);
    appendFile(formData, "specExcel", picked.specExcel);
    files.forEach((file) => {
      formData.append("allFiles", file, filePath(file));
    });
    formData.append("sharePoint", el.sharePoint.checked ? "1" : "0");
    formData.append("translationRoot", el.translationRoot.value.trim());
    formData.append("materialRoot", el.materialRoot.value.trim());
    formData.append("materialCategory", (el.materialCategoryCustom.value.trim() || el.materialCategory.value.trim()));

    el.run.disabled = true;
    setStatus("正在执行后台流程，浏览器会自动打开或复用登录态。");
    appendLog("开始执行：" + title);

    try {
      const response = await fetch(serviceBase + "/api/ecadmin/run", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      (payload.logs || []).forEach(appendLog);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "执行失败");
      }

      if (payload.result) {
        appendLog("下载资料 ID：" + (payload.result.downloadId || "无"));
        appendLog("扩展地址：" + (payload.result.extendUrl || "无"));
        appendLog("产品背景图：" + (payload.result.productImageUrl || "无"));
        if (payload.result.sharePointPlan) {
          appendLog("SharePoint 归档清单：\n" + JSON.stringify(payload.result.sharePointPlan, null, 2));
        }
      }

      setStatus("执行完成。", "ok");
    } catch (error) {
      appendLog("错误：" + (error && error.message ? error.message : String(error)));
      setStatus("执行失败，请查看日志。", "warn");
    } finally {
      el.run.disabled = false;
    }
  }

  el.folderFiles.addEventListener("change", renderDetection);
  el.looseFiles.addEventListener("change", renderDetection);
  el.detect.addEventListener("click", () => {
    renderDetection();
    setStatus("文件识别完成。", "ok");
  });
  el.clear.addEventListener("click", () => {
    el.log.value = "";
  });
  el.run.addEventListener("click", runAutomation);
})();
