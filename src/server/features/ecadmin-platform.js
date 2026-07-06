function createEcadminPlatformFeature(deps) {
  const {
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
    SHAREPOINT_DEFAULTS
  } = deps;

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

async function triggerLanguageExtend(context, title, downloadId, logs) {
  const extendUrl = `https://support.ezviz.com/backend/api/ecadmin_support_download_info_extend?download_id=${encodeURIComponent(downloadId)}&language_title=${encodeURIComponent(title)}`;
  logLine(logs, "访问语言扩展接口：" + extendUrl);
  const page = await context.newPage();
  await page.goto(extendUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.close().catch(() => {});
  return extendUrl;
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

function cleanFolderSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function isSameUpload(a, b) {
  if (!a || !b) return false;
  return a.path === b.path || (a.originalname === b.originalname && a.size === b.size);
}

function buildSharePointPlan(payload, files, logs) {
  const productFolder = cleanFolderSegment(payload.title);
  const translationRoot = payload.translationRoot || SHAREPOINT_DEFAULTS.translationRoot;
  const materialRoot = payload.materialRoot || SHAREPOINT_DEFAULTS.materialRoot;
  const category = cleanFolderSegment(payload.materialCategory);
  const allFiles = files.allFiles || [];

  const specExcel = files.specExcel || allFiles.find((file) => /\.(xlsx|xls)$/i.test(file.originalname || file.filename));
  const translationFiles = [files.datasheet, specExcel].filter(Boolean);
  const materialFiles = allFiles.filter((file) => {
    return !translationFiles.some((picked) => isSameUpload(file, picked));
  });

  const translationFolder = `${translationRoot}/${productFolder}`;
  const materialFolder = category ? `${materialRoot}/${category}/${productFolder}` : "";

  const plan = {
    status: "planned",
    note: "当前本地服务不能直接调用 Codex SharePoint 连接器；已生成可执行归档计划。若接入企业 SharePoint 授权或浏览器上传流程，可按此计划执行。",
    site: {
      hostname: SHAREPOINT_DEFAULTS.hostname,
      sitePath: SHAREPOINT_DEFAULTS.sitePath
    },
    folders: {
      translationFolder,
      materialFolder
    },
    translationFiles: translationFiles.map((file) => ({
      name: file.originalname || file.filename,
      localPath: file.path,
      role: isSameUpload(file, files.datasheet) ? "datasheet" : "specExcel"
    })),
    materialFiles: materialFiles.map((file) => ({
      name: file.originalname || file.filename,
      localPath: file.path
    }))
  };

  if (!specExcel) {
    plan.warning = "未识别到 spec Excel。Product Translation 文件夹将只包含 datasheet。";
  }

  if (!category) {
    plan.warning = [plan.warning, "未选择素材类目，素材归档目标文件夹为空。"].filter(Boolean).join(" ");
  }

  logLine(logs, "SharePoint 归档计划已生成。");
  logLine(logs, "Product Translation 文件夹：" + translationFolder);
  if (materialFolder) logLine(logs, "素材类目文件夹：" + materialFolder);
  logLine(logs, "Product Translation 文件数：" + plan.translationFiles.length);
  logLine(logs, "素材文件数：" + plan.materialFiles.length);
  return plan;
}

  async function runEcadminPlatform(body, files, logs) {
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
      updateProductImage: normalizeBool(body.updateProductImage),
      sharePoint: normalizeBool(body.sharePoint),
      translationRoot: String(body.translationRoot || SHAREPOINT_DEFAULTS.translationRoot).trim(),
      materialRoot: String(body.materialRoot || SHAREPOINT_DEFAULTS.materialRoot).trim(),
      materialCategory: String(body.materialCategory || "").trim()
    };

    if (!payload.title) throw new Error("产品标题不能为空。");
    if (payload.createDownload && (!files.datasheet || !files.highResImage)) {
      throw new Error("创建下载资料需要 datasheet 和高清图。");
    }
    if (payload.updateProductImage && !files.highResImage) {
      throw new Error("更新产品背景图需要高清图。");
    }

    const result = {};
    if (payload.sharePoint) {
      result.sharePointPlan = buildSharePointPlan(payload, files, logs);
    }

    const needsEcadmin = payload.createDownload || payload.extendLanguages || payload.updateProductImage;
    const context = needsEcadmin ? await getContext() : null;
    const page = context ? (context.pages().find((p) => p.url().includes("ecadmin.ys7.com")) || context.pages()[0] || await context.newPage()) : null;
    if (page) page.setDefaultTimeout(25000);

    if (payload.createDownload) {
      Object.assign(result, await createDownloadInfo(page, payload, files, logs));
    }

    if (payload.extendLanguages) {
      if (!result.downloadId) {
        throw new Error("需要先创建下载资料，才能访问扩展语言接口。");
      }
      result.extendUrl = await triggerLanguageExtend(context, payload.title, result.downloadId, logs);
    }

    if (payload.updateProductImage) {
      result.productImageUrl = await updateProductImage(page, payload, files.highResImage, logs);
    }

    return result;
  }

  return { runEcadminPlatform };
}

module.exports = { createEcadminPlatformFeature };
