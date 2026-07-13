function createPopupManagement(deps) {
  const { fs, path, logLine, normalizeBool, FS_UPLOAD_URL, NEW_SHOP_API_BASE, NEW_SHOP_POPUP_EDIT_URL,
    readCampaignConfig, requireSingleCampaignSite, getShopContext, getOpenPage,
    ensureShopLoggedIn, credentialDomainForSite } = deps;

  async function fillPopupTime(page, selector, value) {
    if (!value) return;
    await page.locator(selector).first().evaluate((el, nextValue) => {
      el.removeAttribute("readonly");
      el.value = nextValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, String(value));
  }

  function normalizePopupConfigType(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "all";
    if (["index", "home", "home page", "homepage"].includes(text)) return "index";
    if (["all", "all page", "allpage"].includes(text)) return "all";
    if (["custom", "custom page", "custompage"].includes(text)) return "custom";
    return text;
  }

  function normalizePopupFrequency(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return 2;
    if (text === "1" || text.includes("only") || text.includes("once only")) return 1;
    if (text === "2" || text.includes("day")) return 2;
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 2;
  }

  function newShopApiSucceeded(data) {
    const code = Number(data?.code);
    return data?.success === true || data?.status === true || code === 0 || code === 200;
  }

  async function newShopApiPost(page, apiPath, data) {
    const response = await page.request.post(NEW_SHOP_API_BASE + apiPath, {
      data,
      headers: {
        "operator-from": "shop"
      }
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("new-shop 接口返回不是 JSON：" + text.slice(0, 300));
    }
    if (!response.ok() || !newShopApiSucceeded(json)) {
      throw new Error("new-shop 接口失败 " + apiPath + "：" + (json?.msg || json?.message || text.slice(0, 300)));
    }
    return json;
  }

  async function uploadPopupImageDirect(page, file, logs) {
    if (!file?.path || !fs.existsSync(file.path)) throw new Error("缺少 Popup 图片文件。");
    const tokenResult = await newShopApiPost(page, "/system/get-fs-token", {});
    const token = tokenResult?.data?.token;
    const appid = tokenResult?.data?.appid;
    if (!token || !appid) {
      throw new Error("没有从 new-shop 取到 Popup 图片上传 token。");
    }

    const form = new FormData();
    form.append("flag", "lottery");
    form.append("app", "mall");
    form.append("token", token);
    form.append("appid", appid);
    form.append("quality", "100");
    form.append("type", "file");
    const blob = new Blob([fs.readFileSync(file.path)], { type: file.mimetype || "application/octet-stream" });
    form.append("file", blob, file.originalname || path.basename(file.path));

    const response = await fetch(FS_UPLOAD_URL, { method: "POST", body: form });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Popup 图片上传返回不是 JSON：" + text.slice(0, 300));
    }
    if (!response.ok || !data?.status || !data?.uri) {
      throw new Error("Popup 图片上传失败：" + (data?.msg || text.slice(0, 300)));
    }
    logLine(logs, "Popup 图片已上传到文件服务：" + data.uri);
    return data.uri;
  }

  async function findPopupConfigByName(page, popupName) {
    const result = await newShopApiPost(page, "/shop-config/list", {
      page: 1,
      pageSize: 50,
      moduleType: "popup"
    });
    const rows = Array.isArray(result?.data?.list)
      ? result.data.list
      : Array.isArray(result?.data?.records)
        ? result.data.records
        : Array.isArray(result?.data)
          ? result.data
          : [];
    return rows.find((row) => {
      const content = row?.content || {};
      return content.popupName === popupName || row.popupName === popupName || row.name === popupName;
    }) || null;
  }

  function popupRowsFromListResult(result) {
    return Array.isArray(result?.data?.list)
      ? result.data.list
      : Array.isArray(result?.data?.records)
        ? result.data.records
        : Array.isArray(result?.data?.rows)
          ? result.data.rows
          : Array.isArray(result?.data)
            ? result.data
            : [];
  }

  async function listPopupConfigs(page) {
    const result = await newShopApiPost(page, "/shop-config/list", {
      page: 1,
      pageSize: 50,
      moduleType: "popup"
    });
    return popupRowsFromListResult(result);
  }

  function parsePopupContent(row) {
    const content = row?.content;
    if (content && typeof content === "object") return content;
    if (typeof content === "string" && content.trim()) {
      try {
        return JSON.parse(content);
      } catch {}
    }
    return row || {};
  }

  function popupConfigNo(row) {
    return row?.configNo || row?.config_no || row?.config_no_id || row?.id || "";
  }

  function popupNameOf(row) {
    const content = parsePopupContent(row);
    return content.popupName || row?.popupName || row?.name || "";
  }

  function popupEndTimeOf(row) {
    const content = parsePopupContent(row);
    return content.endTime || content.popupEndTime || row?.endTime || row?.popupEndTime || "";
  }

  function popupRowIsEnabled(row) {
    return row?.isValid === true || row?.isValid === 1 || row?.isValid === "1" || row?.valid === true;
  }

  function parsePopupDateTime(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const normalized = text.replace(/\//g, "-").replace("T", " ");
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
      );
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async function verifyPopupDeleted(page, configNo) {
    const rows = await listPopupConfigs(page);
    return !rows.some((row) => String(popupConfigNo(row)) === String(configNo));
  }

  async function clearExpiredPopupSlot(page, logs, now = new Date()) {
    const rows = (await listPopupConfigs(page)).filter((row) => popupConfigNo(row));
    if (!rows.length) {
      logLine(logs, "Popup 资源位检查：当前没有旧 Popup，可以创建新资源位。");
      return { action: "none", previous: null };
    }

    const previous = rows.find((row) => popupRowIsEnabled(row)) || rows[0];
    const configNo = popupConfigNo(previous);
    const name = popupNameOf(previous) || "未命名 Popup";
    const endTimeText = popupEndTimeOf(previous);
    const endTime = parsePopupDateTime(endTimeText);

    if (!endTime) {
      throw new Error("Popup 资源位已有配置，但无法识别旧资源位下线时间，已停止新建。旧 Popup：" + name + "，编号：" + configNo + "，下线时间：" + (endTimeText || "空"));
    }

    const previousInfo = { configNo, name, endTime: endTimeText };
    if (endTime.getTime() >= now.getTime()) {
      throw new Error("Popup 资源位已有未过期配置，已停止新建。旧 Popup：" + name + "，编号：" + configNo + "，下线时间：" + endTimeText);
    }

    logLine(logs, "Popup 资源位检查：旧 Popup 已过期，准备删除。旧 Popup：" + name + "，编号：" + configNo + "，下线时间：" + endTimeText);
    await newShopApiPost(page, "/shop-config/delete", {
      configNo,
      moduleType: "popup"
    });

    if (!(await verifyPopupDeleted(page, configNo))) {
      throw new Error("旧 Popup 删除请求已发送，但列表中仍能查到该资源位，已停止新建。旧 Popup：" + name + "，编号：" + configNo);
    }

    logLine(logs, "旧 Popup 已删除，资源位已释放：" + configNo);
    return { action: "deleted-expired", previous: previousInfo };
  }

  async function submitPopupDirectToBackend(body, files, logs) {
    const config = readCampaignConfig();
    const site = requireSingleCampaignSite(config, body);
    const plan = buildPopupPlan({ ...body, sites: JSON.stringify([site.siteCode]) }, files);
    const item = plan.items[0];
    const fields = item.fields;
    const image = files?.image?.[0];
    if (!image) throw new Error("实际提交 Popup 需要上传图片。");

    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(25000);

    page = await ensureShopLoggedIn(page, { ...body, credentialDomain: credentialDomainForSite(site), credentialGroup: "Website" }, logs);
    logLine(logs, "打开 Popup 新建页建立后台登录态：" + NEW_SHOP_POPUP_EDIT_URL);
    await page.goto(NEW_SHOP_POPUP_EDIT_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const slotCleanup = await clearExpiredPopupSlot(page, logs);
    const popupImage = await uploadPopupImageDirect(page, image, logs);
    const webUrl = item.localizedWebUrlSuggestion || item.webUrl;
    const mobileUrl = item.localizedMobileUrlSuggestion || item.mobileUrl;
    const createPayload = {
      moduleType: "popup",
      configType: normalizePopupConfigType(fields.whereToShow),
      content: {
        popupName: fields.name,
        popupBrief: fields.brief,
        startTime: normalizeBannerDateTime(fields.startAt),
        endTime: normalizeBannerDateTime(fields.endAt),
        popupFrequency: normalizePopupFrequency(fields.frequency),
        popupWebUrl: webUrl,
        popupMobileUrl: mobileUrl,
        popupType: "image",
        popupImage
      }
    };

    logLine(logs, "直接提交 Popup 配置：" + fields.name);
    const createResult = await newShopApiPost(page, "/shop-config/create", createPayload);
    let configNo = createResult?.data?.configNo || createResult?.data?.config_no || createResult?.data?.config_no_id || "";
    let createdRow = null;
    if (!configNo) {
      createdRow = await findPopupConfigByName(page, fields.name);
      configNo = createdRow?.configNo || createdRow?.config_no || "";
    }
    logLine(logs, "Popup 配置已创建" + (configNo ? "，编号：" + configNo : "，但接口未返回编号"));

    if (fields.enableAfterSubmit) {
      if (!configNo) throw new Error("Popup 已创建，但未能反查到 configNo，无法启用。");
      await newShopApiPost(page, "/shop-config/switch", {
        configNo,
        isValid: true,
        moduleType: "popup"
      });
      logLine(logs, "Popup 已通过接口启用：" + configNo);
    }

    return {
      mode: "direct-post",
      site,
      name: fields.name,
      configType: createPayload.configType,
      frequency: createPayload.content.popupFrequency,
      webUrl,
      mobileUrl,
      image: popupImage,
      configNo,
      enabled: fields.enableAfterSubmit,
      slotCleanup,
      currentUrl: page.url()
    };
  }

  async function submitPopupViaUi(body, files, logs) {
    const config = readCampaignConfig();
    const site = requireSingleCampaignSite(config, body);
    const plan = buildPopupPlan({ ...body, sites: JSON.stringify([site.siteCode]) }, files);
    const item = plan.items[0];
    const fields = item.fields;
    const image = files?.image?.[0];
    if (!image) throw new Error("实际提交 Popup 需要上传图片。");

    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(25000);

    const editUrl = "https://new-shop.ezvizlife.com/popup/edit";
    page = await ensureShopLoggedIn(page, { ...body, credentialDomain: credentialDomainForSite(site), credentialGroup: "Website" }, logs);
    logLine(logs, "打开 Popup 新建页：" + editUrl);
    await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);

    logLine(logs, "填写 Popup 字段。");
    await page.locator('input[placeholder*="Popup Name" i], input[name*="name" i]').first().fill(fields.name);
    await page.locator('textarea[placeholder*="Popup Brief" i], textarea[name*="brief" i]').first().fill(fields.brief);
    await selectByVisibleTextOrValue(page, "select", fields.whereToShow).catch(() => {});
    await fillPopupTime(page, "#startTime", fields.startAt);
    await fillPopupTime(page, "#endTime", fields.endAt);
    await page.locator('textarea[placeholder*="Web Url" i], textarea[name*="web" i], input[name*="web" i]').first().fill(item.localizedWebUrlSuggestion || item.webUrl);
    await page.locator('textarea[placeholder*="Mobile Url" i], textarea[name*="mobile" i], input[name*="mobile" i]').first().fill(item.localizedMobileUrlSuggestion || item.mobileUrl);
    await selectByVisibleTextOrValue(page, "select", fields.frequency).catch(() => {});

    logLine(logs, "上传 Popup 图片。");
    await page.locator('input[type="file"]').first().setInputFiles(image.path);
    await page.waitForTimeout(8000);

    logLine(logs, "提交 Popup。");
    await clickByText(page, /^Submit$/i).catch(() => clickByText(page, "提交"));
    await page.waitForTimeout(6000);

    if (fields.enableAfterSubmit) {
      logLine(logs, "尝试在列表启用 Popup。");
      await page.goto("https://new-shop.ezvizlife.com/popup/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await page.evaluate((name) => {
        const row = [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(name));
        const enable = [...(row?.querySelectorAll("a,button,span") || [])].find((el) => /Enable/i.test(el.innerText || el.textContent || ""));
        enable?.click();
      }, fields.name);
      await page.waitForTimeout(4000);
    }

    return { site, webUrl: item.localizedWebUrlSuggestion || item.webUrl, mobileUrl: item.localizedMobileUrlSuggestion || item.mobileUrl, currentUrl: page.url() };
  }

  async function submitPopupToBackend(body, files, logs) {
    if (normalizeBool(body?.useUiPopupFlow)) {
      logLine(logs, "使用旧版页面点击方式提交 Popup。");
      return submitPopupViaUi(body, files, logs);
    }
    logLine(logs, "使用快路径提交 Popup：Playwright 登录定位 + 接口上传/创建/启用。");
    return submitPopupDirectToBackend(body, files, logs);
  }

  return { submit: submitPopupToBackend };
}

module.exports = { createPopupManagement };
