const { uploadWebflowAssetBuffer } = require("./webflow-asset-upload");
const cheerio = require("cheerio");

function planVisibleBannerUtmFixes(slides, visibleUrls, siteCode, config, buildCampaignUrl) {
  const normalized = (url) => { try { return new URL(url, "https://www.ezviz.com").toString(); } catch { return String(url || ""); } };
  const positions = new Map();
  visibleUrls.forEach((url, index) => {
    const key = normalized(url);
    if (positions.has(key)) throw new Error("前台存在重复 Banner 链接，无法安全确定位置：" + key);
    positions.set(key, index + 1);
  });
  const changes = [];
  for (const [index, url] of slides.entries()) {
    const position = positions.get(normalized(url));
    if (!position) continue; // 定时隐藏的 Banner 不占当前前台位置。
    const fixedAbsoluteUrl = buildCampaignUrl(normalized(url), { siteCode, placement: "banner", position }, config);
    const fixedUrl = String(url || "").startsWith("/") && !String(url || "").startsWith("//")
      ? fixedAbsoluteUrl.replace(/^https:\/\/www\.ezviz\.com/i, "") : fixedAbsoluteUrl;
    if (fixedUrl !== url) changes.push({ index, position, from: url, to: fixedUrl });
  }
  for (const url of visibleUrls) {
    if (!slides.some((slide) => normalized(slide) === normalized(url))) {
      throw new Error("前台 Banner 与后台配置不一致，停止修复：" + url);
    }
  }
  return changes;
}

