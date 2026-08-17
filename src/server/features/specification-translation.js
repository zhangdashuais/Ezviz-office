const GOODS_INDEX_URL = "https://shop.ezvizlife.com/goods/index";

function normalizeTerm(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function replaceSpecificationTerms(html, translatedTerm) {
  const target = normalizeTerm(translatedTerm);
  if (!target) throw new Error("没有从参考详情页取得 Specification 的译文。");
  let replaced = 0;
  const generatedHtml = String(html || "").replace(/\bspecifications?\b/gi, () => {
    replaced += 1;
    return target;
  });
  return { generatedHtml, replaced };
}

function createSpecificationTranslationFeature({ logLine }) {
  async function extractTranslatedTerm(page, referenceUrl) {
    await page.goto(referenceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const candidates = [...document.querySelectorAll("body *")]
        .filter((element) => {
          const marker = [element.id, element.className, element.getAttribute("href"), element.getAttribute("data-target")]
            .map(clean).join(" ");
          const text = clean(element.textContent);
          return /specification/i.test(marker) && text && text.length <= 80 && element.children.length <= 2;
        })
        .map((element) => ({
          text: clean(element.textContent),
          marker: clean([element.id, element.className, element.getAttribute("href"), element.getAttribute("data-target")].join(" "))
        }))
        .sort((left, right) => left.text.length - right.text.length);
      if (/^specifications?$/i.test(candidates[0]?.text || "")) {
        candidates[0].text = "Specification";
      }
      return candidates[0] || null;
    });
    if (!result?.text) {
      throw new Error("参考详情页中没有识别到已翻译的 Specification 标题，请确认该 URL 属于当前站点且页面已完成翻译。");
    }
    return result;
  }

  async function listAllProducts(page) {
    await page.goto(GOODS_INDEX_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const products = [];
    const seenPages = new Set();
    for (let pageNumber = 0; pageNumber < 500; pageNumber += 1) {
      const snapshot = await page.evaluate(() => {
        const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
        const rows = [...document.querySelectorAll("tr, .goods-item.ng-scope")].filter(visible);
        const items = rows.map((row) => {
          const edit = [...row.querySelectorAll("a[href]")].find((link) => /\/goods\/(?:add\?id=|edit)/i.test(link.getAttribute("href") || ""));
          const nameCell = row.querySelector("td.lb, .goods-name, .product-name, [ng-bind*='name']");
          return edit ? { name: (nameCell?.textContent || "").trim(), editUrl: edit.href } : null;
        }).filter(Boolean);
        const next = [...document.querySelectorAll("a,button")].find((element) => {
          const text = (element.textContent || "").trim();
          const marker = `${element.className || ""} ${element.getAttribute("aria-label") || ""}`;
          return visible(element) && (/^(next|下一页|›|»|>)$/i.test(text) || /\bnext\b/i.test(marker));
        });
        const disabled = !next || next.disabled || next.getAttribute("aria-disabled") === "true" || /disabled/.test(next.className || "");
        return { items, signature: items.map((item) => item.editUrl).join("|"), hasNext: !disabled };
      });
      if (!snapshot.signature || seenPages.has(snapshot.signature)) break;
      seenPages.add(snapshot.signature);
      products.push(...snapshot.items);
      if (!snapshot.hasNext) break;
      const previous = snapshot.signature;
      await page.evaluate(() => {
        const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
        const next = [...document.querySelectorAll("a,button")].find((element) => {
          const text = (element.textContent || "").trim();
          const marker = `${element.className || ""} ${element.getAttribute("aria-label") || ""}`;
          return visible(element) && (/^(next|下一页|›|»|>)$/i.test(text) || /\bnext\b/i.test(marker));
        });
        next?.click();
      });
      await page.waitForTimeout(1000);
      const changed = await page.waitForFunction((signature) => {
        const urls = [...document.querySelectorAll("tr a[href], .goods-item a[href]")]
          .filter((link) => /\/goods\/(?:add\?id=|edit)/i.test(link.getAttribute("href") || ""))
          .map((link) => link.href).join("|");
        return urls && urls !== signature;
      }, previous, { timeout: 10000 }).then(() => true).catch(() => false);
      if (!changed) break;
    }
    return [...new Map(products.map((item) => [item.editUrl, item])).values()];
  }

  async function readEditor(page) {
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(scope?.goodsId && scope?.vm?.pcView && typeof scope?.md?.toModel === "function");
    }, null, { timeout: 30000 });
    return page.evaluate(() => {
      const normalized = (value) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const fields = scope.vm.pcView?.customs || [];
      const field = fields.find((item) => ["specification", "specifications"].includes(normalized(item?.name)));
      return { goodsId: String(scope.goodsId), html: String(field?.value || ""), hasField: Boolean(field) };
    });
  }

  async function saveEditor(page, nextHtml) {
    const payload = await page.evaluate((html) => {
      const normalized = (value) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const field = (scope.vm.pcView?.customs || []).find((item) => ["specification", "specifications"].includes(normalized(item?.name)));
      if (!field) throw new Error("产品没有 Specification 字段。");
      field.value = html;
      const data = scope.md.toModel(scope.vm);
      data.goods_id = scope.goodsId;
      return data;
    }, nextHtml);
    const response = await page.request.post("https://shop.ezvizlife.com/goods/do-edit-goods", {
      data: { data: payload }, headers: { "x-requested-with": "XMLHttpRequest" }, timeout: 60000
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok() || Number(body.status) !== 1) throw new Error(body.msg || body.message || `保存失败（HTTP ${response.status()}）`);
  }

  async function run(page, options, logs) {
    const reference = await extractTranslatedTerm(page, options.referenceUrl);
    logLine(logs, `已从参考详情页取得译文：${reference.text}`);
    const products = await listAllProducts(page);
    if (!products.length) throw new Error("当前站点产品列表为空，无法执行批量替换。");
    const results = [];
    for (const [index, product] of products.entries()) {
      try {
        await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        const before = await readEditor(page);
        if (!before.hasField) {
          results.push({ ...product, status: "skipped", reason: "无 Specification 字段", replaced: 0 });
          continue;
        }
        const replacement = replaceSpecificationTerms(before.html, reference.text);
        if (options.submit && replacement.replaced) {
          await saveEditor(page, replacement.generatedHtml);
          await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
          const after = await readEditor(page);
          if (after.html !== replacement.generatedHtml) throw new Error("保存后回读内容不一致");
        }
        results.push({ ...product, goodsId: before.goodsId, status: replacement.replaced ? (options.submit ? "saved" : "pending") : "unchanged", replaced: replacement.replaced });
        logLine(logs, `[${index + 1}/${products.length}] ${product.name || before.goodsId}：命中 ${replacement.replaced} 处`);
      } catch (error) {
        const reason = error?.message || String(error);
        results.push({ ...product, status: "failed", reason, replaced: 0 });
        logLine(logs, `[${index + 1}/${products.length}] ${product.name || product.editUrl}：失败，${reason}`);
      }
    }
    return {
      translatedTerm: reference.text,
      referenceUrl: options.referenceUrl,
      submitted: Boolean(options.submit),
      total: products.length,
      changed: results.filter((item) => item.replaced > 0).length,
      failed: results.filter((item) => item.status === "failed").length,
      replacements: results.reduce((sum, item) => sum + item.replaced, 0),
      results
    };
  }

  return { extractTranslatedTerm, listAllProducts, readEditor, saveEditor, run };
}

module.exports = { normalizeTerm, replaceSpecificationTerms, createSpecificationTranslationFeature };
