const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { createWtbFeature } = require("./src/server/features/wtb");
const { registerWtbRoutes } = require("./src/server/routes/wtb-routes");
const { createLanguagePackageFeature } = require("./src/server/features/language-package");
const { registerLanguagePackageRoutes } = require("./src/server/routes/language-package-routes");
const { createEcadminPlatformFeature } = require("./src/server/features/ecadmin-platform");
const { registerEcadminPlatformRoutes } = require("./src/server/routes/ecadmin-platform-routes");
const { createEzvizSiteAuditFeature } = require("./src/server/features/ezviz-site-audit");
const { registerEzvizSiteAuditRoutes } = require("./src/server/features/ezviz-site-audit/routes");
const { createEzvizSiteAuditScheduler, TWO_DAYS_MS } = require("./src/server/features/ezviz-site-audit/scheduler");
const { createShopCredentials } = require("./src/server/features/shop-credentials");
const { createProductManagement } = require("./src/server/features/product-management");
const { createBannerManagement } = require("./src/server/features/banner-management");
const { createPopupManagement } = require("./src/server/features/popup-management");
const { createBrowserAuth } = require("./src/server/features/browser-auth");
const { createSpecificationTranslationFeature } = require("./src/server/features/specification-translation");
const { registerSpecificationTranslationRoutes } = require("./src/server/routes/specification-translation-routes");
const { registerCampaignRoutes } = require("./src/server/routes/campaign-routes");
const { registerAssetUploadRoutes } = require("./src/server/routes/asset-upload-routes");
const { createTdkManagement } = require("./src/server/features/tdk-management");
const { registerTdkRoutes } = require("./src/server/routes/tdk-routes");
const { createProductReplacementFeature } = require("./src/server/features/product-replacement");
const { registerProductReplacementRoutes } = require("./src/server/routes/product-replacement-routes");
const { createCampaignLinkInspector } = require("./src/server/features/campaign-link-inspector");

const app = express();
const PORT = Number(process.env.PORT || 3217);
const ROOT = __dirname;
const DESKTOP_ROOT = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Desktop");
const WEB_ROOT = path.join(ROOT, "办公软件", "111");
const UPLOAD_ROOT = path.join(ROOT, "runtime_uploads");
const PROFILE_DIR = path.join(ROOT, ".pw-ecadmin-auto-profile");
const SHOP_PROFILE_DIR = path.join(ROOT, ".pw-ezviz-shop-profile");
const CREDENTIAL_ROOT = path.join(ROOT, "credentials");
const CAMPAIGN_CONFIG_PATH = path.resolve(process.env.EZVIZ_CAMPAIGN_CONFIG || path.join(ROOT, "config", "banner-check.json"));
const CAMPAIGN_AUDIT_SCRIPT = path.join(ROOT, "scripts", "check-homepage-campaign-rendered.mjs");
const BANNER_CONFIG_DOC = path.join(ROOT, "docs", "homepage-banner-config.md");
const POPUP_CONFIG_DOC = path.join(ROOT, "docs", "popup-upload.md");
const CREDENTIAL_WORKBOOK_NAMES = ["网站账号密码", "账号密码"];
const SHOP_DASHBOARD_URL = "https://shop.ezvizlife.com/templates/index";
const SHOP_LOGIN_URL = "https://usauth.ezvizlife.com/signIn?from=ezviz_mall_global_gateway&r=1726447618240890209&returnUrl=www.ezvizlife.com&host=";
const SHOP_LOGOUT_URL = "https://sgpwww.ezvizlife.com/login/logout.html";
const NEW_SHOP_POPUP_EDIT_URL = "https://new-shop.ezvizlife.com/popup/edit";
const NEW_SHOP_POPUP_INDEX_URL = "https://new-shop.ezvizlife.com/popup/index";
const NEW_SHOP_TDK_INDEX_URL = "https://new-shop.ezvizlife.com/tdk/index";
const NEW_SHOP_API_BASE = "https://sgpshop-api.ezvizlife.com";
const FS_UPLOAD_URL = "https://fs.ezvizlife.com/upload.php";
const SHOP_WTB_INDEX_URL = "https://shop.ezvizlife.com/whereToBuy/index";
const DEFAULT_UTM_POLICIES = {
  banner: {
    sourceTemplate: "{siteCode}_banner",
    mediumTemplate: "banner{position}",
    campaignTemplate: "web_{siteCode}_banner"
  },
  popup: {
    sourceTemplate: "{siteCode}_popup",
    mediumTemplate: "popup",
    campaignTemplate: "web_{siteCode}_popup"
  }
};

