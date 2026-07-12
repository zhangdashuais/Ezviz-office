const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
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

const app = express();
const PORT = Number(process.env.PORT || 3217);
const ROOT = __dirname;
const DESKTOP_ROOT = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Desktop");
const WEB_ROOT = path.join(ROOT, "办公软件", "111");
const UPLOAD_ROOT = path.join(ROOT, "runtime_uploads");
const PROFILE_DIR = path.join(ROOT, ".pw-ecadmin-auto-profile");
const SHOP_PROFILE_DIR = path.join(ROOT, ".pw-ezviz-shop-profile");
const WEBSITE_BACKEND_ROOT = "E:\\Website-backend\\backend-operations";
const CAMPAIGN_CONFIG_PATH = path.join(WEBSITE_BACKEND_ROOT, "website-audit", "config", "banner-check.json");
const CAMPAIGN_AUDIT_SCRIPT = path.join(WEBSITE_BACKEND_ROOT, "website-audit", "scripts", "check-homepage-campaign-rendered.mjs");
const CREDENTIAL_WORKBOOK_NAMES = ["网站账号密码", "账号密码"];
const SHOP_DASHBOARD_URL = "https://shop.ezvizlife.com/templates/index";
const SHOP_LOGIN_URL = "https://usauth.ezvizlife.com/signIn?from=ezviz_mall_global_gateway&r=1726447618240890209&returnUrl=www.ezvizlife.com&host=";
const SHOP_LOGOUT_URL = "https://sgpwww.ezvizlife.com/login/logout.html";
const NEW_SHOP_POPUP_EDIT_URL = "https://new-shop.ezvizlife.com/popup/edit";
const NEW_SHOP_POPUP_INDEX_URL = "https://new-shop.ezvizlife.com/popup/index";
const NEW_SHOP_API_BASE = "https://sgpshop-api.ezvizlife.com";
const FS_UPLOAD_URL = "https://fs.ezvizlife.com/upload.php";
const SHOP_WTB_INDEX_URL = "https://shop.ezvizlife.com/whereToBuy/index";

const ezvizSiteAuditFeature = createEzvizSiteAuditFeature({ chromium });

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

async function visibleText(page, limit = 1200) {
  return page.evaluate((max) => document.body.innerText.slice(0, max), limit).catch(() => "");
}

async function dispatchInput(page, selector, value) {
  const locator = page.locator(selector).first();
  await locator.fill(value);
}

async function formItemText(page, label) {
  return page.evaluate((targetLabel) => {
    const root = [...document.querySelectorAll(".el-form-item")].find((el) => {
      const text = (el.querySelector(".el-form-item__label")?.innerText || "").trim();
      return text === targetLabel;
    });
    return root ? root.innerText.trim() : "";
  }, label);
}

async function clickFormSelect(page, label, index = 0) {
  await page.evaluate(({ label, index }) => {
    const root = [...document.querySelectorAll(".el-form-item")].find((el) => {
      const text = (el.querySelector(".el-form-item__label")?.innerText || "").trim();
      return text === label;
    });
    const select = root ? [...root.querySelectorAll(".el-select")][index] : null;
    if (!select) throw new Error("未找到下拉框：" + label);
    select.click();
  }, { label, index });
  await page.waitForTimeout(700);
}

async function clickVisibleOption(page, matcher) {
  const clicked = await page.evaluate((matcherText) => {
    const options = [...document.querySelectorAll(".el-select-dropdown__item")].filter((el) => {
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const text = el.innerText.trim();
      return visible && (text === matcherText || text.includes(matcherText));
    });
    if (!options.length) return false;
    options[0].click();
    return true;
  }, matcher);
  if (!clicked) throw new Error("未找到选项：" + matcher);
  await page.waitForTimeout(900);
}

async function setFileByLabel(page, label, filePath) {
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 20000 });
  await page.evaluate((targetLabel) => {
    const root = [...document.querySelectorAll(".el-form-item")].find((el) => {
      const text = (el.querySelector(".el-form-item__label")?.innerText || "").trim();
      return text === targetLabel;
    });
    const upload = root?.querySelector(".el-upload");
    if (!upload) throw new Error("未找到上传控件：" + targetLabel);
    upload.click();
  }, label);
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
}

async function ensureLoggedIn(page, targetUrl, options, logs) {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);

  if (page.url().includes("sso.hikvision.com")) {
    const username = options.username || process.env.ECADMIN_USER;
    const password = options.password || process.env.ECADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error("后台登录态已失效，请在界面填写后台账号和密码，或先手动登录。");
    }

    logLine(logs, "检测到登录页，正在登录。");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      page.locator('button[type="submit"]').click()
    ]);
    await page.waitForTimeout(5000);
  }

  if (!page.url().includes("ecadmin.ys7.com")) {
    throw new Error("未能进入统一管理平台：" + page.url());
  }
}

async function getContext() {
  if (global.__ecadminContext) return global.__ecadminContext;
  global.__ecadminContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    args: ["--start-maximized"]
  });
  return global.__ecadminContext;
}

function isBrowserContextUsable(context) {
  if (!context) return false;
  try {
    context.pages();
    return true;
  } catch {
    return false;
  }
}

async function getShopContext() {
  if (isBrowserContextUsable(global.__shopContext)) return global.__shopContext;
  global.__shopContext = null;
  global.__shopContext = await chromium.launchPersistentContext(SHOP_PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    args: ["--start-maximized", "--lang=en-US"]
  });
  global.__shopContext.on("close", () => {
    global.__shopContext = null;
  });
  return global.__shopContext;
}

async function getOpenPage(context) {
  const existingPage = context.pages().find((page) => !page.isClosed());
  return existingPage || await context.newPage();
}

function findCredentialWorkbook() {
  const roots = [DESKTOP_ROOT, process.env.EZVIZ_CREDENTIAL_DIR, WEBSITE_BACKEND_ROOT].filter((dir, index, list) =>
    dir && list.indexOf(dir) === index && fs.existsSync(dir)
  );
  const candidates = [];
  const ignoredDirs = new Set(["node_modules", ".git", "outputs", ".playwright", ".playwright-cli", "runtime_uploads"]);

  function walk(dir, depth = 0) {
    if (depth > 4) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (!ignoredDirs.has(item.name)) walk(full, depth + 1);
        continue;
      }
      if (!item.isFile() || !item.name.endsWith(".xlsx") || item.name.startsWith("~$")) continue;
      const stat = fs.statSync(full);
      const hasCredentialName = CREDENTIAL_WORKBOOK_NAMES.some((name) => item.name.includes(name) || full.includes(name));
      if (hasCredentialName || stat.size === 23744) candidates.push({ full, size: stat.size, hasCredentialName });
    }
  }

  for (const root of roots) walk(root);
  const named = candidates.find((item) => item.hasCredentialName && item.full.startsWith(DESKTOP_ROOT));
  if (named) return named.full;
  const localExact = candidates.find((item) => item.size === 23744 && item.full.startsWith(DESKTOP_ROOT));
  if (localExact) return localExact.full;
  const backendNamed = candidates.find((item) => item.hasCredentialName);
  if (backendNamed) return backendNamed.full;
  const exact = candidates.find((item) => item.size === 23744);
  if (exact) return exact.full;
  throw new Error("没有找到网站账号密码 Excel 表，请放在桌面，或设置 EZVIZ_CREDENTIAL_DIR 指向账号表所在文件夹。");
}

function zipEntries(buffer) {
  const entries = new Map();
  let pos = 0;
  while (pos < buffer.length - 4) {
    if (buffer.readUInt32LE(pos) !== 0x04034b50) {
      pos += 1;
      continue;
    }
    const method = buffer.readUInt16LE(pos + 8);
    const compressedSize = buffer.readUInt32LE(pos + 18);
    const nameLength = buffer.readUInt16LE(pos + 26);
    const extraLength = buffer.readUInt16LE(pos + 28);
    const name = buffer.slice(pos + 30, pos + 30 + nameLength).toString("utf8");
    const start = pos + 30 + nameLength + extraLength;
    const raw = buffer.slice(start, start + compressedSize);
    entries.set(name, method === 8 ? zlib.inflateRawSync(raw).toString("utf8") : raw.toString("utf8"));
    pos = start + compressedSize;
  }
  return entries;
}

function decodeXml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sharedStrings(xml = "") {
  const values = [];
  for (const match of xml.matchAll(/<si[\s\S]*?<\/si>/g)) {
    values.push([...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join(""));
  }
  return values;
}

function columnIndex(ref) {
  const letters = ref.match(/[A-Z]+/)?.[0] || "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function readRows(xml, shared) {
  const rows = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      let value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      if (type === "s") value = shared[Number(value)] ?? "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join("");
      }
      row[columnIndex(ref)] = decodeXml(value).trim();
    }
    rows[Number(rowMatch[1]) - 1] = row;
  }
  return rows;
}

