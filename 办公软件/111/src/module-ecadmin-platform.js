(function () {
  const serviceBase = "http://localhost:3217";
  const el = {
    title: document.getElementById("ecProductTitleInput"),
    uploadPath: document.getElementById("ecUploadPathInput"),
    createDownload: document.getElementById("ecCreateDownloadCheckbox"),
    extendLanguages: document.getElementById("ecExtendLanguagesCheckbox"),
    updateProductImage: document.getElementById("ecUpdateProductImageCheckbox"),
    detected: document.getElementById("ecDetectedFiles"),
    run: document.getElementById("ecRunBtn"),
    detect: document.getElementById("ecDetectBtn"),
    clear: document.getElementById("ecClearBtn"),
    statusBox: document.getElementById("ecStatus"),
    log: document.getElementById("ecLogOutput")
  };
  if (!el.title || !el.run || !el.log) return;

  function setStatus(message, type) {
    el.statusBox.textContent = message;
    el.statusBox.className = "status" + (type ? " " + type : "");
  }
  function appendLog(message) {
    el.log.value += "[" + new Date().toLocaleTimeString() + "] " + message + "\n";
    el.log.scrollTop = el.log.scrollHeight;
  }
  function updatePath() {
    el.uploadPath.value = el.title.value.trim() ? "D:\\产品\\" + el.title.value.trim() + "\\upload" : "D:\\产品\\<产品名称>\\upload";
  }
  async function post(url, body) {
    const response = await fetch(serviceBase + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "执行失败");
    return payload;
  }
  function renderDetection(result) {
    el.detected.textContent = [
      "读取目录：" + result.uploadFolder,
      "文件总数：" + result.allFiles.length,
      "Datasheet：" + (result.datasheet?.originalname || "未识别"),
      "高清图：" + (result.highResImage?.originalname || "未识别；文件名需包含“高清图”或 high-res"),
      "Spec Excel：" + (result.specExcel?.originalname || "未识别")
    ].join("\n");
  }
  async function detectFiles() {
    const title = el.title.value.trim();
    if (!title) throw new Error("请先填写产品名称。");
    updatePath();
    const payload = await post("/api/ecadmin/local-files", { title });
    renderDetection(payload.result);
    setStatus("本地文件识别完成。", "ok");
  }
  async function runAutomation() {
    const title = el.title.value.trim();
    if (!title) return setStatus("请先填写产品名称。", "warn");
    el.run.disabled = true;
    setStatus("正在执行服务中心流程；完成后会查重并同步 Google Sheet。");
    appendLog("开始执行：" + title);
    try {
      await detectFiles();
      const payload = await post("/api/ecadmin/run", {
        title,
        createDownload: el.createDownload.checked,
        extendLanguages: el.extendLanguages.checked,
        updateProductImage: el.updateProductImage.checked
      });
      (payload.logs || []).forEach(appendLog);
      const tracker = payload.result?.productTracker;
      if (tracker) appendLog(tracker.status === "appended"
        ? "Product Status 已追加第 " + tracker.row + " 行。"
        : "Product Status 第 " + tracker.row + " 行已有该产品，未重复追加。");
      setStatus("执行完成。", "ok");
    } catch (error) {
      appendLog("错误：" + (error?.message || String(error)));
      setStatus("执行失败，请查看日志。", "warn");
    } finally {
      el.run.disabled = false;
    }
  }

  el.title.addEventListener("input", updatePath);
  el.detect.addEventListener("click", () => detectFiles().catch((error) => {
    appendLog("错误：" + (error?.message || String(error)));
    setStatus("文件识别失败。", "warn");
  }));
  el.clear.addEventListener("click", () => { el.log.value = ""; });
  el.run.addEventListener("click", runAutomation);
  updatePath();
})();
