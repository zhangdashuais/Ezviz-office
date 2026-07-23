function createProductManagement({ logLine, normalizeBool }) {

  async function openProductEditorByName(page, productName, logs) {
    const targetName = String(productName || "").trim();
    if (!targetName) throw new Error("请填写产品名称。");
    await page.goto("https://shop.ezvizlife.com/goods/index", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }).catch(() => {});
    await page.waitForTimeout(3000);

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
        edit.click();
        return { ok: true, href, rowText: (row.innerText || "").trim().slice(0, 500) };
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
    await page.waitForTimeout(4500);
    logLine(logs, "已打开产品编辑页：" + targetName + " / " + page.url());
    return { productName: targetName, editUrl: page.url(), rowText: found.rowText || "" };
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
    return page.evaluate(() => ({
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
        .map((el) => ({ tag: el.tagName, text: (el.innerText || el.textContent || "").trim().slice(0, 500), className: el.className }))
    }));
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
    copy: copyIntGoodsProduct, openAdditionalInformation: openProductAdditionalInformation,
    clickText: clickTextInProductEditor, probeWhereToBuySettings: probeProductWhereToBuySettings,
    keywordSnapshot: productEditorKeywordSnapshot,
    visibleText: visibleTextSafe
  };
}

module.exports = { createProductManagement };