const ezvizSiteAuditFeature = createEzvizSiteAuditFeature({ chromium });
const ezvizSiteAuditScheduler = createEzvizSiteAuditScheduler({
  feature: ezvizSiteAuditFeature,
  intervalMs: Number(process.env.EZVIZ_SITE_AUDIT_INTERVAL_MS) || TWO_DAYS_MS,
  sampleSize: Number(process.env.EZVIZ_SITE_AUDIT_SAMPLE_SIZE) || 5,
  outputDir: path.join(ROOT, "outputs", "ezviz-site-audit"),
  statePath: path.join(ROOT, "runtime", "ezviz-site-audit-schedule.json")
});
const shopCredentials = createShopCredentials({
  desktopRoot: DESKTOP_ROOT,
  additionalRoots: [CREDENTIAL_ROOT],
  workbookNames: CREDENTIAL_WORKBOOK_NAMES
});
const credentialDomainForSite = shopCredentials.domainForSite;

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(UPLOAD_ROOT, String(Date.now()));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      cb(null, path.basename(Buffer.from(file.originalname, "latin1").toString("utf8")));
    }
  })
});

const SHAREPOINT_DEFAULTS = {
  hostname: "vsshpd01:81",
  sitePath: "/sites/EZVIZ MKT",
  translationRoot: "Shared Documents/05_Website/00_Product Translation",
  materialRoot: "Shared Documents/05_Website"
};

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.get("/", (req, res) => {
  res.redirect("/inline-packager.html");
});
app.use(express.static(WEB_ROOT));

function logLine(logs, message) {
  logs.push(message);
}

function normalizeBool(value) {
  return value === true || value === "1" || value === "true" || value === "on";
}

const productManagement = createProductManagement({ logLine, normalizeBool });
const browserAuth = createBrowserAuth({
  chromium, PROFILE_DIR, SHOP_PROFILE_DIR, SHOP_DASHBOARD_URL, SHOP_LOGIN_URL,
  SHOP_LOGOUT_URL, shopCredentials, logLine, normalizeBool
});
const bannerManagement = createBannerManagement({
  fs, path, logLine, normalizeBool, SHOP_DASHBOARD_URL,
  readCampaignConfig, getShopContext: browserAuth.getShopContext,
  getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn, credentialDomainForSite,
  selectedCampaignSites, parseSelectedSites,
  buildCampaignUrl, auditAndRepairBannerAfterSubmit
});
const requireSingleCampaignSite = (...args) => bannerManagement.requireSingleSite(...args);
const popupManagement = createPopupManagement({
  fs, path, logLine, normalizeBool, FS_UPLOAD_URL, NEW_SHOP_API_BASE, NEW_SHOP_POPUP_EDIT_URL,
  readCampaignConfig, requireSingleCampaignSite,
  getShopContext: browserAuth.getShopContext, getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn, credentialDomainForSite
});
const specificationTranslationFeature = createSpecificationTranslationFeature({
  logLine,
  shopCredentials
});
const campaignLinkInspector = createCampaignLinkInspector({ chromium });

