function cleanFolderSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function createEcadminPlatformFeature(deps) {
  const {
    fs,
    path,
    logLine,
    normalizeBool,
    visibleText,
    clickFormSelect,
    clickVisibleOption,
    formItemText,
    setFileByLabel,
    ensureLoggedIn,
    getContext,
    productRoot = "D:\\产品",
    inspectProductTracker,
    syncProductTracker
  } = deps;

  function findProductFolder(productName) {
    if (/[\\/]/.test(productName) || productName.includes("..")) throw new Error("产品名称不能包含路径字符。");
    if (!fs.existsSync(productRoot)) throw new Error(`产品根目录不存在：${productRoot}`);
    const direct = path.join(productRoot, productName);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
    const normalized = productName.trim().replace(/\s+/g, " ").toLowerCase();
    const match = fs.readdirSync(productRoot, { withFileTypes: true }).find((entry) => (
      entry.isDirectory() && entry.name.trim().replace(/\s+/g, " ").toLowerCase() === normalized
    ));
    if (!match) throw new Error(`未找到产品目录：${direct}`);
    return path.join(productRoot, match.name);
  }

  function inspectLocalFiles(productName) {
    if (!String(productName || "").trim()) throw new Error("产品名称不能为空。");
    const productFolder = findProductFolder(productName);
    const uploadFolder = path.join(productFolder, "upload");
    if (!fs.existsSync(uploadFolder) || !fs.statSync(uploadFolder).isDirectory()) {
      throw new Error(`未找到 upload 文件夹：${uploadFolder}`);
    }
    const allFiles = fs.readdirSync(uploadFolder, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filePath = path.join(uploadFolder, entry.name);
        return { path: filePath, originalname: entry.name, filename: entry.name, size: fs.statSync(filePath).size };
      });
    const datasheet = allFiles.find((file) => /datasheet.*\.pdf$|\.pdf$.*datasheet/i.test(file.originalname))
      || allFiles.find((file) => /\.pdf$/i.test(file.originalname));
    const images = allFiles.filter((file) => /\.(png|jpe?g|gif|webp)$/i.test(file.originalname));
    const highResImage = images.find((file) => /高清图|high[\s_-]*res|product[\s_-]*image/i.test(file.originalname));
    const specExcel = allFiles.find((file) => /(?:spec|规格|参数).*\.(xlsx|xls)$/i.test(file.originalname));
    return { productFolder, uploadFolder, datasheet, highResImage, specExcel, allFiles };
  }

async function createDownloadInfo(page, payload, files, logs) {
  const createUrl = "https://ecadmin.ys7.com/#/app-support/Support/SupportOvs/SupportDownloadCenter/SupportDownloadInfo/SupportDownloadInfoCreate";
  await ensureLoggedIn(page, createUrl, payload, logs);
  await page.waitForTimeout(2500);

  logLine(logs, "填写下载资料标题。");
  const titleInput = page.locator(".el-form-item").filter({ hasText: "标题" }).first().locator("input").first();
  await titleInput.fill(payload.title);
  await page.getByRole("button", { name: "快捷转换" }).click();
  await page.waitForTimeout(800);

  logLine(logs, "按标题搜索并关联产品：" + payload.productSearch);
  await clickFormSelect(page, "关联产品", 0);
  const productInput = page.locator(".el-form-item").filter({ hasText: "关联产品" }).locator("input").last();
  await productInput.fill(payload.productSearch);
  await page.waitForTimeout(1800);
  await clickVisibleOption(page, payload.productSearch);
  await page.keyboard.press("Escape").catch(() => {});

  logLine(logs, "选择文件类型：" + payload.fileType);
  await clickFormSelect(page, "文件类型", 0);
  await clickVisibleOption(page, payload.fileType);

  logLine(logs, "选择上传类型：上传文件。");
  await clickFormSelect(page, "上传类型", 0);
  await clickVisibleOption(page, "上传文件");
  await page.waitForTimeout(1000);

  logLine(logs, "上传 datasheet：" + path.basename(files.datasheet.path));
  await setFileByLabel(page, "上传", files.datasheet.path);
  await page.waitForTimeout(9000);
  const addressText = await formItemText(page, "地址");
  logLine(logs, "文件地址：" + addressText.replace(/\s+/g, " "));

  logLine(logs, "上传图标高清图：" + path.basename(files.highResImage.path));
  await setFileByLabel(page, "图标", files.highResImage.path);
  await page.waitForTimeout(7000);
  const iconText = await formItemText(page, "图标");
  logLine(logs, "图标地址：" + iconText.replace(/\s+/g, " "));

  const isEnabled = payload.status !== "disabled";
  const switchState = await page.evaluate(() => {
    const root = [...document.querySelectorAll(".el-form-item")].find((el) => (el.querySelector(".el-form-item__label")?.innerText || "").trim() === "状态");
    return !!root?.querySelector('input[type="checkbox"]')?.checked;
  });
  if (switchState !== isEnabled) {
    await page.evaluate(() => {
      const root = [...document.querySelectorAll(".el-form-item")].find((el) => (el.querySelector(".el-form-item__label")?.innerText || "").trim() === "状态");
      root?.querySelector(".el-switch")?.click();
    });
  }

  const weightInput = page.locator(".el-form-item").filter({ hasText: "权重" }).locator("input").first();
  await weightInput.fill(String(payload.weight || 0));

  logLine(logs, "提交下载资料。");
  await page.getByRole("button", { name: "提交" }).click();
  await page.waitForTimeout(5000);

  const listUrl = "https://ecadmin.ys7.com/#/app-support/Support/SupportOvs/SupportDownloadCenter/SupportDownloadInfo/SupportDownloadInfoList?table%5Bpage%5D=1&table%5BpageSize%5D=20";
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const rowExists = (await visibleText(page, 2500)).includes(payload.title);
  if (!rowExists) throw new Error("提交后没有在列表第一页找到：" + payload.title);

  await page.evaluate((title) => {
    const row = [...document.querySelectorAll("tr")].find((r) => r.innerText.includes(title));
    const edit = [...(row?.querySelectorAll("button,a,span") || [])].find((el) => el.innerText.trim() === "编辑");
    edit?.click();
  }, payload.title);
  await page.waitForTimeout(4000);
  const editUrl = page.url();
  const match = editUrl.match(/[?&](?:downloadId|download_id)=([^&]+)/i);
  const downloadId = match ? decodeURIComponent(match[1]) : "";
  if (!downloadId) throw new Error("未能从编辑页地址提取 downloadId：" + editUrl);
  logLine(logs, "下载资料 downloadId：" + downloadId);
  return { downloadId, editUrl };
}

