"use strict";

const fs = require("fs");
const path = require("path");

const DTC_SITE_CODES = ["de", "fr", "es", "it", "nl"];
const DTC_MODEL_BY_SITE = {
  de: "Angebote",
  fr: "Promotion",
  es: "Venta Especial",
  it: "Offerte top",
  nl: "Mega deal"
};
const DTC_HEADLINE = "&nbsp;";
const DTC_LINK_BY_SITE = Object.fromEntries(
  DTC_SITE_CODES.map((siteCode) => [siteCode, `https://www.ezviz.com/${siteCode}/store/topic/hot-sale`])
);
const DTC_SITE_DIRECTORY_ALIASES = {
  de: ["de", "germany", "deutschland", "德国"],
  fr: ["fr", "france", "法国"],
  es: ["es", "spain", "espana", "españa", "西班牙"],
  it: ["it", "italy", "italia", "意大利"],
  nl: ["nl", "netherlands", "nederland", "holland", "荷兰"]
};
const DTC_MAX_ASSET_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|gif|webp)$/i;

function normalizeToken(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_").replace(/^_+|_+$/g, "");
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" })[extension]
    || "application/octet-stream";
}

function walkImageFiles(directory) {
  const results = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && IMAGE_EXTENSION.test(entry.name)) results.push(fullPath);
    }
  };
  visit(directory);
  return results.sort((left, right) => left.localeCompare(right, "en"));
}

function assetRole(relativePath) {
  const token = normalizeToken(relativePath);
  if (/(^|_)popup(_|$)/.test(token)) return "popupImage";
  if (/(^|_)banner(_|$)/.test(token) && /(^|_)(mobile|mob)(_|$)/.test(token)) return "bannerMobileImage";
  if (/(^|_)banner(_|$)/.test(token) && /(^|_)(pc|desktop)(_|$)/.test(token)) return "bannerPcImage";
  return "";
}

function findSiteDirectory(rootPath, siteCode) {
  const directories = fs.readdirSync(rootPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const aliases = new Set(DTC_SITE_DIRECTORY_ALIASES[siteCode].map(normalizeToken));
  return directories.find((entry) => aliases.has(normalizeToken(entry.name)))?.name || "";
}

function inspectDtcAssetRoot(assetRootPath, options = {}) {
  const rawRoot = String(assetRootPath || "").trim();
  if (!rawRoot) throw new Error("请填写 DTC 素材根路径。");
  if (!path.isAbsolute(rawRoot)) throw new Error("DTC 素材根路径必须是绝对路径。");
  const rootPath = path.normalize(rawRoot);
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error("DTC 素材根路径不存在或不是文件夹：" + rootPath);
  }
  const includeBanner = options.includeBanner !== false;
  const includePopup = options.includePopup !== false;
  const maxAssetBytes = Number(options.maxAssetBytes) > 0 ? Number(options.maxAssetBytes) : DTC_MAX_ASSET_BYTES;
  const sites = DTC_SITE_CODES.map((siteCode) => {
    const directoryName = findSiteDirectory(rootPath, siteCode);
    const directory = directoryName ? path.join(rootPath, directoryName) : "";
    const result = { siteCode, directory, status: "ready", files: {}, unrecognizedFiles: [], issues: [] };
    if (!directory) {
      result.status = "skipped";
      result.issues.push("未找到国家目录；可用目录名：" + DTC_SITE_DIRECTORY_ALIASES[siteCode].join(" / "));
      return result;
    }
    const candidates = { bannerPcImage: [], bannerMobileImage: [], popupImage: [] };
    for (const filePath of walkImageFiles(directory)) {
      const relativePath = path.relative(directory, filePath);
      const role = assetRole(relativePath);
      const stat = fs.statSync(filePath);
      const summary = { path: filePath, relativePath, size: stat.size, sizeMb: Number((stat.size / 1024 / 1024).toFixed(2)) };
      if (role) candidates[role].push(summary);
      else result.unrecognizedFiles.push(summary);
    }
    const requiredRoles = [includeBanner && "bannerPcImage", includePopup && "popupImage"].filter(Boolean);
    const usedRoles = [includeBanner && "bannerPcImage", includeBanner && "bannerMobileImage", includePopup && "popupImage"].filter(Boolean);
    for (const role of usedRoles) {
      const matches = candidates[role];
      if (matches.length === 1) result.files[role] = matches[0];
      else if (matches.length > 1) result.issues.push(`${role} 匹配到 ${matches.length} 个文件，请只保留一个：${matches.map((item) => item.relativePath).join("、")}`);
    }
    for (const role of requiredRoles) {
      if (!candidates[role].length) result.issues.push("缺少 " + role + " 素材。");
    }
    if (includeBanner && !candidates.bannerMobileImage.length && candidates.bannerPcImage.length === 1) {
      result.files.bannerMobileImage = { ...candidates.bannerPcImage[0], fallbackFromPc: true };
    }
    for (const [role, file] of Object.entries(result.files)) {
      if (file.size > maxAssetBytes) {
        result.issues.push(`${role} 超过单文件 ${(maxAssetBytes / 1024 / 1024).toFixed(0)} MB 上限：${file.relativePath}（${file.sizeMb} MB）`);
      }
    }
    if (result.issues.length) result.status = "skipped";
    return result;
  });
  return {
    mode: "dtc-local-assets",
    rootPath,
    maxAssetBytes,
    maxAssetMb: maxAssetBytes / 1024 / 1024,
    namingRule: "国家目录内使用 banner-pc、banner-mobile（可省略并回退 PC 图）、popup 作为文件名或子目录关键词。支持 jpg/jpeg/png/gif/webp。",
    readyCount: sites.filter((site) => site.status === "ready").length,
    skippedCount: sites.filter((site) => site.status === "skipped").length,
    sites
  };
}