function readCampaignConfig() {
  if (!fs.existsSync(CAMPAIGN_CONFIG_PATH)) {
    throw new Error("未找到项目内巡查配置：" + CAMPAIGN_CONFIG_PATH);
  }
  return JSON.parse(fs.readFileSync(CAMPAIGN_CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function getCampaignSites(config) {
  return (config.sites || []).map((site) => ({
    name: site.name,
    url: site.url,
    siteCode: site.siteCode,
    campaignCode: site.campaignCode || (site.siteCode === "inter" ? "hq" : site.siteCode),
    enabled: site.enabled !== false
  }));
}

function parseSelectedSites(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function selectedCampaignSites(config, selectedCodes) {
  const sites = getCampaignSites(config);
  if (!selectedCodes.length) return [];
  const selectedSet = new Set(selectedCodes);
  return sites.filter((site) => selectedSet.has(site.siteCode));
}

function isInternalCampaignUrl(rawUrl, config) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (config.internalDomains || []).some((domain) => {
      const normalized = String(domain).toLowerCase();
      return host === normalized || host.endsWith("." + normalized);
    });
  } catch {
    return false;
  }
}

function fillCampaignTemplate(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => values[key] == null ? "" : String(values[key]));
}

function buildCampaignUrl(rawUrl, options, config) {
  const value = String(rawUrl || "").trim();
  if (!value || !isInternalCampaignUrl(value, config)) return value;

  const placement = options.placement || "banner";
  const policy = (config.utmPolicies && config.utmPolicies[placement])
    || config.utmPolicy
    || DEFAULT_UTM_POLICIES[placement]
    || {};
  const parsed = new URL(value);
  const values = {
    siteCode: options.siteCode || "",
    position: options.position || ""
  };

  parsed.searchParams.set("utm_source", fillCampaignTemplate(policy.sourceTemplate, values));
  parsed.searchParams.set("utm_medium", fillCampaignTemplate(policy.mediumTemplate, values));
  parsed.searchParams.set("utm_campaign", fillCampaignTemplate(policy.campaignTemplate, values));
  return parsed.toString();
}

function localizedCampaignUrlSuggestion(rawUrl, site, options, config) {
  const value = String(rawUrl || "").trim();
  if (!value || !site || site.siteCode === "hq" || !isInternalCampaignUrl(value, config)) return "";

  try {
    const parsed = new URL(value);
    const siteUrl = new URL(site.url);
    const sitePrefix = siteUrl.pathname.replace(/\/+$/, "");
    if (!sitePrefix || sitePrefix === "/" || parsed.pathname === sitePrefix || parsed.pathname.startsWith(sitePrefix + "/")) {
      return "";
    }

    const suggested = new URL(parsed.toString());
    suggested.pathname = sitePrefix + (parsed.pathname.startsWith("/") ? parsed.pathname : "/" + parsed.pathname);
    return buildCampaignUrl(suggested.toString(), options, config);
  } catch {
    return "";
  }
}

function fileSummary(file) {
  if (!file) return null;
  return {
    name: file.originalname || file.filename,
    localPath: file.path,
    size: file.size
  };
}

function buildBannerPlan(body, files) {
  const config = readCampaignConfig();
  const sites = selectedCampaignSites(config, parseSelectedSites(body.sites));
  if (!sites.length) throw new Error("请至少勾选一个站点。");

  const rawLink = String(body.link || "").trim();
  const pcImage = files?.pcImage?.[0] || null;
  const mobileImage = files?.mobileImage?.[0] || null;
  const commonFields = {
    headline: String(body.headline || "").trim(),
    slogan: String(body.slogan || "").trim(),
    model: String(body.model || "").trim(),
    introduction: String(body.introduction || "").trim(),
    color: String(body.color || "White"),
    onlineAtUtc: String(body.onlineAtUtc || "").trim(),
    offlineAtUtc: String(body.offlineAtUtc || "").trim(),
    noMoreButton: normalizeBool(body.noMoreButton),
    openNewTab: normalizeBool(body.openNewTab),
    publishAfterUpload: normalizeBool(body.publishAfterUpload)
  };

  return {
    mode: "banner-plan",
    source: {
      config: CAMPAIGN_CONFIG_PATH,
      doc: BANNER_CONFIG_DOC
    },
    note: "此接口仅生成 Banner 清单和 UTM 数据，不提交后台。需要实际保存到 shop 后台时，请使用 /api/campaign/banner-submit 或页面里的“执行 Banner 后台配置”。",
    selectedSites: sites,
    files: {
      pcImage: fileSummary(pcImage),
      mobileImage: fileSummary(mobileImage)
    },
    generatedUrls: Object.fromEntries(sites.map((site) => {
      const position = bannerManagement.targetPosition(site);
      const options = { siteCode: site.campaignCode || site.siteCode, placement: "banner", position };
      return [site.siteCode, buildCampaignUrl(rawLink, options, config)];
    })),
    items: sites.map((site) => {
      const position = bannerManagement.targetPosition(site);
      const options = { siteCode: site.campaignCode || site.siteCode, placement: "banner", position };
      const url = buildCampaignUrl(rawLink, options, config);
      const localizedUrl = localizedCampaignUrlSuggestion(rawLink, site, options, config);
      return {
        site,
        url,
        localizedUrlSuggestion: localizedUrl,
        warning: localizedUrl ? `当前链接没有 ${site.url.replace("https://www.ezviz.com", "")} 站点路径；如该站点需要本地化路径，可使用 localizedUrlSuggestion。` : "",
        rawUrl: rawLink,
        fields: { ...commonFields, position: String(position) },
        backend: {
          listUrl: "https://shop.ezvizlife.com/pages/index",
          editorPage: "Homepage / web.index.index4",
          widget: ".home-banner.js-widget-wrapper",
          uploadTarget: "PC image first file input, Mobile image second file input"
        }
      };
    })
  };
}

function buildPopupPlan(body, files) {
  const config = readCampaignConfig();
  const sites = selectedCampaignSites(config, parseSelectedSites(body.sites));
  if (!sites.length) throw new Error("请至少勾选一个站点。");

  const rawWebUrl = String(body.webUrl || "").trim();
  const rawMobileUrl = String(body.mobileUrl || body.webUrl || "").trim();
  const popupImage = files?.image?.[0] || null;
  const commonFields = {
    name: String(body.name || "").trim(),
    brief: String(body.brief || "").trim(),
    whereToShow: String(body.whereToShow || "all page"),
    frequency: String(body.frequency || "once per day"),
    startAt: String(body.startAt || "").trim(),
    endAt: String(body.endAt || "").trim(),
    enableAfterSubmit: normalizeBool(body.enableAfterSubmit)
  };

  return {
    mode: "popup-plan",
    source: {
      config: CAMPAIGN_CONFIG_PATH,
      doc: POPUP_CONFIG_DOC
    },
    note: "此接口仅生成 Popup 清单和 UTM 数据，不提交后台。需要实际保存到 new-shop 后台时，请使用 /api/campaign/popup-submit 或页面里的“执行 Popup 后台配置”。",
    selectedSites: sites,
    files: {
      image: fileSummary(popupImage)
    },
    generatedUrls: Object.fromEntries(sites.map((site) => {
      const options = { siteCode: site.campaignCode || site.siteCode, placement: "popup" };
      return [site.siteCode, buildCampaignUrl(rawWebUrl, options, config)];
    })),
    items: sites.map((site) => {
      const options = { siteCode: site.campaignCode || site.siteCode, placement: "popup" };
      const webUrl = buildCampaignUrl(rawWebUrl, options, config);
      const mobileUrl = buildCampaignUrl(rawMobileUrl, options, config);
      const localizedWebUrl = localizedCampaignUrlSuggestion(rawWebUrl, site, options, config);
      const localizedMobileUrl = localizedCampaignUrlSuggestion(rawMobileUrl, site, options, config);
      return {
        site,
        webUrl,
        mobileUrl,
        localizedWebUrlSuggestion: localizedWebUrl,
        localizedMobileUrlSuggestion: localizedMobileUrl,
        warning: localizedWebUrl || localizedMobileUrl ? `当前链接没有 ${site.url.replace("https://www.ezviz.com", "")} 站点路径；如该站点需要本地化路径，可使用 localizedUrlSuggestion。` : "",
        rawWebUrl,
        rawMobileUrl,
        fields: commonFields,
        backend: {
          listUrl: "https://new-shop.ezvizlife.com/popup/index",
          editUrl: "https://new-shop.ezvizlife.com/popup/edit",
          popupType: "Image"
        }
      };
    })
  };
}

const campaignAuditJobs = new Map();

function createCampaignAuditInvocation(body) {
  const config = readCampaignConfig();
  const selectedCodes = parseSelectedSites(body.sites);
  const sites = selectedCampaignSites(config, selectedCodes);
  if (!sites.length) throw new Error("请至少勾选一个站点。");
  if (!fs.existsSync(CAMPAIGN_AUDIT_SCRIPT)) {
    throw new Error("未找到项目内巡查脚本：" + CAMPAIGN_AUDIT_SCRIPT);
  }

  const tempDir = path.join(UPLOAD_ROOT, "campaign-audit");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, "banner-check-" + Date.now() + ".json");
  const selectedSet = new Set(sites.map((site) => site.siteCode));
  const scopedConfig = {
    ...config,
    sites: (config.sites || [])
      .filter((site) => selectedSet.has(site.siteCode))
      .map((site) => ({ ...site, enabled: true }))
  };
  fs.writeFileSync(tempConfigPath, JSON.stringify(scopedConfig, null, 2), "utf8");

  const placement = String(body.placement || "banner");
  const popupWaitMs = String(body.popupWaitMs || config.rendered?.popupWaitMs || 5000);
  const args = [CAMPAIGN_AUDIT_SCRIPT, "--config", tempConfigPath, "--popup-wait-ms", popupWaitMs];
  if (placement && placement !== "all") args.push("--placement", placement);
  return { args, sites, tempConfigPath };
}

