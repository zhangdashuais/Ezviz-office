const INT_GOODS_COPY_URL = "https://shop.ezvizlife.com/goods/save-cite";
const INT_GOODS_CATEGORY_PRIORITY = ["WiFi Cameras", "For Home"];

function orderedIntGoodsCategories(options = []) {
  const usable = options
    .map((option) => ({ value: String(option.value), text: String(option.text || "").trim() }))
    .filter((option) => option.value && option.value !== "0" && !/^\u25c6/.test(option.text));
  const byName = new Map(usable.map((option) => [option.text.toLowerCase(), option]));
  const preferred = INT_GOODS_CATEGORY_PRIORITY
    .map((name) => byName.get(name.toLowerCase()))
    .filter(Boolean);
  const preferredValues = new Set(preferred.map((option) => option.value));
  return [...preferred, ...usable.filter((option) => !preferredValues.has(option.value))];
}

function createProductManagement({ logLine, normalizeBool }) {
  const productEditCache = new Map();
  const PRODUCT_EDIT_CACHE_TTL_MS = 15 * 60 * 1000;

  async function productCacheScope(page) {
    return page.evaluate(() => (
      document.querySelector(".clearfix.login-bar")?.innerText
      || document.querySelector(".login-bar")?.innerText
      || ""
    )).catch(() => "").then((value) => value.replace(/\s+/g, " ").trim().toLowerCase());
  }

  function pruneProductEditCache(now = Date.now()) {
    for (const [key, entry] of productEditCache.entries()) {
      if (now - entry.cachedAt > PRODUCT_EDIT_CACHE_TTL_MS) productEditCache.delete(key);
    }
    while (productEditCache.size > 200) productEditCache.delete(productEditCache.keys().next().value);
  }

  async function openProductEditorByName(page, productName, logs) {
    const targetName = String(productName || "").trim();
    if (!targetName) throw new Error("请填写产品名称。");
    pruneProductEditCache();
    const initialScope = await productCacheScope(page);
    const cacheKey = initialScope + "\n" + targetName.toLowerCase();
    const cached = initialScope ? productEditCache.get(cacheKey) : null;
    if (cached) {
      // Always reload the cached edit URL so callers that perform save -> readback
      // validate backend state instead of re-reading the mutated in-page Angular model.
      await page.goto(cached.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
      if (/shop\.ezvizlife\.com/i.test(page.url()) && !/signin|login/i.test(page.url())) {
        logLine(logs, "已复用产品编辑地址缓存：" + targetName);
        return { ...cached, cacheHit: true };
      }
      productEditCache.delete(cacheKey);
    }

    let currentPath = "";
    try { currentPath = new URL(page.url()).pathname; } catch {}
    if (currentPath !== "/goods/index") {
      await page.goto("https://shop.ezvizlife.com/goods/index", {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }).catch(() => {});
      await page.waitForTimeout(1800);
    }

    async function findAndClickEdit() {
      return page.evaluate((name) => {
        const normalized = name.toLowerCase();
        const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        const rows = [...document.querySelectorAll("tr, .goods-item.ng-scope")].filter(visible);
        const exact = rows.find((row) => [...row.querySelectorAll("td, .goods-name, .product-name, [ng-bind*='name']")]
          .some((cell) => (cell.innerText || cell.textContent || "").trim().toLowerCase() === normalized));
        const fuzzy = rows.find((row) => (row.innerText || "").trim().toLowerCase().includes(normalized));
        const row = exact || fuzzy;
        if (!row) return { ok: false };
        const controls = [...row.querySelectorAll("a, button")].filter(visible);
        const edit = controls.find((el) => /^(edit|编辑)$/i.test((el.innerText || el.textContent || "").trim()))
          || controls.find((el) => /\/goods\/add\?id=|\/goods\/edit/i.test(el.getAttribute("href") || ""));
        if (!edit) return { ok: false, reason: "找到产品行，但没有找到 Edit 按钮。" };
        const href = edit.href || edit.getAttribute("href") || "";
        const candidateUrls = [...row.querySelectorAll("a[href]")]
          .map((link) => link.href || link.getAttribute("href") || "")
          .filter((value) => value && !/\/goods\/(?:add|edit)|javascript:/i.test(value));
        edit.click();
        return {
          ok: true,
          href,
          productPageUrl: candidateUrls[0] || "",
          candidateUrls: [...new Set(candidateUrls)],
          rowText: (row.innerText || "").trim().slice(0, 500)
        };
      }, targetName);
    }

    let found = await findAndClickEdit();
    if (!found.ok) {
      const searchInput = page.locator(
        'input[type="search"]:visible, input[type="text"]:visible, input:not([type]):visible'
      ).first();
      if (await searchInput.count()) {
        await searchInput.fill(targetName);
        const searchButton = page.getByText(/^(search|查询|搜索)$/i).first();
        if (await searchButton.count()) await searchButton.click();
        else await searchInput.press("Enter");
        await page.waitForTimeout(3500);
        found = await findAndClickEdit();
      }
    }
    if (!found.ok) {
      throw new Error("没有在产品列表中找到产品：" + targetName + (found.reason ? "；" + found.reason : ""));
    }
    await page.waitForTimeout(2500);
    logLine(logs, "已打开产品编辑页：" + targetName + " / " + page.url());
    const result = {
      productName: targetName,
      editUrl: page.url(),
      productPageUrl: found.productPageUrl || "",
      candidateUrls: found.candidateUrls || [],
      rowText: found.rowText || "",
      cacheHit: false,
      cachedAt: Date.now()
    };
    const resolvedScope = await productCacheScope(page);
    if (resolvedScope) {
      productEditCache.set(resolvedScope + "\n" + targetName.toLowerCase(), result);
    }
    return result;
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

  async function inspectIntGoodsCopyPage(page) {
    return page.evaluate(() => {
      const complete = document.querySelector("a.new.link-btn, button.new.link-btn");
      const firstCopy = document.querySelector(".pro-list-ul .pro-list-li .link-btn.pro-list-link");
      const productItems = [...document.querySelectorAll(".pro-list-ul .pro-list-li")];
      return {
      url: location.href,
      selects: [...document.querySelectorAll("select")].map((el, index) => ({
        index,
        name: el.name,
        id: el.id,
        className: el.className,
        value: el.value,
        options: [...el.options].map((option) => ({ value: option.value, text: option.textContent.trim() }))
      })),
      buttons: [...document.querySelectorAll("button, a, input[type=button], input[type=submit]")]
        .filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length)
        .map((el, index) => ({ index, tag: el.tagName, text: (el.innerText || el.value || el.textContent || "").trim(), className: el.className, href: el.getAttribute("href") || "" }))
        .filter((item) => /copy|complete|cp8|goods/i.test(item.text + " " + item.className + " " + item.href)),
      cp8Text: [...document.querySelectorAll("body *")]
        .filter((el) => /\bCP8\b/i.test((el.innerText || el.textContent || "").trim()) && el.children.length < 8)
        .slice(0, 20)
        .map((el) => ({ tag: el.tagName, text: (el.innerText || el.textContent || "").trim().slice(0, 500), className: el.className })),
      products: productItems.map((item) => {
        const title = item.querySelector("p.pro-list-title");
        const copy = item.querySelector(".link-btn.pro-list-link");
        return {
          name: (title?.innerText || title?.textContent || "").trim(),
          itemNgRepeat: item.getAttribute("ng-repeat") || "",
          copyNgClick: copy?.getAttribute("ng-click") || "",
          copyHref: copy?.getAttribute("href") || ""
        };
      }),
      actionBindings: {
        complete: complete ? {
          text: (complete.innerText || complete.textContent || "").trim(),
          ngClick: complete.getAttribute("ng-click") || "",
          href: complete.getAttribute("href") || ""
        } : null,
        firstCopy: firstCopy ? {
          text: (firstCopy.innerText || firstCopy.textContent || "").trim(),
          ngClick: firstCopy.getAttribute("ng-click") || "",
          href: firstCopy.getAttribute("href") || ""
        } : null
      }
    };
    });
  }

  async function copyIntGoodsProduct(page, productName, logs) {
    const normalized = String(productName || "").trim();
    if (!normalized) throw new Error("Product name is required.");
    const item = page.locator("li.pro-list-li").filter({ has: page.locator("p.pro-list-title", { hasText: normalized }) });
    const exactItem = item.filter({ hasText: new RegExp("^\\s*" + normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)", "i") }).first();
    if (!(await exactItem.count())) throw new Error("Product not found in selected category: " + normalized);
    const title = (await exactItem.locator("p.pro-list-title").first().innerText()).trim();
    if (title.toLowerCase() !== normalized.toLowerCase()) throw new Error("Product verification failed: " + title);
    const copyButton = exactItem.getByText(/^Copy$/i).first();
    if (!(await copyButton.count())) throw new Error("Copy button not found for " + title);
    await copyButton.click();
    await page.waitForTimeout(800);
    logLine(logs, "Selected product for copy: " + title);

    const captured = [];
    const onResponse = async (response) => {
      const request = response.request();
      if (!["POST", "PUT", "PATCH"].includes(request.method())) return;
      if (!/ezvizlife\.com/i.test(request.url())) return;
      captured.push({ method: request.method(), url: request.url(), status: response.status() });
    };
    page.on("response", onResponse);
    try {
      const completeButton = page.getByText(/^Complete$/i).first();
      if (!(await completeButton.count())) throw new Error("Complete button not found.");
      await completeButton.click();
      await page.waitForTimeout(2500);
    } finally {
      page.off("response", onResponse);
    }
    logLine(logs, "Completed product copy: " + title);
    return { productName: title, url: page.url(), requests: captured };
  }

  async function findIntGoodsProduct(page, productName, logs) {
    const normalized = String(productName || "").trim();
    if (!normalized) throw new Error("Product name is required.");
    const categorySelect = page.locator("select.form-control").nth(1);
    if (!(await categorySelect.count())) throw new Error("Product category selector was not found.");
    const options = await categorySelect.locator("option").evaluateAll((items) => items.map((option) => ({
      value: option.value,
      text: (option.textContent || "").trim()
    })));
    const categories = orderedIntGoodsCategories(options);

    for (const category of categories) {
      await categorySelect.selectOption(category.value);
      await page.waitForTimeout(900);
      const matches = page.locator(".pro-list-ul li.pro-list-li").filter({
        has: page.locator("p.pro-list-title", { hasText: normalized })
      });
      const count = await matches.count();
      for (let index = 0; index < count; index += 1) {
        const item = matches.nth(index);
        const title = (await item.locator("p.pro-list-title").first().innerText()).trim();
        if (title.toLowerCase() !== normalized.toLowerCase()) continue;
        const product = await item.evaluate((element) => {
          const scope = window.angular && window.angular.element(element).scope();
          const good = scope?.good || null;
          return {
            goodsId: good?.goods_id == null ? "" : String(good.goods_id),
            modelKeys: good ? Object.keys(good) : []
          };
        });
        if (!product.goodsId) {
          throw new Error("Product was found but goods_id is missing: " + title);
        }
        logLine(logs, `Found ${title} in ${category.text}, goods_id=${product.goodsId}.`);
        return { productName: title, category, goodsId: product.goodsId };
      }
    }
    throw new Error(
      `Product not found after checking ${categories.length} categories: ${normalized}`
    );
  }

  async function copyIntGoodsProductDirect(page, productName, logs) {
    const product = await findIntGoodsProduct(page, productName, logs);
    const response = await page.request.post(INT_GOODS_COPY_URL, {
      form: { cite: "", copy: product.goodsId + "," },
      headers: { "x-requested-with": "XMLHttpRequest" },
      timeout: 60000
    });
    const responseText = await response.text();
    let result = null;
    try { result = JSON.parse(responseText); } catch {}
    if (!response.ok() || !result?.status) {
      throw new Error(
        `Direct product copy failed (${response.status()}): `
        + (result?.msg || responseText.slice(0, 500) || "empty response")
      );
    }
    logLine(logs, `Direct product copy completed: ${product.productName} / ${product.category.text}.`);
    return {
      strategy: "direct-request",
      productName: product.productName,
      goodsId: product.goodsId,
      category: product.category,
      request: { method: "POST", url: INT_GOODS_COPY_URL, status: response.status() },
      result: {
        status: result.status,
        msg: result.msg || "",
        redirect: result.redirect || ""
      }
    };
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

  return {
    openFirstEdit: openFirstProductEditPage, inspectCopyPage: inspectIntGoodsCopyPage,
    openByName: openProductEditorByName,
    copy: copyIntGoodsProductDirect, copyViaUi: copyIntGoodsProduct,
    findIntGoodsProduct, openAdditionalInformation: openProductAdditionalInformation,
    clickText: clickTextInProductEditor, probeWhereToBuySettings: probeProductWhereToBuySettings,
    keywordSnapshot: productEditorKeywordSnapshot,
    visibleText: visibleTextSafe
  };
}

module.exports = {
  INT_GOODS_COPY_URL,
  INT_GOODS_CATEGORY_PRIORITY,
  orderedIntGoodsCategories,
  createProductManagement
};