async function triggerLanguageExtend(page, payload, downloadId, logs) {
  const listUrl = "https://ecadmin.ys7.com/#/app-support/Support/SupportOvs/SupportDownloadCenter/SupportDownloadInfo/SupportDownloadInfoList?table%5Bpage%5D=1&table%5BpageSize%5D=20";
  await ensureLoggedIn(page, listUrl, payload, logs);
  await page.waitForTimeout(2500);

  const titleInput = page.locator('input[placeholder="标题"]').first();
  if (!await titleInput.count()) throw new Error("程序下载管理页面未找到标题搜索框。");
  await titleInput.fill(payload.title);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.waitForTimeout(1500);

  const rows = page.locator("tr");
  const rowIndex = await rows.evaluateAll((elements, title) => elements.findIndex((row) => {
    return [...row.querySelectorAll("td")]
      .some((cell) => (cell.innerText || "").trim() === title);
  }), payload.title);
  if (rowIndex < 0) throw new Error("程序下载管理中未找到标题完全匹配的资料：" + payload.title);

  const row = rows.nth(rowIndex);
  const rowText = (await row.innerText()).replace(/\s+/g, " ").trim();
  const extendButton = row.getByRole("button", { name: "补全多语言", exact: true });
  if (!await extendButton.count()) throw new Error("匹配资料中未找到“补全多语言”操作：" + payload.title);

  logLine(logs, "程序下载管理匹配资料：" + rowText);
  if (downloadId) logLine(logs, "本轮创建的下载资料 ID：" + downloadId);
  await extendButton.click();
  await page.waitForTimeout(500);

  const dialog = page.locator('.el-dialog:visible, [role="dialog"]:visible').last();
  if (!await dialog.count()) throw new Error("“补全多语言”弹窗未打开。");
  const languageTitle = dialog.locator("input").first();
  if (!await languageTitle.count()) throw new Error("“补全多语言”弹窗未找到标题输入框。");
  await languageTitle.fill(payload.title);

  const responsePromise = page.waitForResponse(
    (response) => /download_info_extend\/batch_create(?:\?|$)/i.test(response.url()),
    { timeout: 60000 }
  );
  await dialog.getByRole("button", { name: "提交", exact: true }).click();
  const response = await responsePromise;
  const responseText = await response.text().catch(() => "");
  let responseJson = null;
  try { responseJson = JSON.parse(responseText); } catch {}
  if (!response.ok() || Number(responseJson?.code || 200) >= 400) {
    throw new Error(responseJson?.msg || `补全多语言失败（HTTP ${response.status()}）：${responseText.slice(0, 300)}`);
  }

  const count = Number(responseJson?.data?.count ?? responseJson?.count ?? 0);
  logLine(logs, count > 0
    ? `补全多语言完成：新增 ${count} 条记录。`
    : "补全多语言完成：所有语言均已存在，无需新增。");
  return {
    listUrl,
    downloadId: downloadId || "",
    title: payload.title,
    count,
    response: responseJson || responseText.slice(0, 1000)
  };
}

