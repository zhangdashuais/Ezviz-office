function createLanguagePackageFeature(deps) {
  const {
    fs,
    path,
    logLine,
    visibleTextSafe,
    readCampaignConfig,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    SHOP_DASHBOARD_URL
  } = deps;

async function probeLanguagePackageUpload(page, filePath, logs) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("语言包文件不存在：" + filePath);
  }
  const captured = [];
  const onRequest = (request) => {
    const url = request.url();
    if (!/ezvizlife\.com|language|upload|webuploader|xls|xlsx/i.test(url)) return;
    captured.push({
      type: "request",
      method: request.method(),
      url,
      postData: request.postData() || ""
    });
  };
  const onResponse = (response) => {
    const url = response.url();
    if (!/ezvizlife\.com|language|upload|webuploader|xls|xlsx/i.test(url)) return;
    captured.push({
      type: "response",
      status: response.status(),
      url
    });
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await page.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    logLine(logs, "进入后台首页，准备打开 Language Management。");
    const clickedLanguage = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find((el) => {
        const text = (el.innerText || el.textContent || "").trim();
        const href = el.getAttribute("href") || "";
        return text === "Language Management" || href === "/language/index";
      });
      if (!link) return false;
      link.click();
      return true;
    });
    if (!clickedLanguage) {
      await page.goto("https://shop.ezvizlife.com/language/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    }
    await page.waitForTimeout(3500);
    logLine(logs, "已进入 Language Management：" + page.url());

    const clickedEdit = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll("[ng-click], a, button")].filter((el) => {
        const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const ngClick = el.getAttribute("ng-click") || "";
        const text = (el.innerText || el.textContent || "").trim();
        return visible && (/edit\s*\(\s*lang\.lang_code\s*\)/i.test(ngClick) || /^edit$/i.test(text));
      });
      const target = candidates[0];
      if (!target) return { ok: false, reason: "没有找到 edit(lang.lang_code) 元素" };
      target.click();
      return {
        ok: true,
        text: (target.innerText || target.textContent || "").trim(),
        ngClick: target.getAttribute("ng-click") || ""
      };
    });
    if (!clickedEdit.ok) throw new Error(clickedEdit.reason || "没有找到语言编辑入口。");
    logLine(logs, "已点击语言编辑入口：" + JSON.stringify(clickedEdit));
    await page.waitForTimeout(3000);

    const inputSelector = 'div[id^="rt_"] input[type="file"], input[type="file"][name="file"], input[type="file"][accept*=".xls"]';
    const inputCount = await page.locator(inputSelector).count().catch(() => 0);
    if (!inputCount) throw new Error("没有找到语言包上传 input[type=file]。");
    const fileInput = page.locator(inputSelector).nth(inputCount - 1);
    const inputInfo = await page.evaluate((selector) => {
      return [...document.querySelectorAll(selector)].map((input, index) => {
        const parent = input.parentElement;
        const rect = parent?.getBoundingClientRect?.() || input.getBoundingClientRect();
        return {
          index,
          name: input.getAttribute("name") || "",
          accept: input.getAttribute("accept") || "",
          parentId: parent?.id || "",
          parentStyle: parent?.getAttribute("style") || "",
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      });
    }, inputSelector).catch(() => []);
    logLine(logs, "语言包上传 input 数量：" + inputCount + " / " + JSON.stringify(inputInfo));
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 15000 }).catch(() => null);
    const clickedUpload = await page.evaluate((selector) => {
      const inputs = [...document.querySelectorAll(selector)];
      const input = inputs[inputs.length - 1];
      const parent = input?.parentElement;
      const label = parent?.querySelector("label") || parent || input;
      if (!label) return false;
      label.click();
      return true;
    }, inputSelector);
    let chooser = clickedUpload ? await chooserPromise : null;
    if (chooser) {
      await chooser.setFiles(filePath);
      logLine(logs, "已通过文件选择器选择语言包文件：" + filePath);
    } else {
      await fileInput.setInputFiles(filePath);
      logLine(logs, "文件选择器未弹出，已直接设置语言包文件：" + filePath);
    }
    await page.waitForTimeout(1500);

    const clickedConfirm = await page.evaluate(() => {
      const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const buttons = [...document.querySelectorAll(".modal button, .modal a, button, a")].filter(visible);
      const target = buttons.find((el) => /^(Confirm|OK|确定|确认)$/i.test((el.innerText || el.textContent || "").trim()))
        || buttons.find((el) => /btn-primary|btn-confirm/.test(String(el.className || "")));
      if (!target) return { ok: false, buttons: buttons.map((el) => (el.innerText || el.textContent || "").trim()).filter(Boolean).slice(0, 20) };
      target.click();
      return { ok: true, text: (target.innerText || target.textContent || "").trim(), cls: String(target.className || "") };
    });
    logLine(logs, "点击语言包弹窗确认按钮：" + JSON.stringify(clickedConfirm));
    if (!clickedConfirm.ok) throw new Error("没有找到语言包弹窗 Confirm 按钮。");
    await page.waitForTimeout(12000);

    const visibleText = await visibleTextSafe(page, 1800);
    return {
      currentUrl: page.url(),
      filePath,
      captured,
      visibleText
    };
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}