function runCampaignAudit(body) {
  const invocation = createCampaignAuditInvocation(body);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, invocation.args, {
      cwd: ROOT,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += "\n巡查超时，已停止。";
    }, 10 * 60 * 1000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        selectedSites: invocation.sites,
        tempConfigPath: invocation.tempConfigPath,
        stdout,
        stderr
      });
    });
  });
}

function appendCampaignAuditJobChunk(job, stream, chunk) {
  const text = chunk.toString();
  if (stream === "stdout") job.stdout += text;
  if (stream === "stderr") job.stderr += text;
  const bufferKey = stream + "Buffer";
  job[bufferKey] = (job[bufferKey] || "") + text;
  const lines = job[bufferKey].split(/\r?\n/);
  job[bufferKey] = lines.pop() || "";
  for (const line of lines) {
    const message = line.trim();
    if (!message) continue;
    job.logs.push({ at: new Date().toISOString(), stream, message });
    if (job.logs.length > 1000) job.logs.shift();
  }
}

function startCampaignAuditJob(body) {
  const invocation = createCampaignAuditInvocation(body);
  const jobId = "audit-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const job = {
    id: jobId,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    selectedSites: invocation.sites,
    tempConfigPath: invocation.tempConfigPath,
    stdout: "",
    stderr: "",
    stdoutBuffer: "",
    stderrBuffer: "",
    logs: [],
    result: null,
    error: null
  };
  campaignAuditJobs.set(jobId, job);
  job.logs.push({
    at: job.startedAt,
    stream: "system",
    message: "巡查任务已启动，共 " + invocation.sites.length + " 个站点。"
  });

  const child = spawn(process.execPath, invocation.args, {
    cwd: ROOT,
    windowsHide: true
  });
  job.child = child;
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    appendCampaignAuditJobChunk(job, "stderr", "\n巡查超时，已停止。\n");
  }, 10 * 60 * 1000);

  child.stdout.on("data", (chunk) => appendCampaignAuditJobChunk(job, "stdout", chunk));
  child.stderr.on("data", (chunk) => appendCampaignAuditJobChunk(job, "stderr", chunk));
  child.on("error", (error) => {
    job.status = "failed";
    job.error = error && error.message ? error.message : String(error);
    job.finishedAt = new Date().toISOString();
    job.logs.push({ at: job.finishedAt, stream: "system", message: "巡查启动失败：" + job.error });
    clearTimeout(timer);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (job.stdoutBuffer) appendCampaignAuditJobChunk(job, "stdout", "\n");
    if (job.stderrBuffer) appendCampaignAuditJobChunk(job, "stderr", "\n");
    const result = {
      ok: code === 0,
      code,
      selectedSites: invocation.sites,
      tempConfigPath: invocation.tempConfigPath,
      stdout: job.stdout,
      stderr: job.stderr
    };
    result.issues = campaignAuditIssues(result);
    job.result = result;
    job.status = code === 0 ? "completed" : "failed";
    job.finishedAt = new Date().toISOString();
    job.logs.push({
      at: job.finishedAt,
      stream: "system",
      message: code === 0 ? "巡查完成。" : "巡查失败，退出码：" + code
    });
    setTimeout(() => campaignAuditJobs.delete(jobId), 30 * 60 * 1000);
  });

  return job;
}