function readShopCredential(targetGroup, targetDomain) {
  const workbookPath = findCredentialWorkbook();
  const entries = zipEntries(fs.readFileSync(workbookPath));
  const shared = sharedStrings(entries.get("xl/sharedStrings.xml"));
  const rows = readRows(entries.get("xl/worksheets/sheet1.xml"), shared);
  let currentGroup = "";
  const normalizedTargetGroup = String(targetGroup || "Website").toLowerCase();

  for (const row of rows) {
    const first = row?.[0] || "";
    if (!first) continue;
    if (!first.includes(".") && !/^domain$/i.test(first)) {
      currentGroup = first;
      continue;
    }

    const normalizedCurrentGroup = currentGroup.toLowerCase();
    const isWebsiteGroup = ["website", "main", "regular", "default"].includes(normalizedTargetGroup)
      && normalizedCurrentGroup === "";
    if (first === targetDomain && (normalizedCurrentGroup === normalizedTargetGroup || isWebsiteGroup)) {
      if (!row[1] || !row[2]) throw new Error("账号密码表中 " + targetDomain + " 的账号或密码为空。");
      return { account: row[1], password: row[2], workbookPath };
    }
  }

  throw new Error("账号密码表里没有找到 Website / " + targetDomain + "。");
}

function credentialDomainForSite(site) {
  if (!site) return "www.ezviz.com";
  if (site.siteCode === "hq") return "www.ezviz.com";
  try {
    const parsed = new URL(site.url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.hostname + (pathname && pathname !== "/inter" ? pathname : "");
  } catch {
    return "www.ezviz.com";
  }
}

async function logoutShopByUi(page, logs) {
  logLine(logs, "进入商城后台首页，准备从右上角用户名退出当前账号。");
  await page.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const loginBar = page.locator(".clearfix.login-bar, .login-bar").first();
  if (!(await loginBar.count())) {
    logLine(logs, "未找到右上角用户名区域，可能当前没有后台登录态。");
    return false;
  }

  const accountText = await loginBar.innerText().catch(() => "");
  logLine(logs, "当前后台账号区域：" + accountText.replace(/\s+/g, " ").trim());
  await loginBar.hover();
  await page.waitForTimeout(1000);

  const exitClicked = await page.evaluate(() => {
    const explicit = document.querySelector("#user-exit a");
    if (explicit) {
      explicit.click();
      return true;
    }
    const candidates = [...document.querySelectorAll("a, button, span, li")].filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && /^(Exit|Logout|Log out|退出)$/i.test(text);
    });
    if (!candidates.length) return false;
    candidates[0].click();
    return true;
  });
  if (!exitClicked) {
    logLine(logs, "右上角菜单已展开，但没有找到 Exit 按钮。");
    return false;
  }

  logLine(logs, "已点击右上角 Exit，等待退出完成。");
  await page.waitForTimeout(4000);
  return true;
}

function expectedShopAccountToken(payload) {
  const domain = String(payload?.credentialDomain || "").toLowerCase();
  if (!domain || domain === "www.ezviz.com") return "";
  const pathPart = domain.split("/").filter(Boolean).pop() || "";
  if (!pathPart || pathPart === "inter") return "";
  return pathPart.replace(/[^a-z0-9]/g, "");
}

async function currentShopBackendAccount(page) {
  await page.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const hasPassword = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  if (/usauth\.ezvizlife\.com|signin|login/i.test(page.url()) || hasPassword) return null;
  const accountText = await page.evaluate(() =>
    document.querySelector(".clearfix.login-bar")?.innerText
    || document.querySelector(".login-bar")?.innerText
    || ""
  ).catch(() => "");
  if (!accountText.trim()) return null;
  return accountText.replace(/\s+/g, " ").trim();
}

function shopAccountLooksCompatible(accountText, payload) {
  const expectedToken = expectedShopAccountToken(payload);
  if (!expectedToken) return true;
  const normalized = String(accountText || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.includes(expectedToken);
}

async function ensureShopLoggedIn(page, payload, logs) {
  async function isShopLoginPage() {
    const currentUrl = page.url();
    const hasPassword = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    return /usauth\.ezvizlife\.com|signin|login/i.test(currentUrl) || hasPassword;
  }

  function isShopBackendUrl(rawUrl) {
    try {
      return new URL(rawUrl).hostname === "shop.ezvizlife.com";
    } catch {
      return false;
    }
  }

  let username = payload.shopUsername || payload.username || process.env.EZVIZ_SHOP_USER;
  let password = payload.shopPassword || payload.password || process.env.EZVIZ_SHOP_PASSWORD;
  if ((!username || !password) && payload.credentialDomain) {
    const credential = readShopCredential(payload.credentialGroup || "Website", payload.credentialDomain);
    username = credential.account;
    password = credential.password;
    logLine(logs, "已从网站账号密码表读取账号：" + payload.credentialDomain + " / " + username);
  }
  if (!username || !password) {
    logLine(logs, "商城后台需要登录，但没有找到账号密码。");
    throw new Error("商城后台未登录，且未找到可用账号密码。");
  }

  const currentAccount = normalizeBool(payload.forceShopRelogin) ? null : await currentShopBackendAccount(page);
  if (currentAccount && shopAccountLooksCompatible(currentAccount, payload)) {
    logLine(logs, "检测到商城后台已登录，复用当前账号：" + currentAccount);
    return page;
  }
  if (currentAccount) {
    logLine(logs, "当前后台账号与目标站点不匹配，需要切换账号。当前账号：" + currentAccount);
  }

  if (!currentAccount || !shopAccountLooksCompatible(currentAccount, payload)) {
    const didUiLogout = await logoutShopByUi(page, logs);
    if (!didUiLogout) {
      logLine(logs, "改用退出地址兜底清理登录态。");
      await page.goto(SHOP_LOGOUT_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
  }

  logLine(logs, "打开商城登录入口：" + SHOP_LOGIN_URL);
  await page.goto(SHOP_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);

  if (await isShopLoginPage()) {
    logLine(logs, "检测到商城后台登录页，正在自动登录。");
    const filled = await page.evaluate(({ username, password }) => {
      const inputs = [...document.querySelectorAll("input")];
      const visibleInputs = inputs.filter((input) => {
        const type = (input.getAttribute("type") || "text").toLowerCase();
        const visible = !!(input.offsetWidth || input.offsetHeight || input.getClientRects().length);
        return visible && !input.disabled && type !== "hidden";
      });
      const userInputs = inputs.filter((input) => {
        const text = [input.name, input.id, input.placeholder, input.getAttribute("aria-label")].join(" ").toLowerCase();
        const type = (input.getAttribute("type") || "text").toLowerCase();
        return !input.disabled && type !== "hidden" && type !== "password" && /account|email|user|账号|邮箱/.test(text);
      });
      const passwordInputs = inputs.filter((input) => {
        const text = [input.name, input.id, input.placeholder, input.getAttribute("aria-label")].join(" ").toLowerCase();
        const type = (input.getAttribute("type") || "text").toLowerCase();
        return !input.disabled && (type === "password" || /password|密码/.test(text));
      });
      const fallbackUser = visibleInputs.find((input) => !["password", "checkbox", "radio"].includes((input.getAttribute("type") || "text").toLowerCase()));
      if (!userInputs.length && fallbackUser) userInputs.push(fallbackUser);
      if (!userInputs.length || !passwordInputs.length) return false;
      for (const input of userInputs) {
        input.focus();
        input.value = username;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      for (const input of passwordInputs) {
        input.focus();
        input.value = password;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      for (const checkbox of visibleInputs.filter((input) => (input.getAttribute("type") || "").toLowerCase() === "checkbox")) {
        if (!checkbox.checked) {
          checkbox.click();
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      return true;
    }, { username, password });
    if (!filled) throw new Error("没有在商城登录页找到账号或密码输入框。");
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }),
      page.evaluate(() => {
        const candidates = [...document.querySelectorAll("button, input[type='submit'], a")].filter((el) => {
          const text = (el.innerText || el.value || el.textContent || "").trim();
          const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          return visible && (/login|sign|登录|登 录/i.test(text) || el.getAttribute("type") === "submit");
        });
        if (!candidates.length) return false;
        candidates[0].click();
        return true;
      }).then((clicked) => clicked || page.keyboard.press("Enter"))
    ]);
    await page.waitForTimeout(6000);
  }

  logLine(logs, "登录跳转后新开后台页：" + SHOP_DASHBOARD_URL);
  let backendPage;
  try {
    backendPage = await page.context().newPage();
  } catch (error) {
    global.__shopContext = null;
    throw new Error("商城浏览器会话已关闭，请重新点击执行后台配置。原始错误：" + (error && error.message ? error.message : String(error)));
  }
  backendPage.setDefaultTimeout(25000);
  await backendPage.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await backendPage.waitForTimeout(5000);

  const backendHasPassword = await backendPage.locator('input[type="password"]').first().isVisible().catch(() => false);
  if (/usauth\.ezvizlife\.com|signin|login/i.test(backendPage.url()) || backendHasPassword) {
    throw new Error("商城后台登录态未生效，未能进入 " + SHOP_DASHBOARD_URL);
  }
  if (!isShopBackendUrl(backendPage.url())) {
    throw new Error("商城后台跳转到了非后台页面：" + backendPage.url());
  }

  logLine(logs, "已进入商城后台首页：" + backendPage.url());
  return backendPage;
}

async function clickVisibleTextCandidate(page, pattern, description) {
  const clicked = await page.evaluate((source) => {
    const pattern = new RegExp(source, "i");
    const elements = [...document.querySelectorAll("a, button, span, li, div")].filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && pattern.test(text);
    });
    const exactAnchor = elements.find((el) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || el.textContent || "").trim().toLowerCase();
      return text === "homepage" && tag === "a";
    });
    const exactClickable = elements.find((el) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || el.textContent || "").trim().toLowerCase();
      return text === "homepage" && ["button", "li"].includes(tag);
    });
    const exact = elements.find((el) => (el.innerText || el.textContent || "").trim().toLowerCase() === "homepage");
    const target = exactAnchor || exactClickable || exact?.closest("a, button, li, [role='menuitem']") || exact || elements[0]?.closest("a, button, li, [role='menuitem']") || elements[0];
    if (!target) return false;
    target.click();
    return true;
  }, pattern.source);
  if (!clicked) throw new Error("没有找到可点击的 " + description + "。");
}