function inferLangCodeFromFile(file) {
  const name = path.basename(file?.originalname || file?.filename || "");
  const match = name.match(/^([a-z]{2}(?:-[A-Z]{2})?)/);
  return match ? match[1] : "";
}

async function submitLanguagePackageToBackend(body, files, logs) {
  const config = readCampaignConfig();
  const site = requireSingleCampaignSite(config, body);
  const file = files?.languagePackage?.[0];
  if (!file?.path || !fs.existsSync(file.path)) {
    throw new Error("请先选择语言包 Excel 文件。");
  }

  const langCode = String(body.langCode || "").trim() || inferLangCodeFromFile(file);
  if (!langCode) {
    throw new Error("请填写语言代码，例如 en-US；也可以用 en-US.xlsx 这种文件名自动识别。");
  }

  const context = await getShopContext();
  const page = await getOpenPage(context);
  page.setDefaultTimeout(30000);
  const backendPage = await ensureShopLoggedIn(page, {
    ...body,
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);

  logLine(logs, "进入 Language Management 建立语言后台登录态。");
  await backendPage.goto("https://shop.ezvizlife.com/language/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await backendPage.waitForTimeout(2500);

  const fileBuffer = fs.readFileSync(file.path);
  logLine(logs, "直接提交语言包上传接口：/language/upload，lang_code=" + langCode);
  const response = await backendPage.request.post("https://shop.ezvizlife.com/language/upload", {
    multipart: {
      lang_code: langCode,
      file: {
        name: path.basename(file.originalname || file.filename || file.path),
        mimeType: /\.xlsx$/i.test(file.originalname || file.filename || "") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel",
        buffer: fileBuffer
      }
    },
    timeout: 60000
  });

  const responseText = await response.text().catch(() => "");
  let responseJson = null;
  try {
    responseJson = JSON.parse(responseText);
  } catch {}
  if (!response.ok()) {
    throw new Error("语言包上传接口返回异常：" + response.status() + " " + responseText.slice(0, 300));
  }

  logLine(logs, "语言包上传接口返回状态：" + response.status());
  await backendPage.goto("https://shop.ezvizlife.com/language/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await backendPage.waitForTimeout(1500);

  return {
    mode: "direct-post",
    site,
    langCode,
    fileName: file.originalname || file.filename,
    uploadUrl: "https://shop.ezvizlife.com/language/upload",
    status: response.status(),
    response: responseJson || responseText.slice(0, 1000),
    currentUrl: backendPage.url()
  };
}

  return {
    probeLanguagePackageUpload,
    submitLanguagePackageToBackend
  };
}

module.exports = { createLanguagePackageFeature };