function campaignAuditReportPath(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /^[A-Za-z]:\\.*homepage-campaign-rendered-.*\.json$/i.test(line.replace(/^- /, "")))?.replace(/^- /, "") || "";
}

function loadCampaignAuditReport(auditResult) {
  const reportPath = campaignAuditReportPath(auditResult?.stdout || "");
  if (!reportPath || !fs.existsSync(reportPath)) return null;
  try {
    return {
      path: reportPath,
      report: JSON.parse(fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, ""))
    };
  } catch {
    return null;
  }
}

function campaignAuditIssues(auditResult) {
  const loaded = loadCampaignAuditReport(auditResult);
  const report = loaded?.report || null;
  const links = [];
  for (const site of report?.sites || []) {
    for (const link of site.links || []) {
      links.push({
        site: site.site,
        siteCode: site.siteCode,
        homepage: site.homepage,
        placement: link.placement,
        position: link.position,
        text: link.text,
        url: link.resolvedUrl || link.href,
        status: link.status,
        ok: link.ok,
        internal: link.internal,
        utmValid: link.utmValid,
        utmProblems: link.utmProblems || [],
        correctedUrl: link.correctedUrl || "",
        error: link.error || ""
      });
    }
  }
  const brokenLinks = links.filter((link) => link.ok === false || (link.status && (link.status < 200 || link.status >= 400)));
  const invalidUtmLinks = links.filter((link) => link.internal && link.utmValid === false);
  return {
    reportPath: loaded?.path || "",
    summary: report?.summary || null,
    brokenLinks,
    invalidUtmLinks
  };
}