async function openHomepageBannerEditor(page, logs) {
  logLine(logs, "进入商城后台首页：" + SHOP_DASHBOARD_URL);
  await page.goto(SHOP_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  logLine(logs, "点击后台 Homepage 入口。");
  await clickVisibleTextCandidate(page, /^Homepage$/i, "Homepage 入口");
  await page.waitForTimeout(4000);

  logLine(logs, "查找启用状态的 Homepage Visual Editor 链接。");
  const editorHref = await page.evaluate(() => {
    function isVisible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    function textOf(el) {
      return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    }

    const rowCandidates = [
      ...document.querySelectorAll("tr"),
      ...document.querySelectorAll(".el-table__row"),
      ...document.querySelectorAll(".ant-table-row"),
      ...document.querySelectorAll(".table-row"),
      ...document.querySelectorAll(".list-item")
    ].filter(isVisible);

    const enabledHomepageRows = rowCandidates.filter((row) => {
      const text = textOf(row);
      return /web\.index\.index4/i.test(text) && /\benable\b|enabled|启用/i.test(text);
    });

    const rows = enabledHomepageRows.length ? enabledHomepageRows : rowCandidates.filter((row) => /web\.index\.index4/i.test(textOf(row)));
    for (const row of rows) {
      const controls = [...row.querySelectorAll("a, button")].filter(isVisible);
      const visualEditor = controls.find((el) => /Visual\s*Editor/i.test(textOf(el)));
      if (visualEditor) {
        return visualEditor.href || visualEditor.getAttribute("href") || "";
      }
    }
    return "";
  });
  if (!editorHref) {
    const diagnostic = await page.evaluate(() => {
      function isVisible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
      function textOf(el) {
        return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
      }
      const rows = [...document.querySelectorAll("tr, .el-table__row, .ant-table-row, .table-row, .list-item")]
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean)
        .slice(0, 20);
      const controls = [...document.querySelectorAll("a, button")]
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean)
        .slice(0, 60);
      const homepageHtml = [...document.querySelectorAll("a, button, span, li, div")]
        .filter(isVisible)
        .filter((el) => /^Homepage$/i.test(textOf(el)) || /^Mall Homepage$/i.test(textOf(el)))
        .map((el) => {
          const clickable = el.closest("a, button, li, [role='menuitem']");
          return {
            tag: el.tagName,
            className: el.className,
            text: textOf(el),
            html: el.outerHTML.slice(0, 500),
            clickableTag: clickable?.tagName || "",
            clickableClass: clickable?.className || "",
            clickableHtml: clickable?.outerHTML?.slice(0, 700) || ""
          };
        })
        .slice(0, 10);
      return { url: location.href, title: document.title, rows, controls, homepageHtml, body: textOf(document.body).slice(0, 1500) };
    }).catch((error) => ({ error: error.message }));
    logLine(logs, "Visual Editor 诊断：" + JSON.stringify(diagnostic));
    throw new Error("没有找到启用 Homepage 的 Visual Editor 按钮。");
  }

  logLine(logs, "进入启用 Homepage 的 Visual Editor：" + editorHref);
  await page.goto(editorHref, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(7000);

  if (/shop\.ezvizlife\.com\/pages\/editor/i.test(page.url())) {
    logLine(logs, "已进入 Banner Visual Editor：" + page.url());
    return page;
  }
  throw new Error("已进入 Visual Editor 链接，但没有到达 Banner 编辑器页面：" + page.url());
}

