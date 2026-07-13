function createBrowserAuth(deps) {
  const { chromium, PROFILE_DIR, SHOP_PROFILE_DIR, SHOP_DASHBOARD_URL, SHOP_LOGIN_URL,
    SHOP_LOGOUT_URL, shopCredentials, logLine, normalizeBool } = deps;

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
      const credential = shopCredentials.read(payload.credentialGroup || "Website", payload.credentialDomain);
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

  return {
    visibleText, dispatchInput, formItemText, clickFormSelect, clickVisibleOption,
    setFileByLabel, ensureLoggedIn, getContext, getShopContext, getOpenPage,
    ensureShopLoggedIn
  };
}

module.exports = { createBrowserAuth };