async function auditAndRepairBannerAfterSubmit(site, body, logs) {
  logLine(logs, "Banner 已提交，开始巡查当前站点链接和 UTM。");
  const firstAudit = await runCampaignAudit({
    sites: JSON.stringify([site.siteCode]),
    placement: "banner",
    popupWaitMs: body.popupWaitMs || "5000"
  });
  const firstIssues = campaignAuditIssues(firstAudit);
  logLine(logs, "首次巡查完成：坏链 " + firstIssues.brokenLinks.length + " 条，UTM 问题 " + firstIssues.invalidUtmLinks.length + " 条。");

  let repairResult = null;
  let finalAudit = firstAudit;
  let finalIssues = firstIssues;
  if (firstIssues.invalidUtmLinks.length > 0) {
    const repairLogs = [];
    logLine(logs, "发现 UTM 命名问题，开始自动修复。");
    repairResult = await bannerManagement.fixUtm({ ...(body || {}), sites: JSON.stringify([site.siteCode]), publishAfterFix: "1" }, repairLogs);
    repairLogs.forEach((line) => logLine(logs, "[UTM修复] " + line));
    finalAudit = await runCampaignAudit({
      sites: JSON.stringify([site.siteCode]),
      placement: "banner",
      popupWaitMs: body.popupWaitMs || "5000"
    });
    finalIssues = campaignAuditIssues(finalAudit);
    logLine(logs, "修复后复查完成：坏链 " + finalIssues.brokenLinks.length + " 条，UTM 问题 " + finalIssues.invalidUtmLinks.length + " 条。");
  }

  return {
    first: {
      ok: firstAudit.ok,
      code: firstAudit.code,
      reportPath: firstIssues.reportPath,
      summary: firstIssues.summary,
      brokenLinks: firstIssues.brokenLinks,
      invalidUtmLinks: firstIssues.invalidUtmLinks
    },
    repair: repairResult,
    final: {
      ok: finalAudit.ok,
      code: finalAudit.code,
      reportPath: finalIssues.reportPath,
      summary: finalIssues.summary,
      brokenLinks: finalIssues.brokenLinks,
      invalidUtmLinks: finalIssues.invalidUtmLinks
    }
  };
}

