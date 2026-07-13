function createBannerManagement(deps) {
  const { fs, path, logLine, normalizeBool, SHOP_DASHBOARD_URL, readCampaignConfig,
    getShopContext, getOpenPage, ensureShopLoggedIn,
    credentialDomainForSite, selectedCampaignSites, parseSelectedSites,
    buildCampaignUrl, auditAndRepairBannerAfterSubmit } = deps;

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

  return {
    openEditor: openHomepageBannerEditor, openDialog: openHomeBannerEditDialog,
    waitForForm: waitForBannerEditForm, clickByText, moveSlide: moveSelectedBannerSlide,
    diagnoseForm: diagnoseBannerEditForm, submit: submitBannerToBackend,
    fixUtm: fixExistingBannerUtm, targetPosition: bannerTargetPosition,
    requireSingleSite: requireSingleCampaignSite
  };
}

module.exports = { createBannerManagement };