async function setInputValueBySelector(page, selector, value) {
  if (value == null || value === "") return;
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "attached", timeout: 15000 });
  await locator.evaluate((el, nextValue) => {
    el.value = nextValue;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

async function clickByText(page, text, options = {}) {
  const pattern = typeof text === "string" ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : text;
  const locator = page.getByText(pattern).first();
  await locator.click({ timeout: options.timeout || 15000 });
}

async function selectByVisibleTextOrValue(page, selector, value) {
  if (!value) return;
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "attached", timeout: 15000 });
  await locator.evaluate((el, nextValue) => {
    const normalized = String(nextValue).toLowerCase();
    const option = [...el.options].find((item) =>
      item.value.toLowerCase() === normalized || item.textContent.trim().toLowerCase() === normalized
    );
    if (option) el.value = option.value;
    else el.value = nextValue;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

async function setCheckboxBySelector(page, selector, checked) {
  const locator = page.locator(selector).first();
  if (!(await locator.count())) return;
  await locator.evaluate((el, nextChecked) => {
    el.checked = !!nextChecked;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, !!checked);
}

async function openHomeBannerEditDialog(page, logs) {
  const selector = ".home-banner.js-widget-wrapper";
  const alreadyOpen = await page.evaluate(() => {
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    return [...document.querySelectorAll("#editModel, #swipeBannerApp, #title, #url")].some(visible);
  }).catch(() => false);
  if (alreadyOpen) {
    logLine(logs, "Banner 编辑弹窗已打开。");
    return;
  }

  const wrapper = page.locator(selector).first();
  await wrapper.waitFor({ state: "visible", timeout: 45000 });
  await wrapper.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForTimeout(800);

  const box = await wrapper.boundingBox();
  if (!box) throw new Error("找到了 Banner 模块，但无法计算悬停位置。");

  const hoverPoints = [
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + Math.min(80, box.width / 3), y: box.y + Math.min(60, box.height / 3) },
    { x: box.x + box.width - Math.min(80, box.width / 3), y: box.y + Math.min(60, box.height / 3) }
  ];

  for (const point of hoverPoints) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(700);
    const clicked = await page.evaluate(({ selector }) => {
      function visible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
      function textOf(el) {
        return (el?.innerText || el?.textContent || "").trim();
      }
      function intersects(a, b, padding = 100) {
        return a.left <= b.right + padding
          && a.right >= b.left - padding
          && a.top <= b.bottom + padding
          && a.bottom >= b.top - padding;
      }

      const wrapper = document.querySelector(selector);
      if (!wrapper) return null;
      const wrapperRect = wrapper.getBoundingClientRect();
      const controls = [...document.querySelectorAll("a, button, span, div")].filter((el) => {
        if (!visible(el) || !/^Edit$/i.test(textOf(el))) return false;
        const rect = el.getBoundingClientRect();
        return wrapper.contains(el) || intersects(rect, wrapperRect);
      });
      const control = controls.find((el) => String(el.className || "").includes("editor-wrapper-btn"))
        || controls.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 10 && rect.height > 10;
      }) || controls[0];
      if (!control) return null;
      const rect = control.getBoundingClientRect();
      const info = {
        text: textOf(control),
        tag: control.tagName,
        className: control.className || "",
        html: control.outerHTML.slice(0, 300),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
      control.click();
      return info;
    }, { selector });
    if (clicked) {
      logLine(logs, "已在 home-banner js-widget-wrapper 悬停后点击 Edit：" + JSON.stringify(clicked));
      await page.waitForTimeout(2000);
      const formVisible = await page.evaluate(() => {
        function visible(el) {
          return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        }
        return [...document.querySelectorAll("#editModel, #swipeBannerApp, #title, #url")].some(visible);
      }).catch(() => false);
      if (formVisible) return;
      logLine(logs, "点击该 Edit 后未出现 Banner 表单，继续尝试其他悬停点。");
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  const diagnostic = await page.evaluate((selector) => {
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    function textOf(el) {
      return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    }
    const wrapper = document.querySelector(selector);
    const wrapperText = wrapper ? textOf(wrapper).slice(0, 800) : "";
    const editControls = [...document.querySelectorAll("a, button, span, div")]
      .filter((el) => visible(el) && /Edit/i.test(textOf(el)))
      .map((el) => ({
        text: textOf(el),
        className: el.className,
        html: el.outerHTML.slice(0, 300)
      }))
      .slice(0, 20);
    return { url: location.href, wrapperFound: !!wrapper, wrapperText, editControls };
  }, selector).catch((error) => ({ error: error.message }));
  logLine(logs, "Banner Edit 诊断：" + JSON.stringify(diagnostic));
  throw new Error("已经悬停 home-banner js-widget-wrapper，但没有找到该 Banner 模块的 Edit 按钮。");
}

async function waitForBannerEditForm(page, logs) {
  try {
    await page.waitForSelector("#editModel, #swipeBannerApp", { timeout: 30000 });
    await page.waitForSelector("#title, #url", { timeout: 30000 });
    return;
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      function visible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
      function textOf(el) {
        return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
      }
      const inputs = [...document.querySelectorAll("input, textarea, select")]
        .filter(visible)
        .map((el) => ({
          tag: el.tagName,
          id: el.id || "",
          name: el.getAttribute("name") || "",
          type: el.getAttribute("type") || "",
          placeholder: el.getAttribute("placeholder") || "",
          className: el.className || "",
          value: el.type === "password" ? "[password]" : (el.value || "").slice(0, 80)
        }))
        .slice(0, 80);
      const buttons = [...document.querySelectorAll("a, button, span, div")]
        .filter(visible)
        .map((el) => ({ text: textOf(el), className: el.className || "", html: el.outerHTML.slice(0, 220) }))
        .filter((item) => /Add|Save|Edit|Slide|Banner|Image|Title|Link|Headline|Slogan|Model|Intro/i.test(item.text + " " + item.html))
        .slice(0, 80);
      const dialogs = [...document.querySelectorAll(".modal, .dialog, .layui-layer, .el-dialog, [role='dialog'], .widget-config, .config-panel")]
        .filter(visible)
        .map((el) => ({ className: el.className || "", text: textOf(el).slice(0, 1200), html: el.outerHTML.slice(0, 1200) }))
        .slice(0, 10);
      return { url: location.href, title: document.title, inputs, buttons, dialogs, body: textOf(document.body).slice(0, 2000) };
    }).catch((diagError) => ({ error: diagError.message }));
    logLine(logs, "Banner 表单诊断：" + JSON.stringify(diagnostic));
    throw error;
  }
}

async function diagnoseBannerEditForm(page) {
  return page.evaluate(() => {
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    function textOf(el) {
      return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    }
    const inputs = [...document.querySelectorAll("input, textarea, select")]
      .filter(visible)
      .map((el) => ({
        tag: el.tagName,
        id: el.id || "",
        name: el.getAttribute("name") || "",
        type: el.getAttribute("type") || "",
        placeholder: el.getAttribute("placeholder") || "",
        className: el.className || "",
        value: el.type === "password" ? "[password]" : (el.value || "").slice(0, 160),
        outer: el.outerHTML.slice(0, 260)
      }))
      .slice(0, 160);
    const buttons = [...document.querySelectorAll("a, button, span, div, i")]
      .filter(visible)
      .map((el) => ({ tag: el.tagName, text: textOf(el), className: el.className || "", title: el.getAttribute("title") || "", outer: el.outerHTML.slice(0, 260) }))
      .filter((item) => /Add|Save|Delete|Remove|Up|Down|Move|Sort|Slide|Banner|Image|Title|Link|Headline|Slogan|Model|Intro|↑|↓|\+|-/.test(item.text + " " + item.className + " " + item.title + " " + item.outer))
      .slice(0, 160);
    const likelySlides = [...document.querySelectorAll("li, tr, .item, .slide, .swiper-slide, .form-group, .control-group, .banner-item")]
      .filter(visible)
      .map((el) => ({ tag: el.tagName, className: el.className || "", text: textOf(el).slice(0, 600), outer: el.outerHTML.slice(0, 800) }))
      .filter((item) => /#title|#url|title|url|Headline|Link|Slogan|Model|Introduction|Delete|Remove|Up|Down|slide|banner|timer-online/i.test(item.text + " " + item.outer))
      .slice(0, 80);
    return {
      url: location.href,
      title: document.title,
      inputs,
      buttons,
      likelySlides,
      body: textOf(document.body).slice(0, 2500)
    };
  });
}

function bannerTargetPosition(site) {
  return site?.siteCode === "pl" ? 2 : 1;
}

async function bannerSlideState(page) {
  return page.evaluate(() => {
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    function textOf(el) {
      return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    }
    const tabs = [...document.querySelectorAll("#swipeBannerApp .tab-select.J_swipe, #editModel .tab-select.J_swipe")]
      .filter(visible);
    return {
      count: tabs.length,
      selectedIndex: tabs.findIndex((tab) => tab.classList.contains("selected")),
      titles: tabs.map(textOf)
    };
  });
}

async function clickBannerMoveButton(page, direction) {
  const clicked = await page.evaluate((nextDirection) => {
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    function textOf(el) {
      return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    }
    const arrow = nextDirection === "left" ? String.fromCharCode(8592) : String.fromCharCode(8594);
    const controls = [...document.querySelectorAll("#swipeBannerApp li, #swipeBannerApp button, #swipeBannerApp a, #swipeBannerApp span, #swipeBannerApp div")]
      .filter(visible);
    const target = controls.find((el) => textOf(el) === arrow)
      || controls.find((el) => textOf(el).includes(arrow));
    if (!target) return false;
    target.click();
    return true;
  }, direction);
  if (!clicked) throw new Error("没有找到 Banner slide 的" + (direction === "left" ? "左移" : "右移") + "按钮。");
  await page.waitForTimeout(500);
}

async function moveSelectedBannerSlide(page, targetPosition, logs) {
  const targetIndex = Math.max(0, targetPosition - 1);
  let state = await bannerSlideState(page);
  if (state.selectedIndex < 0) throw new Error("新增 Banner slide 后没有找到选中的 slide。");
  if (targetIndex >= state.count) {
    logLine(logs, "目标位置超过当前 slide 数，保持在末尾：" + JSON.stringify(state));
    return;
  }

  let guard = 0;
  while (state.selectedIndex > targetIndex && guard < 30) {
    await clickBannerMoveButton(page, "left");
    state = await bannerSlideState(page);
    guard += 1;
  }
  while (state.selectedIndex < targetIndex && guard < 30) {
    await clickBannerMoveButton(page, "right");
    state = await bannerSlideState(page);
    guard += 1;
  }
  if (state.selectedIndex !== targetIndex) {
    throw new Error("Banner slide 移动失败，当前状态：" + JSON.stringify(state));
  }
  logLine(logs, "新增 Banner slide 已移动到第 " + targetPosition + " 位；当前顺序：" + state.titles.join(" | "));
}

async function selectBannerSlide(page, index) {
  const selected = await page.evaluate((targetIndex) => {
    function visible(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    const tabs = [...document.querySelectorAll("#swipeBannerApp .tab-select.J_swipe, #editModel .tab-select.J_swipe")]
      .filter(visible);
    const tab = tabs[targetIndex];
    if (!tab) return false;
    tab.click();
    return true;
  }, index);
  if (!selected) throw new Error("没有找到第 " + (index + 1) + " 个 Banner slide。");
  await page.waitForTimeout(400);
}

async function fixBannerSlideUtmByOrder(page, site, config, logs) {
  const state = await bannerSlideState(page);
  let fixedCount = 0;
  for (let index = 0; index < state.count; index += 1) {
    await selectBannerSlide(page, index);
    const url = await page.locator("#url").first().inputValue().catch(() => "");
    const fixedUrl = buildCampaignUrl(url, {
      siteCode: site.siteCode,
      placement: "banner",
      position: index + 1
    }, config);
    if (fixedUrl && fixedUrl !== url) {
      await setInputValueBySelector(page, "#url", fixedUrl);
      fixedCount += 1;
      logLine(logs, "修正第 " + (index + 1) + " 位 Banner UTM：" + url + " -> " + fixedUrl);
    }
  }
  logLine(logs, "Banner UTM 巡查完成，修正 " + fixedCount + " 条。");
  return fixedCount;
}

function normalizeBannerDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.replace(/\//g, "-").replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return normalized + ":00";
  return normalized;
}

function normalizeBannerColor(value) {
  const text = String(value || "").trim();
  if (!text) return "#fff";
  if (text.startsWith("#")) return text;
  if (/black|dark/i.test(text)) return "#2C2C2C";
  return "#fff";
}

function formatWidgetForm(data, prefixGlobal) {
  const result = {};
  function format(value, prefix) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => format(item, `${prefix}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        format(item, `${prefix}[${key}]`);
      }
      return;
    }
    const key = prefix;
    if (key.endsWith("[target]")) {
      result[key] = value ? "true" : "";
    } else {
      result[key] = String(value == null ? "" : value).trim();
    }
  }
  format(data, prefixGlobal);
  return result;
}

async function uploadMallImageDirect(file, logs, label) {
  if (!file?.path || !fs.existsSync(file.path)) throw new Error("缺少 " + label + " 图片文件。");
  const form = new FormData();
  form.append("app", "mall");
  form.append("flag", "op_image");
  form.append("quality", "100");
  const blob = new Blob([fs.readFileSync(file.path)], { type: file.mimetype || "application/octet-stream" });
  form.append("file", blob, file.originalname || path.basename(file.path));
  const response = await fetch("https://fs.ezvizlife.com/upload.php", { method: "POST", body: form });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(label + " 图片上传返回不是 JSON：" + text.slice(0, 300));
  }
  if (!response.ok || !data.status || !data.uri) {
    throw new Error(label + " 图片上传失败：" + (data.msg || text.slice(0, 300)));
  }
  logLine(logs, label + " 图片已上传到文件服务：" + data.uri);
  return data.uri;
}

async function getHomepageBannerWidgetInfo(page) {
  return page.evaluate(() => {
    const banner = document.querySelector(".home-banner.js-widget-wrapper");
    const widgets = [...document.querySelectorAll("[widget-id]")].map((el) => ({
      widgetId: el.getAttribute("widget-id") || "",
      tplId: el.getAttribute("tpl_id") || "",
      widgetType: el.getAttribute("widget_type") || ""
    })).filter((item) => item.widgetId && item.tplId && item.widgetType);
    const query = new URL(location.href).searchParams;
    return {
      themeId: query.get("theme_id") || "",
      banner: banner ? {
        widgetId: banner.getAttribute("widget-id") || "",
        tplId: banner.getAttribute("tpl_id") || "",
        widgetType: banner.getAttribute("widget_type") || ""
      } : null,
      widgets
    };
  });
}

async function submitBannerDirectToBackend(body, files, logs) {
  const config = readCampaignConfig();
  const site = requireSingleCampaignSite(config, body);
  const targetPosition = bannerTargetPosition(site);
  const plan = buildBannerPlan({ ...body, position: String(targetPosition), sites: JSON.stringify([site.siteCode]) }, files);
  const item = plan.items[0];
  const fields = item.fields;
  const pcImage = files?.pcImage?.[0];
  const mobileImage = files?.mobileImage?.[0] || pcImage;
  if (!pcImage) throw new Error("实际提交 Banner 需要上传 PC 图片。");

  const context = await getShopContext();
  let page = await getOpenPage(context);
  page.setDefaultTimeout(25000);
  page = await ensureShopLoggedIn(page, { ...body, credentialDomain: credentialDomainForSite(site), credentialGroup: "Website" }, logs);
  page = await openHomepageBannerEditor(page, logs);
  await page.waitForTimeout(3000);

  const widgetInfo = await getHomepageBannerWidgetInfo(page);
  if (!widgetInfo.banner?.widgetId || !widgetInfo.banner?.tplId) {
    throw new Error("没有从 Homepage 页面读取到 Banner 组件 ID。");
  }
  logLine(logs, "已读取 Banner 组件：" + JSON.stringify(widgetInfo.banner));

  const editResponse = await page.request.get("https://shop.ezvizlife.com/pages/edit-widget", {
    params: { widget_id: widgetInfo.banner.widgetId }
  });
  const editData = await editResponse.json().catch(() => null);
  if (!editResponse.ok() || !editData?.status || !editData?.data?.params) {
    throw new Error("读取 Banner 配置失败：" + (editData?.msg || editResponse.status()));
  }

  const pcUri = await uploadMallImageDirect(pcImage, logs, "PC");
  const mobileUri = mobileImage && mobileImage !== pcImage
    ? await uploadMallImageDirect(mobileImage, logs, "Mobile")
    : pcUri;

  const existingSlides = Array.isArray(editData.data.params.swipe_banner)
    ? editData.data.params.swipe_banner.map((slide) => ({ ...slide }))
    : [];
  const insertIndex = Math.max(0, Math.min(targetPosition - 1, existingSlides.length));
  const newSlide = {
    title: fields.headline,
    sub_title: fields.slogan,
    model: fields.model,
    url: item.localizedUrlSuggestion || item.url,
    color: normalizeBannerColor(fields.color),
    pc_img: pcUri,
    info: fields.introduction,
    mobile_img: mobileUri,
    no_more_button: fields.noMoreButton ? "1" : "0",
    is_video: "",
    target: fields.openNewTab ? true : "",
    timer_online: normalizeBannerDateTime(fields.onlineAtUtc),
    timer_offline: normalizeBannerDateTime(fields.offlineAtUtc)
  };
  existingSlides.splice(insertIndex, 0, newSlide);

  const fixedSlides = existingSlides.map((slide, index) => ({
    title: slide.title || "",
    sub_title: slide.sub_title || "",
    model: slide.model || "",
    url: buildCampaignUrl(slide.url || "", {
      siteCode: site.siteCode,
      placement: "banner",
      position: index + 1
    }, config),
    color: normalizeBannerColor(slide.color || "#fff"),
    pc_img: slide.pc_img || "",
    info: slide.info || "",
    mobile_img: slide.mobile_img || "",
    no_more_button: slide.no_more_button ? "1" : "0",
    is_video: slide.is_video || "",
    target: slide.target ? true : "",
    timer_online: normalizeBannerDateTime(slide.timer_online),
    timer_offline: normalizeBannerDateTime(slide.timer_offline)
  }));

  const form = formatWidgetForm(fixedSlides, "swipe_banner");
  form.theme_id = widgetInfo.themeId || editData.data.params.theme_id || "";
  logLine(logs, "直接提交 Banner 配置，目标位置第 " + targetPosition + " 位；总 Banner 数：" + fixedSlides.length);
  const saveResponse = await page.request.post(
    "https://shop.ezvizlife.com/pages/save-widget?widget_id=" + encodeURIComponent(widgetInfo.banner.widgetId) + "&tpl_id=" + encodeURIComponent(widgetInfo.banner.tplId),
    { form }
  );
  const saveData = await saveResponse.json().catch(() => null);
  if (!saveResponse.ok() || !saveData?.status) {
    throw new Error("保存 Banner 配置失败：" + (saveData?.msg || saveResponse.status()));
  }
  logLine(logs, "Banner 配置已直接保存：" + (saveData.msg || "Saved successfully"));

  const refreshTimes = fixedSlides.flatMap((slide) => [slide.timer_online, slide.timer_offline]).filter(Boolean);
  if (refreshTimes.length) {
    await page.request.get("https://shop.ezvizlife.com/config/save-refresh-time", {
      params: { datetime: refreshTimes.join(",") }
    }).catch(() => null);
    logLine(logs, "已同步 Banner 定时刷新时间。");
  }

  if (fields.publishAfterUpload) {
    const publishForm = { theme_id: form.theme_id };
    for (const widget of widgetInfo.widgets) {
      publishForm["widgets[" + widget.widgetId + "]"] = widget.tplId + ":" + widget.widgetType;
    }
    const publishResponse = await page.request.post("https://shop.ezvizlife.com/pages/save-all", { form: publishForm });
    const publishData = await publishResponse.json().catch(() => null);
    if (!publishResponse.ok() || !publishData?.status) {
      throw new Error("发布 Banner 页面失败：" + (publishData?.msg || publishResponse.status()));
    }
    logLine(logs, "Banner 页面已发布：" + (publishData.msg || "success"));
  }

  const postSubmitAudit = await auditAndRepairBannerAfterSubmit(site, body, logs);
  return {
    mode: "direct-post",
    site,
    url: item.localizedUrlSuggestion || item.url,
    editorUrl: page.url(),
    widget: widgetInfo.banner,
    insertedPosition: targetPosition,
    totalSlides: fixedSlides.length,
    postSubmitAudit
  };
}

function requireSingleCampaignSite(config, body) {
  const sites = selectedCampaignSites(config, parseSelectedSites(body.sites));
  if (sites.length !== 1) {
    throw new Error("实际提交后台一次只能选择一个站点，请只勾选当前登录账号对应的站点。");
  }
  return sites[0];
}

async function submitBannerViaUi(body, files, logs) {
  const config = readCampaignConfig();
  const site = requireSingleCampaignSite(config, body);
  const targetPosition = bannerTargetPosition(site);
  const plan = buildBannerPlan({ ...body, position: String(targetPosition), sites: JSON.stringify([site.siteCode]) }, files);
  const item = plan.items[0];
  const fields = item.fields;
  const pcImage = files?.pcImage?.[0];
  const mobileImage = files?.mobileImage?.[0] || pcImage;
  if (!pcImage) throw new Error("实际提交 Banner 需要上传 PC 图片。");

  const context = await getShopContext();
  let page = await getOpenPage(context);
  page.setDefaultTimeout(25000);

  page = await ensureShopLoggedIn(page, { ...body, credentialDomain: credentialDomainForSite(site), credentialGroup: "Website" }, logs);
  page = await openHomepageBannerEditor(page, logs);
  const editorUrl = page.url();
  await page.waitForTimeout(5000);

  logLine(logs, "打开首页 Banner 编辑弹窗。");
  await openHomeBannerEditDialog(page, logs);

  await waitForBannerEditForm(page, logs);
  await clickByText(page, "Add new slide").catch(() => clickByText(page, "Add").catch(() => {}));
  await page.waitForTimeout(1000);
  await moveSelectedBannerSlide(page, targetPosition, logs);

  logLine(logs, "填写 Banner 字段，目标位置第 " + targetPosition + " 位。");
  await setInputValueBySelector(page, "#title", fields.headline);
  await setInputValueBySelector(page, "#url", item.localizedUrlSuggestion || item.url);
  await setInputValueBySelector(page, "#sub_title", fields.slogan);
  await setInputValueBySelector(page, "#model", fields.model);
  await setInputValueBySelector(page, "#info", fields.introduction);
  await setCheckboxBySelector(page, "#no_more_button", fields.noMoreButton);
  await setCheckboxBySelector(page, "#active", fields.openNewTab);
  await selectByVisibleTextOrValue(page, 'select[name="color"]', fields.color);
  await setInputValueBySelector(page, ".timer-online", fields.onlineAtUtc);
  await setInputValueBySelector(page, ".timer-offline", fields.offlineAtUtc);

  const fileInputs = page.locator('input[type="file"]');
  const fileInputCount = await fileInputs.count();
  if (fileInputCount < 1) throw new Error("没有找到 Banner 图片上传控件。");
  logLine(logs, "上传 Banner 图片。");
  await fileInputs.nth(0).setInputFiles(pcImage.path);
  if (fileInputCount > 1 && mobileImage) await fileInputs.nth(1).setInputFiles(mobileImage.path);
  await page.waitForTimeout(8000);

  await fixBannerSlideUtmByOrder(page, site, config, logs);

  logLine(logs, "保存 Banner 弹窗。");
  await clickByText(page, /^Save$/i);
  await page.waitForTimeout(5000);

  if (fields.publishAfterUpload) {
    logLine(logs, "发布 Banner 页面。");
    await clickByText(page, /^Publish$/i).catch(() => clickByText(page, "发布"));
    await page.waitForTimeout(6000);
  }

  const postSubmitAudit = await auditAndRepairBannerAfterSubmit(site, body, logs);
  return { site, url: item.localizedUrlSuggestion || item.url, editorUrl, currentUrl: page.url(), postSubmitAudit };
}

async function submitBannerToBackend(body, files, logs) {
  if (normalizeBool(body?.useUiBannerFlow)) {
    logLine(logs, "使用旧版页面点击方式提交 Banner。");
    return submitBannerViaUi(body, files, logs);
  }
  logLine(logs, "使用快路径提交 Banner：Playwright 登录定位 + 接口上传/保存/发布。");
  return submitBannerDirectToBackend(body, files, logs);
}

async function fixExistingBannerUtm(body, logs) {
  const config = readCampaignConfig();
  const sites = selectedCampaignSites(config, parseSelectedSites(body.sites));
  if (!sites.length) throw new Error("Please select at least one site.");
  if (sites.length > 1) {
    throw new Error("Banner UTM repair changes the live backend. Please select one site at a time.");
  }
  const site = sites[0];
  const context = await getShopContext();
  let page = await getOpenPage(context);
  page.setDefaultTimeout(25000);

  page = await ensureShopLoggedIn(page, {
    ...(body || {}),
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);
  page = await openHomepageBannerEditor(page, logs);
  const editorUrl = page.url();
  await page.waitForTimeout(5000);

  logLine(logs, "Open home banner edit dialog for UTM repair.");
  await openHomeBannerEditDialog(page, logs);
  await waitForBannerEditForm(page, logs);
  const fixedCount = await fixBannerSlideUtmByOrder(page, site, config, logs);

  if (fixedCount > 0) {
    logLine(logs, "Save banner dialog after UTM repair.");
    await clickByText(page, /^Save$/i);
    await page.waitForTimeout(5000);
    if (normalizeBool(body.publishAfterFix ?? true)) {
      logLine(logs, "Publish banner page after UTM repair.");
      await clickByText(page, /^Publish$/i).catch(() => clickByText(page, "发布"));
      await page.waitForTimeout(6000);
    }
  } else {
    logLine(logs, "No banner UTM repair needed; skip save and publish.");
  }

  return { site, editorUrl, currentUrl: page.url(), fixedCount };
}

async function openFirstProductEditPage(page, logs) {
  await page.goto("https://shop.ezvizlife.com/goods/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("a, button")].filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const href = el.getAttribute("href") || "";
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && (
        /^edit$/i.test(text)
        || /编辑/.test(text)
        || /\/goods\/(edit|update|view|save|detail)/i.test(href)
      );
    });
    const target = candidates.find((el) => {
      const row = el.closest("tr");
      return row && row.innerText.trim();
    }) || candidates[0];
    if (!target) return { ok: false, reason: "没有找到产品编辑入口" };
    const href = target.getAttribute("href") || "";
    target.click();
    return { ok: true, text: (target.innerText || target.textContent || "").trim(), href };
  });
  if (!clicked.ok) throw new Error(clicked.reason || "没有找到产品编辑入口");
  logLine(logs, "已点击第一条产品编辑入口：" + JSON.stringify(clicked));
  await page.waitForTimeout(5000);
  return page.url();
}

async function openProductAdditionalInformation(page, logs) {
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('ul.nav-tabs a[role="tab"], a[ng-click]')].filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && /^additional information$/i.test(text);
    });
    const target = candidates[0];
    if (!target) return { ok: false, reason: "没有找到 Additional information" };
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return {
      ok: true,
      text: (target.innerText || target.textContent || "").trim(),
      ngClick: target.getAttribute("ng-click") || "",
      controls: target.getAttribute("aria-controls") || ""
    };
  });
  if (!clicked.ok) throw new Error(clicked.reason || "没有找到 Additional information");
  logLine(logs, "已进入 Additional information：" + JSON.stringify(clicked));
  await page.waitForTimeout(1200);
  let active = await page.evaluate(() => {
    const pane = document.querySelector(".tab-content .tab-pane.active");
    return { id: pane?.id || "", text: (pane?.innerText || "").trim().slice(0, 300) };
  }).catch(() => ({ id: "", text: "" }));
  if (active.id !== "replenish") {
    await page.evaluate(() => {
      const anchor = [...document.querySelectorAll('ul.nav-tabs a[role="tab"], a[ng-click]')]
        .find((el) => /^additional information$/i.test((el.innerText || el.textContent || "").trim()));
      if (!anchor) return;
      if (window.angular) {
        const scope = window.angular.element(anchor).scope();
        const vm = scope?.vm || scope?.$parent?.vm;
        if (vm?.tabNav?.moveTo) {
          vm.tabNav.moveTo(7);
          (scope.$root || scope).$applyAsync?.();
        }
      }
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }).catch(() => {});
    await page.waitForTimeout(1500);
    active = await page.evaluate(() => {
      const pane = document.querySelector(".tab-content .tab-pane.active");
      return { id: pane?.id || "", text: (pane?.innerText || "").trim().slice(0, 300) };
    }).catch(() => ({ id: "", text: "" }));
  }
  logLine(logs, "Additional Information active panel: " + JSON.stringify(active));
  if (active.id !== "replenish") {
    throw new Error("Additional Information tab did not switch, current panel: " + (active.id || "unknown"));
  }
  return page.url();
}

async function clickTextInProductEditor(page, textPattern, label, logs) {
  const clicked = await page.evaluate(({ source, flags, label }) => {
    const pattern = new RegExp(source, flags);
    const candidates = [...document.querySelectorAll("a, button, li, span, div")].filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && pattern.test(text);
    });
    const target = candidates[0];
    if (!target) return { ok: false, reason: "没有找到 " + label };
    target.click();
    return { ok: true, text: (target.innerText || target.textContent || "").trim() };
  }, { source: textPattern.source, flags: textPattern.flags, label });
  if (!clicked.ok) throw new Error(clicked.reason || ("没有找到 " + label));
  logLine(logs, "已点击 " + label + "：" + JSON.stringify(clicked));
  await page.waitForTimeout(1500);
  return clicked;
}

async function probeProductWhereToBuySettings(page, logs, options = {}) {
  const captured = [];
  const onRequest = (request) => {
    const url = request.url();
    if (!/shop\.ezvizlife\.com|sgpshop-api\.ezvizlife\.com|whereToBuy|goods|buy/i.test(url)) return;
    captured.push({
      type: "request",
      method: request.method(),
      url,
      postData: request.postData() || ""
    });
  };
  const onResponse = (response) => {
    const url = response.url();
    if (!/shop\.ezvizlife\.com|sgpshop-api\.ezvizlife\.com|whereToBuy|goods|buy/i.test(url)) return;
    captured.push({
      type: "response",
      status: response.status(),
      url
    });
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await openProductAdditionalInformation(page, logs);
    await clickTextInProductEditor(page, /wheretobuy\s*settings/i, "WhereToBuy Settings", logs);
    await page.waitForTimeout(3000);

    if (normalizeBool(options.clickComplete)) {
      await clickTextInProductEditor(page, /^complete$/i, "Complete", logs);
      await page.waitForTimeout(4000);
    }

    const visibleText = await visibleTextSafe(page, 2500);
    return {
      currentUrl: page.url(),
      captured,
      visibleText
    };
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}

async function visibleTextSafe(page, limit = 1200) {
  return page.evaluate((max) => document.body.innerText.slice(0, max), limit).catch(() => "");
}

async function productEditorKeywordSnapshot(page) {
  return page.evaluate(() => {
    const keyword = /buy|where|purchase|setting|shop|store|additional/i;
    return [...document.querySelectorAll("a, button, li, span, label, div, input, textarea")]
      .map((el) => ({
        tag: el.tagName,
        text: (el.innerText || el.textContent || el.getAttribute("placeholder") || el.value || "").trim(),
        id: el.id || "",
        name: el.getAttribute("name") || "",
        cls: String(el.className || ""),
        href: el.getAttribute("href") || "",
        role: el.getAttribute("role") || "",
        onclick: el.getAttribute("onclick") || "",
        dataToggle: el.getAttribute("data-toggle") || "",
        dataTarget: el.getAttribute("data-target") || "",
        ngClick: el.getAttribute("ng-click") || "",
        parentTag: el.parentElement?.tagName || "",
        parentCls: String(el.parentElement?.className || ""),
        parentText: (el.parentElement?.innerText || "").trim().slice(0, 160),
        outerHTML: el.outerHTML.slice(0, 500),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      }))
      .filter((item) => item.visible && keyword.test([item.text, item.id, item.name, item.cls, item.href].join(" ")))
      .slice(0, 120);
  }).catch(() => []);
}

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

function singleCampaignSiteFromBody(body) {
  const config = readCampaignConfig();
  if (body?.siteCode && !body?.sites) {
    const site = getCampaignSites(config).find((item) => item.siteCode === String(body.siteCode));
    if (!site) throw new Error("未找到站点：" + body.siteCode);
    return site;
  }
  return requireSingleCampaignSite(config, body || {});
}

function safeShopBackendUrl(value, fallback = SHOP_WTB_INDEX_URL) {
  const raw = String(value || fallback).trim();
  const url = new URL(raw, "https://shop.ezvizlife.com");
  if (url.protocol !== "https:" || url.hostname !== "shop.ezvizlife.com") {
    throw new Error("WTB 后台地址必须是 https://shop.ezvizlife.com 下的地址。");
  }
  if (!url.pathname.startsWith("/whereToBuy/") && !url.pathname.startsWith("/where-to-buy/")) {
    throw new Error("WTB 接口只允许访问 whereToBuy 后台路径。");
  }
  return url.toString();
}

function parseRequestPayload(value) {
  if (value == null || value === "") return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error("requestPayload 必须是 JSON 对象或可解析的 JSON 字符串。");
  }
}

async function submitWtbConfig(body, logs) {
  const site = singleCampaignSiteFromBody(body);
  const context = await getShopContext();
  let page = await getOpenPage(context);
  page.setDefaultTimeout(25000);

  page = await ensureShopLoggedIn(page, {
    ...(body || {}),
    credentialDomain: credentialDomainForSite(site),
    credentialGroup: "Website"
  }, logs);

  const openUrl = safeShopBackendUrl(body?.openUrl || SHOP_WTB_INDEX_URL);
  logLine(logs, "打开 WTB 后台页面：" + openUrl);
  await page.goto(openUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const requestUrlRaw = String(body?.requestUrl || body?.apiUrl || "").trim();
  if (!requestUrlRaw) {
    return {
      mode: "login-open",
      site,
      currentUrl: page.url(),
      message: "已完成后台登录并打开 WTB 页面，尚未提交配置请求。"
    };
  }

  const requestUrl = safeShopBackendUrl(requestUrlRaw);
  const method = String(body?.method || "POST").trim().toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error("WTB 请求方法不支持：" + method);
  }
  const payload = parseRequestPayload(body?.requestPayload ?? body?.payload ?? {});
  const requestType = String(body?.requestType || "json").trim().toLowerCase();
  const options = {};
  if (method === "GET") {
    options.params = payload;
  } else if (requestType === "form") {
    options.form = payload;
  } else {
    options.data = payload;
  }

  logLine(logs, "提交 WTB 后台请求：" + method + " " + requestUrl);
  const response = await page.request.fetch(requestUrl, { method, ...options });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!response.ok()) {
    throw new Error("WTB 后台请求失败，状态码：" + response.status() + "，返回：" + text.slice(0, 500));
  }

  logLine(logs, "WTB 后台请求完成，状态码：" + response.status());
  return {
    mode: "login-request",
    site,
    currentUrl: page.url(),
    request: {
      method,
      url: requestUrl,
      requestType
    },
    response: {
      status: response.status(),
      json: data,
      text: data ? "" : text.slice(0, 1200)
    }
  };
}

function readCampaignConfig() {
  if (!fs.existsSync(CAMPAIGN_CONFIG_PATH)) {
    throw new Error("未找到 Website-backend 巡查配置：" + CAMPAIGN_CONFIG_PATH);
  }
  return JSON.parse(fs.readFileSync(CAMPAIGN_CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function getCampaignSites(config) {
  return (config.sites || []).map((site) => ({
    name: site.name,
    url: site.url,
    siteCode: site.siteCode,
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
  const policy = (config.utmPolicies && config.utmPolicies[placement]) || config.utmPolicy || {};
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
      doc: path.join(WEBSITE_BACKEND_ROOT, "ezviz-shop-automation", "banner-config", "homepage-banner-config.md")
    },
    note: "此接口仅生成 Banner 清单和 UTM 数据，不提交后台。需要实际保存到 shop 后台时，请使用 /api/campaign/banner-submit 或页面里的“执行 Banner 后台配置”。",
    selectedSites: sites,
    files: {
      pcImage: fileSummary(pcImage),
      mobileImage: fileSummary(mobileImage)
    },
    generatedUrls: Object.fromEntries(sites.map((site) => {
      const position = bannerTargetPosition(site);
      const options = { siteCode: site.siteCode, placement: "banner", position };
      return [site.siteCode, buildCampaignUrl(rawLink, options, config)];
    })),
    items: sites.map((site) => {
      const position = bannerTargetPosition(site);
      const options = { siteCode: site.siteCode, placement: "banner", position };
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
      doc: path.join(WEBSITE_BACKEND_ROOT, "ezviz-shop-automation", "popup-config", "popup-upload.md")
    },
    note: "此接口仅生成 Popup 清单和 UTM 数据，不提交后台。需要实际保存到 new-shop 后台时，请使用 /api/campaign/popup-submit 或页面里的“执行 Popup 后台配置”。",
    selectedSites: sites,
    files: {
      image: fileSummary(popupImage)
    },
    generatedUrls: Object.fromEntries(sites.map((site) => {
      const options = { siteCode: site.siteCode, placement: "popup" };
      return [site.siteCode, buildCampaignUrl(rawWebUrl, options, config)];
    })),
    items: sites.map((site) => {
      const options = { siteCode: site.siteCode, placement: "popup" };
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
    throw new Error("未找到 Website-backend 巡查脚本：" + CAMPAIGN_AUDIT_SCRIPT);
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
      cwd: path.join(WEBSITE_BACKEND_ROOT, "website-audit"),
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
    cwd: path.join(WEBSITE_BACKEND_ROOT, "website-audit"),
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
    repairResult = await fixExistingBannerUtm({ ...(body || {}), sites: JSON.stringify([site.siteCode]), publishAfterFix: "1" }, repairLogs);
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
  zipEntries,
  sharedStrings,
  readRows,
  readCampaignConfig,
  requireSingleCampaignSite,
  getShopContext,
  getOpenPage,
  ensureShopLoggedIn,
  credentialDomainForSite,
  openProductAdditionalInformation,
  clickTextInProductEditor
});

const languagePackageFeature = createLanguagePackageFeature({
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
});

const ecadminPlatformFeature = createEcadminPlatformFeature({
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
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/campaign/sites", (req, res) => {
  try {
    const config = readCampaignConfig();
    res.json({ ok: true, sites: getCampaignSites(config) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error) });
  }
});

app.post("/api/campaign/shop-login-check", async (req, res) => {
  const logs = [];
  try {
    const config = readCampaignConfig();
    const requestedSiteCode = String(req.body?.siteCode || "hq");
    const site = getCampaignSites(config).find((item) => item.siteCode === requestedSiteCode) || getCampaignSites(config)[0];
    const context = await getShopContext();
    const page = await getOpenPage(context);
    page.setDefaultTimeout(25000);
    const targetUrl = String(req.body?.targetUrl || "").trim();
    if (!/^https:\/\/(shop|new-shop)\.ezvizlife\.com\//.test(targetUrl)) {
      if (targetUrl) throw new Error("登录检查目标地址必须是 shop/new-shop 后台地址。");
    }
    let backendPage = await ensureShopLoggedIn(page, {
      ...(req.body || {}),
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);
    if (normalizeBool(req.body?.openBannerEditor)) {
      backendPage = await openHomepageBannerEditor(backendPage, logs);
    }
    let bannerDiagnostic = null;
    if (normalizeBool(req.body?.openBannerDialog)) {
      await openHomeBannerEditDialog(backendPage, logs);
      await waitForBannerEditForm(backendPage, logs);
      if (normalizeBool(req.body?.addSlideForDiagnostics)) {
        await clickByText(backendPage, "Add new slide").catch(() => clickByText(backendPage, "Add").catch(() => {}));
        await backendPage.waitForTimeout(1000);
      }
      if (req.body?.moveBannerPosition) {
        await moveSelectedBannerSlide(backendPage, Number(req.body.moveBannerPosition), logs);
      }
      bannerDiagnostic = await diagnoseBannerEditForm(backendPage);
    }
    if (targetUrl) {
      logLine(logs, "登录检查额外打开目标页：" + targetUrl);
      await backendPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await backendPage.waitForTimeout(4000);
    }
    if (normalizeBool(req.body?.openFirstProductEdit)) {
      await openFirstProductEditPage(backendPage, logs);
    }
    if (normalizeBool(req.body?.openAdditionalInformation)) {
      await openProductAdditionalInformation(backendPage, logs);
    }
    let wtbProbe = null;
    if (normalizeBool(req.body?.probeWhereToBuySettings)) {
      wtbProbe = await probeProductWhereToBuySettings(backendPage, logs, {
        clickComplete: req.body?.clickCompleteForProbe
      });
    }
    let productKeywordSnapshot = null;
    if (normalizeBool(req.body?.productKeywordSnapshot)) {
      productKeywordSnapshot = await productEditorKeywordSnapshot(backendPage);
    }
    let languageUploadProbe = null;
    if (normalizeBool(req.body?.probeLanguageUpload)) {
      languageUploadProbe = await languagePackageFeature.probeLanguagePackageUpload(
        backendPage,
        String(req.body?.languagePackagePath || "").trim(),
        logs
      );
    }
    const accountText = await backendPage.evaluate(() =>
      document.querySelector(".clearfix.login-bar")?.innerText
      || document.querySelector(".login-bar")?.innerText
      || document.body.innerText.slice(0, 500)
    ).catch(() => "");
    res.json({ ok: true, site, logs, currentUrl: backendPage.url(), accountText, bannerDiagnostic, wtbProbe, productKeywordSnapshot, languageUploadProbe });
  } catch (error) {
    logLine(logs, "商城登录检查失败：" + (error && error.message ? error.message : String(error)));
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
  }
});

app.post("/api/campaign/banner-plan", upload.fields([
  { name: "pcImage", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 }
]), (req, res) => {
  try {
    res.json({ ok: true, plan: buildBannerPlan(req.body || {}, req.files || {}) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error) });
  }
});

app.post("/api/campaign/popup-plan", upload.fields([
  { name: "image", maxCount: 1 }
]), (req, res) => {
  try {
    res.json({ ok: true, plan: buildPopupPlan(req.body || {}, req.files || {}) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error) });
  }
});

registerWtbRoutes(app, { upload, wtbFeature, logLine });

registerLanguagePackageRoutes(app, { upload, languagePackageFeature, logLine });

app.post("/api/campaign/banner-submit", upload.fields([
  { name: "pcImage", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 }
]), async (req, res) => {
  const logs = [];
  try {
    const result = await submitBannerToBackend(req.body || {}, req.files || {}, logs);
    logLine(logs, "Banner 后台提交流程完成。");
    res.json({ ok: true, logs, result });
  } catch (error) {
    logLine(logs, "Banner 后台提交失败：" + (error && error.message ? error.message : String(error)));
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
  }
});

app.post("/api/campaign/banner-fix-utm", async (req, res) => {
  const logs = [];
  try {
    const result = await fixExistingBannerUtm(req.body || {}, logs);
    logLine(logs, "Banner UTM repair flow completed.");
    res.json({ ok: true, logs, result });
  } catch (error) {
    logLine(logs, "Banner UTM repair failed: " + (error && error.message ? error.message : String(error)));
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
  }
});

app.post("/api/campaign/popup-submit", upload.fields([
  { name: "image", maxCount: 1 }
]), async (req, res) => {
  const logs = [];
  try {
    const result = await submitPopupToBackend(req.body || {}, req.files || {}, logs);
    logLine(logs, "Popup 后台提交流程完成。");
    res.json({ ok: true, logs, result });
  } catch (error) {
    logLine(logs, "Popup 后台提交失败：" + (error && error.message ? error.message : String(error)));
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
  }
});

app.post("/api/campaign/audit", async (req, res) => {
  try {
    const result = await runCampaignAudit(req.body || {});
    result.issues = campaignAuditIssues(result);
    res.status(result.ok ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error) });
  }
});

function campaignAuditJobView(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    selectedSites: job.selectedSites,
    tempConfigPath: job.tempConfigPath,
    logs: job.logs,
    error: job.error,
    result: job.result
  };
}

app.post("/api/campaign/audit-job", (req, res) => {
  try {
    const job = startCampaignAuditJob(req.body || {});
    res.json({ ok: true, job: campaignAuditJobView(job) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error) });
  }
});

app.get("/api/campaign/audit-job/:jobId", (req, res) => {
  const job = campaignAuditJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ ok: false, error: "巡查任务不存在或已过期。" });
    return;
  }
  res.json({ ok: true, job: campaignAuditJobView(job) });
});

registerEcadminPlatformRoutes(app, { upload, ecadminPlatformFeature, logLine });
registerEzvizSiteAuditRoutes(app, { feature: ezvizSiteAuditFeature });

app.listen(PORT, () => {
  console.log(`Office software platform is running at http://localhost:${PORT}/inline-packager.html`);
});