const wtbFeature = createWtbFeature({
  fs,
  path,
  logLine,
  readCampaignConfig,
  requireSingleCampaignSite,
  getShopContext: browserAuth.getShopContext,
  getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn,
  credentialDomainForSite,
  openProductAdditionalInformation: productManagement.openAdditionalInformation,
  clickTextInProductEditor: productManagement.clickText
});

const languagePackageFeature = createLanguagePackageFeature({
  fs,
  path,
  logLine,
  visibleTextSafe: productManagement.visibleText,
  readCampaignConfig,
  requireSingleCampaignSite,
  getShopContext: browserAuth.getShopContext,
  getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn,
  credentialDomainForSite,
  SHOP_DASHBOARD_URL
});

const ecadminPlatformFeature = createEcadminPlatformFeature({
  path,
  logLine,
  normalizeBool,
  visibleText: browserAuth.visibleText,
  clickFormSelect: browserAuth.clickFormSelect,
  clickVisibleOption: browserAuth.clickVisibleOption,
  formItemText: browserAuth.formItemText,
  setFileByLabel: browserAuth.setFileByLabel,
  ensureLoggedIn: browserAuth.ensureLoggedIn,
  getContext: browserAuth.getContext,
  SHAREPOINT_DEFAULTS
});

registerCampaignRoutes(app, {
  upload, logLine, normalizeBool, readCampaignConfig, getCampaignSites, parseSelectedSites,
  getShopContext: browserAuth.getShopContext,
  getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn,
  credentialDomainForSite: shopCredentials.domainForSite,
  banner: bannerManagement,
  product: {
    openFirstEdit: productManagement.openFirstEdit,
    openAdditionalInformation: productManagement.openAdditionalInformation,
    keywordSnapshot: productManagement.keywordSnapshot,
    inspectCopyPage: productManagement.inspectCopyPage,
    copy: productManagement.copy
  },
  popup: popupManagement,
  wtbProbe: productManagement.probeWhereToBuySettings,
  languagePackageFeature, campaignLinkInspector, buildBannerPlan, buildPopupPlan, runCampaignAudit,
  campaignAuditIssues, startCampaignAuditJob, campaignAuditJobs
});

const tdkManagement = createTdkManagement({
  fs,
  logLine,
  NEW_SHOP_API_BASE,
  NEW_SHOP_TDK_INDEX_URL,
  readCampaignConfig,
  requireSingleCampaignSite,
  getShopContext: browserAuth.getShopContext,
  getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn,
  credentialDomainForSite
});

const productReplacementFeature = createProductReplacementFeature({
  logLine,
  readCampaignConfig,
  requireSingleCampaignSite,
  getShopContext: browserAuth.getShopContext,
  getOpenPage: browserAuth.getOpenPage,
  ensureShopLoggedIn: browserAuth.ensureShopLoggedIn,
  credentialDomainForSite,
  openProductEditorByName: productManagement.openByName
});

registerWtbRoutes(app, { upload, wtbFeature, logLine });
registerTdkRoutes(app, { upload, tdkManagement, logLine });
registerProductReplacementRoutes(app, { feature: productReplacementFeature, logLine });
registerAssetUploadRoutes(app, { upload });

registerSpecificationTranslationRoutes(app, {
  upload,
  logLine,
  feature: specificationTranslationFeature,
  browserAuth,
  shopCredentials,
  readCampaignConfig,
  getCampaignSites
});

registerEcadminPlatformRoutes(app, { upload, ecadminPlatformFeature, logLine });
registerEzvizSiteAuditRoutes(app, { feature: ezvizSiteAuditFeature, scheduler: ezvizSiteAuditScheduler });

app.listen(PORT, () => {
  console.log(`Office software platform is running at http://localhost:${PORT}/inline-packager.html`);
  if (process.env.EZVIZ_SITE_AUDIT_SCHEDULE_ENABLED !== "0") ezvizSiteAuditScheduler.start();
});