function createBannerManagement(deps) {
  const { fs, logLine, normalizeBool, SHOP_HOMEPAGE_URL, readCampaignConfig,
    getShopContext, getOpenPage, ensureShopLoggedIn,
    credentialDomainForSite, selectedCampaignSites, parseSelectedSites,
    buildCampaignUrl, buildBannerPlan, auditAndRepairBannerAfterSubmit } = deps;

  async function openHomepageBannerEditor(page, logs) {
    logLine(logs, "直接进入旧版 Homepage 管理：" + SHOP_HOMEPAGE_URL);
    await page.goto(SHOP_HOMEPAGE_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(5000);

    if (/^https:\/\/new(?:-[a-z]{2,3})?-shop\.ezvizlife\.com\/pages\/index/i.test(page.url())) {
      const homepage = await getNewHomepageTheme(page);
      const editorUrl = new URL("/pages/editor?themeNo=" + encodeURIComponent(homepage.themeNo), page.url()).toString();
      logLine(logs, "进入新版 Homepage 编辑器：" + editorUrl + " / " + homepage.template);
      await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("tab", { name: /swipeBanner\s*\(index\)/i }).waitFor({ timeout: 30000 });
      return page;
    }

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
    return 1;
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

  async function fixBannerSlideUtmByOrder(page, site, config, logs, { dryRun = false } = {}) {
    const homepage = new URL(site.url);
    homepage.searchParams.set("_banner_utm_check", String(Date.now()));
    const response = await fetch(homepage, { cache: "no-store" });
    if (!response.ok) throw new Error("读取前台 Banner 失败：HTTP " + response.status);
    const $ = cheerio.load(await response.text());
    const visibleUrls = $(".home-banner.js-widget-wrapper .swiper-container-home > .swiper-wrapper > .swiper-slide")
      .map((_, slide) => $(slide).find("a[href]").first().attr("href") || "").get().filter(Boolean)
      .map((href) => new URL(href, site.url).toString());
    if (!visibleUrls.length) throw new Error("前台没有读取到 Banner，停止 UTM 修复。");
    const state = await bannerSlideState(page);
    const slides = [];
    for (let index = 0; index < state.count; index += 1) {
      await selectBannerSlide(page, index);
      slides.push(await page.locator("#url").first().inputValue());
    }
    const changes = planVisibleBannerUtmFixes(slides, visibleUrls, site.siteCode, config, buildCampaignUrl);
    logLine(logs, "前台显示 " + visibleUrls.length + " 张、后台配置 " + slides.length + " 张；待修正 " + changes.length + " 条。");
    for (const change of changes) {
      logLine(logs, "前台第 " + change.position + " 位 UTM：" + change.from + " -> " + change.to);
      if (!dryRun) {
        await selectBannerSlide(page, change.index);
        if (await page.locator("#url").first().inputValue() !== change.from) throw new Error("Banner 链接已变化，停止修复。");
        await setInputValueBySelector(page, "#url", change.to);
      }
    }
    return changes;
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
    const result = await uploadWebflowAssetBuffer(fs.readFileSync(file.path), file);
    logLine(logs, label + " 图片已上传到文件服务：" + result.url);
    return result.url;
  }

  function newHomepageApi(page) {
    return page.evaluate(() => {
      const entry = performance.getEntriesByType("resource")
        .find((item) => /\/website-theme\/(?:get-list|get-detail)(?:\?|$)/.test(item.name));
      return entry ? new URL(entry.name).origin : "";
    }).then((origin) => origin || "https://sgpshop-api.ezvizlife.com");
  }

  async function newHomepagePost(page, endpoint, data) {
    const api = await newHomepageApi(page);
    const response = await page.request.post(api + "/website-theme/" + endpoint, { data });
    const result = await response.json().catch(() => null);
    if (!response.ok() || result?.code !== 200) {
      throw new Error("新版 Homepage " + endpoint + " 失败：" + (result?.msg || "HTTP " + response.status()));
    }
    return result.data;
  }

  async function getNewHomepageTheme(page) {
    const themes = await newHomepagePost(page, "get-list", { page: 1, pageSize: 100 });
    if (!Array.isArray(themes)) throw new Error("新版 Homepage 列表格式不正确。");
    const enabled = themes.filter((item) => item.status === 1);
    if (enabled.length !== 1 || !/^web\.index\.index\d+$/i.test(enabled[0].template || "")) {
      throw new Error("无法唯一确定启用中的 Homepage 模板：" + JSON.stringify(enabled.map(({ themeNo, template }) => ({ themeNo, template }))));
    }
    return enabled[0];
  }

  function findNewBannerComponent(theme) {
    const matches = (theme?.regions || []).flatMap((region) =>
      (region.components || [])
        .filter((component) => component.componentType === "swipeBanner")
        .map((component) => ({ regionId: region.regionId, componentId: component.componentId, componentData: component.componentData }))
    );
    if (matches.length !== 1 || !Array.isArray(matches[0].componentData)) {
      throw new Error("新版 Homepage 没有唯一的 swipeBanner 组件，已停止操作。");
    }
    return matches[0];
  }

  async function readNewBanner(page, themeNo) {
    const theme = await newHomepagePost(page, "get-detail", { themeNo });
    if (theme?.themeNo !== themeNo) throw new Error("新版 Homepage 回读的模板编号不一致。");
    return findNewBannerComponent(theme);
  }

  async function saveNewBanner(page, themeNo, original, updated) {
    const latest = await readNewBanner(page, themeNo);
    if (latest.componentId !== original.componentId || latest.regionId !== original.regionId ||
      JSON.stringify(latest.componentData) !== JSON.stringify(original.componentData)) {
      throw new Error("Banner 在预览后被其他人修改，已停止保存，请重新执行。");
    }
    await newHomepagePost(page, "modify", {
      themeNo, componentId: original.componentId, regionId: original.regionId, componentData: updated
    });
    const saved = await readNewBanner(page, themeNo);
    if (saved.componentData.length !== updated.length ||
      updated.some((slide, index) => Object.entries(slide).some(([key, value]) =>
        String(saved.componentData[index]?.[key] ?? "") !== String(value ?? "")))) {
      throw new Error("Banner 保存后回读不一致，未继续发布，请人工检查后台。");
    }
    return saved;
  }

  function newBannerImageUrl(url) {
    return String(url || "").replace(/^https?:\/\//i, "");
  }

  function buildNewBannerSlide(fields, url, pcUri, mobileUri) {
    return {
      title: fields.headline || "", subTitle: fields.slogan || "", model: fields.model || "",
      url, color: normalizeBannerColor(fields.color), pcImg: newBannerImageUrl(pcUri),
      info: fields.introduction || "", mobileImg: newBannerImageUrl(mobileUri),
      noMoreButton: fields.noMoreButton ? 1 : 0, isVideo: 0, target: fields.openNewTab ? 1 : 0,
      timerOnline: normalizeBannerDateTime(fields.onlineAtUtc),
      timerOffline: normalizeBannerDateTime(fields.offlineAtUtc)
    };
  }

  async function publishNewHomepage(page, themeNo) {
    await newHomepagePost(page, "publish", { themeNo });
  }

  async function submitBannerToNewHomepage(page, item, fields, pcImage, mobileImage, site, body, logs) {
    const themeNo = new URL(page.url()).searchParams.get("themeNo");
    if (!themeNo) throw new Error("新版 Homepage 编辑器缺少 themeNo。");
    const original = await readNewBanner(page, themeNo);
    const pcUri = await uploadMallImageDirect(pcImage, logs, "PC");
    const mobileUri = mobileImage && mobileImage !== pcImage
      ? await uploadMallImageDirect(mobileImage, logs, "Mobile") : pcUri;
    const url = item.localizedUrlSuggestion || item.url;
    const slide = buildNewBannerSlide(fields, url, pcUri, mobileUri);
    const targetPosition = bannerTargetPosition(site);
    const updated = original.componentData.map((entry) => ({ ...entry }));
    updated.splice(Math.min(targetPosition - 1, updated.length), 0, slide);
    await saveNewBanner(page, themeNo, original, updated);
    logLine(logs, "新版 Homepage Banner 已保存并回读，第 " + targetPosition + " 位，共 " + updated.length + " 张。");
    if (fields.publishAfterUpload) {
      await publishNewHomepage(page, themeNo);
      logLine(logs, "新版 Homepage 已发布。");
    }
    const postSubmitAudit = await auditAndRepairBannerAfterSubmit(site, body, logs);
    return { mode: "new-homepage", site, url, editorUrl: page.url(), insertedPosition: targetPosition,
      totalSlides: updated.length, postSubmitAudit };
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
    if (/\/pages\/editor\?themeNo=/i.test(page.url())) {
      return submitBannerToNewHomepage(page, item, fields, pcImage, mobileImage, site, body, logs);
    }
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

    const fixedSlides = existingSlides.map((slide) => ({
      title: slide.title || "",
      sub_title: slide.sub_title || "",
      model: slide.model || "",
      url: slide.url || "",
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
      throw new Error("实际提交后台一次只能选择一个站点，请在页面选择当前登录账号对应的单个站点。");
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
    if (/\/pages\/editor\?themeNo=/i.test(page.url())) {
      logLine(logs, "站点已切换新版 Homepage，使用组件接口保存 Banner。");
      return submitBannerToNewHomepage(page, item, fields, pcImage, mobileImage, site, body, logs);
    }
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
    if (/\/pages\/editor\?themeNo=/i.test(editorUrl)) {
      const themeNo = new URL(editorUrl).searchParams.get("themeNo");
      const original = await readNewBanner(page, themeNo);
      const homepage = new URL(site.url);
      homepage.searchParams.set("_banner_utm_check", String(Date.now()));
      const response = await fetch(homepage, { cache: "no-store" });
      if (!response.ok) throw new Error("读取前台 Banner 失败：HTTP " + response.status);
      const $ = cheerio.load(await response.text());
      const visibleUrls = $(".home-banner.js-widget-wrapper .swiper-container-home > .swiper-wrapper > .swiper-slide")
        .map((_, slide) => $(slide).find("a[href]").first().attr("href") || "").get().filter(Boolean)
        .map((href) => new URL(href, site.url).toString());
      if (!visibleUrls.length) throw new Error("前台没有读取到 Banner，停止 UTM 修复。");
      const slides = original.componentData.map((slide) => slide.url || "");
      const changes = planVisibleBannerUtmFixes(slides, visibleUrls, site.siteCode, config, buildCampaignUrl);
      logLine(logs, "新版 Homepage 前台显示 " + visibleUrls.length + " 张、后台配置 " + slides.length + " 张；待修正 " + changes.length + " 条。");
      if (normalizeBool(body.dryRun)) return { site, editorUrl, changes, fixedCount: 0, preview: true };
      if (changes.length) {
        const updated = original.componentData.map((slide) => ({ ...slide }));
        for (const change of changes) updated[change.index].url = change.to;
        await saveNewBanner(page, themeNo, original, updated);
        if (normalizeBool(body.publishAfterFix ?? true)) await publishNewHomepage(page, themeNo);
      }
      return { site, editorUrl, fixedCount: changes.length, changes };
    }
    await page.waitForTimeout(5000);

    logLine(logs, "Open home banner edit dialog for UTM repair.");
    await openHomeBannerEditDialog(page, logs);
    await waitForBannerEditForm(page, logs);
    const changes = await fixBannerSlideUtmByOrder(page, site, config, logs, { dryRun: normalizeBool(body.dryRun) });
    if (normalizeBool(body.dryRun)) return { site, editorUrl, changes, fixedCount: 0, preview: true };
    const fixedCount = changes.length;

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

  return {
    openEditor: openHomepageBannerEditor, openDialog: openHomeBannerEditDialog,
    waitForForm: waitForBannerEditForm, clickByText, moveSlide: moveSelectedBannerSlide,
    diagnoseForm: diagnoseBannerEditForm, submit: submitBannerToBackend,
    fixUtm: fixExistingBannerUtm, targetPosition: bannerTargetPosition,
    requireSingleSite: requireSingleCampaignSite
  };
}

module.exports = { createBannerManagement, planVisibleBannerUtmFixes };