async function updateProductImage(page, payload, file, logs) {
  const listUrl = "https://ecadmin.ys7.com/#/app-support/Support/SupportOvs/SupportProductManage/SupportProduct/SupportProductList?table%5Bpage%5D=1&table%5BpageSize%5D=20&table%5BproductTitle%5D=" + encodeURIComponent(payload.title);
  await ensureLoggedIn(page, listUrl, payload, logs);
  await page.waitForTimeout(5000);

  logLine(logs, "打开产品编辑：" + payload.title);
  await page.evaluate((title) => {
    const row = [...document.querySelectorAll("tr")].find((r) => r.innerText.toLowerCase().includes(title.toLowerCase()));
    const edit = [...(row?.querySelectorAll("button,a,span") || [])].find((el) => el.innerText.trim() === "编辑");
    edit?.click();
  }, payload.title);
  await page.waitForTimeout(4000);

  const before = await page.evaluate(() => {
    const root = [...document.querySelectorAll(".el-form-item")].find((el) => (el.querySelector(".el-form-item__label")?.innerText || "").trim() === "背景图");
    return root?.querySelector("img")?.src || "";
  });
  logLine(logs, "原背景图：" + before);

  logLine(logs, "重新上传产品高清图：" + path.basename(file.path));
  await setFileByLabel(page, "背景图", file.path);
  await page.waitForTimeout(8000);

  const after = await page.evaluate(() => {
    const root = [...document.querySelectorAll(".el-form-item")].find((el) => (el.querySelector(".el-form-item__label")?.innerText || "").trim() === "背景图");
    return root?.querySelector("img")?.src || "";
  });
  logLine(logs, "新背景图：" + after);

  await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll(".el-dialog, .el-overlay-dialog, [role='dialog']")];
    const scope = dialogs.find((d) => d.innerText.includes("产品名称") && d.innerText.includes("背景图")) || document;
    const submit = [...scope.querySelectorAll("button")].find((b) => b.innerText.trim() === "提交");
    submit?.click();
  });
  await page.waitForTimeout(5000);
  return after;
}

  async function runEcadminPlatform(body, logs) {
    const payload = {
      title: String(body.title || "").trim(),
      productSearch: String(body.productSearch || body.title || "").trim(),
      fileType: String(body.fileType || "Product Datasheet"),
      status: String(body.status || "enabled"),
      weight: String(body.weight || "0"),
      username: String(body.username || "").trim(),
      password: String(body.password || ""),
      createDownload: normalizeBool(body.createDownload),
      extendLanguages: normalizeBool(body.extendLanguages),
      updateProductImage: normalizeBool(body.updateProductImage)
    };

    if (!payload.title) throw new Error("产品标题不能为空。");
    const needsFiles = payload.createDownload || payload.updateProductImage;
    let files = { datasheet: null, highResImage: null, specExcel: null, allFiles: [] };
    if (needsFiles) {
      files = inspectLocalFiles(payload.title);
      logLine(logs, "本地资料目录：" + files.uploadFolder);
      logLine(logs, "识别到文件：" + files.allFiles.length + " 个");
      logLine(logs, "Datasheet：" + (files.datasheet?.originalname || "未识别"));
      logLine(logs, "高清图：" + (files.highResImage?.originalname || "未识别"));
    }
    if (payload.createDownload && (!files.datasheet || !files.highResImage)) {
      throw new Error("创建下载资料需要 upload 文件夹内同时存在 Datasheet PDF 和命名含“高清图”的图片。");
    }
    if (payload.updateProductImage && !files.highResImage) {
      throw new Error("更新产品背景图需要高清图。");
    }

    const result = { localFiles: files };
    if (inspectProductTracker) {
      result.productTrackerBefore = await inspectProductTracker(payload.title);
      logLine(logs, result.productTrackerBefore.exists ? "Google Sheet 已有该产品。" : "Google Sheet 尚无该产品，成功后将追加。");
    }

    const needsEcadmin = payload.createDownload || payload.extendLanguages || payload.updateProductImage;
    const context = needsEcadmin ? await getContext() : null;
    const page = context ? (context.pages().find((p) => p.url().includes("ecadmin.ys7.com")) || context.pages()[0] || await context.newPage()) : null;
    if (page) page.setDefaultTimeout(25000);

    if (payload.createDownload) {
      Object.assign(result, await createDownloadInfo(page, payload, files, logs));
    }

    if (payload.extendLanguages) {
      result.languageCompletion = await triggerLanguageExtend(page, payload, result.downloadId, logs);
    }

    if (payload.updateProductImage) {
      result.productImageUrl = await updateProductImage(page, payload, files.highResImage, logs);
    }

    if (syncProductTracker) {
      result.productTracker = await syncProductTracker(payload.title);
      logLine(logs, result.productTracker.status === "appended"
        ? `Google Sheet 已追加到第 ${result.productTracker.row} 行。`
        : `Google Sheet 第 ${result.productTracker.row} 行已存在，无需重复填写。`);
    }

    return result;
  }

  return { runEcadminPlatform, inspectLocalFiles };
}

module.exports = {
  createEcadminPlatformFeature,
  cleanFolderSegment
};