function multerFilesFromInspection(site) {
  const wrap = (file) => file ? [{ path: file.path, originalname: path.basename(file.path), filename: path.basename(file.path), size: file.size, mimetype: mimeTypeFor(file.path) }] : undefined;
  return {
    bannerPcImage: wrap(site.files.bannerPcImage),
    bannerMobileImage: wrap(site.files.bannerMobileImage),
    popupImage: wrap(site.files.popupImage)
  };
}

function createDtcCampaign({ buildBannerPlan, buildPopupPlan, banner, popup, logLine }) {
  const boolOn = (value) => value !== false && value !== "0" && value !== "false";
  const bannerColor = (value) => String(value || "").trim().toLowerCase() === "black" ? "Black" : "White";
  const siteBody = (body, siteCode) => ({ ...(body || {}), sites: JSON.stringify([siteCode]) });
  const bannerBody = (body, siteCode) => ({
    ...siteBody(body, siteCode),
    headline: DTC_HEADLINE,
    link: DTC_LINK_BY_SITE[siteCode],
    slogan: "",
    model: DTC_MODEL_BY_SITE[siteCode],
    introduction: "",
    color: bannerColor(body.bannerColor),
    noMoreButton: true,
    openNewTab: true,
    publishAfterUpload: true,
    useUiBannerFlow: true,
    onlineAtUtc: body.onlineAtUtc || body.onlineAt || body.startAt,
    offlineAtUtc: body.offlineAtUtc || body.offlineAt || body.endAt
  });
  const popupBody = (body, siteCode) => ({
    ...siteBody(body, siteCode),
    name: DTC_MODEL_BY_SITE[siteCode],
    brief: "",
    whereToShow: "all page",
    frequency: "once per day",
    webUrl: DTC_LINK_BY_SITE[siteCode],
    mobileUrl: DTC_LINK_BY_SITE[siteCode],
    enableAfterSubmit: true,
    startAt: body.startAt || body.onlineAtUtc || body.onlineAt,
    endAt: body.endAt || body.offlineAtUtc || body.offlineAt
  });
  const bannerFiles = (files) => ({
    pcImage: files?.bannerPcImage || files?.pcImage,
    mobileImage: files?.bannerMobileImage || files?.mobileImage || files?.bannerPcImage || files?.pcImage
  });
  const popupFiles = (files) => ({ image: files?.popupImage || files?.image });
  const merge = (mode, plans) => ({
    mode,
    fixedSites: DTC_SITE_CODES,
    modelBySite: DTC_MODEL_BY_SITE,
    note: "DTC 专用：固定德法西意荷；标题、Model、Hot Sale 链接和发布参数固定，只读取本地素材路径与统一上线/下线时间。",
    items: plans.flatMap((plan) => plan.items || [])
  });

  function validateInput(body) {
    if (!String(body?.assetRootPath || "").trim()) throw new Error("请填写 DTC 本地素材根路径。");
    if (!String(body?.onlineAtUtc || body?.onlineAt || body?.startAt || "").trim()) throw new Error("请填写 DTC 统一上线时间。");
    if (!String(body?.offlineAtUtc || body?.offlineAt || body?.endAt || "").trim()) throw new Error("请填写 DTC 统一下线时间。");
  }

  function inspectAssets(body) {
    return inspectDtcAssetRoot(body?.assetRootPath, {
      includeBanner: boolOn(body?.includeBanner),
      includePopup: boolOn(body?.includePopup)
    });
  }

  function siteInputs(body, files) {
    return inspectAssets(body).sites.map((site) => ({ ...site, files: multerFilesFromInspection(site) }));
  }

  function buildPlan(body, files) {
    validateInput(body);
    const includeBanner = boolOn(body?.includeBanner);
    const includePopup = boolOn(body?.includePopup);
    const inputs = siteInputs(body, files);
    const readyInputs = inputs.filter((site) => site.status === "ready");
    const bannerPlans = includeBanner ? readyInputs.map((site) => buildBannerPlan(bannerBody(body, site.siteCode), bannerFiles(site.files))) : [];
    const popupPlans = includePopup ? readyInputs.map((site) => buildPopupPlan(popupBody(body, site.siteCode), popupFiles(site.files))) : [];
    return {
      mode: "dtc-plan",
      fixedSites: DTC_SITE_CODES,
      modelBySite: DTC_MODEL_BY_SITE,
      assetMode: "local-path",
      assetInspection: inspectAssets(body),
      banner: includeBanner ? merge("dtc-banner-plan", bannerPlans) : null,
      popup: includePopup ? merge("dtc-popup-plan", popupPlans) : null
    };
  }

  async function submit(body, files, logs = []) {
    validateInput(body);
    const includeBanner = boolOn(body?.includeBanner);
    const includePopup = boolOn(body?.includePopup);
    const results = [];
    const inputs = siteInputs(body, files);
    for (const input of inputs) {
      const siteCode = input.siteCode;
      const item = { siteCode, model: DTC_MODEL_BY_SITE[siteCode] };
      if (input.status !== "ready") {
        item.status = "skipped";
        item.reason = (input.issues || []).join("；") || "素材预检未通过。";
        logLine(logs, `DTC ${siteCode} 已跳过：${item.reason}`);
        results.push(item);
        continue;
      }
      if (includeBanner) {
        try {
          item.banner = await banner.submit(bannerBody(body, siteCode), bannerFiles(input.files), logs);
        } catch (error) {
          item.bannerError = error && error.message ? error.message : String(error);
          logLine(logs, `DTC ${siteCode} Banner 失败：${item.bannerError}`);
        }
      }
      if (includePopup) {
        try {
          item.popup = await popup.submit(popupBody(body, siteCode), popupFiles(input.files), logs);
        } catch (error) {
          item.popupError = error && error.message ? error.message : String(error);
          logLine(logs, `DTC ${siteCode} Popup 失败：${item.popupError}`);
        }
      }
      item.status = item.bannerError || item.popupError ? "failed" : "completed";
      results.push(item);
    }
    return { mode: "dtc-submit", plan: buildPlan(body, files), results };
  }

  return { inspectAssets, buildPlan, submit };
}

module.exports = {
  createDtcCampaign,
  inspectDtcAssetRoot,
  DTC_SITE_CODES,
  DTC_MODEL_BY_SITE,
  DTC_HEADLINE,
  DTC_LINK_BY_SITE,
  DTC_SITE_DIRECTORY_ALIASES,
  DTC_MAX_ASSET_BYTES
};
