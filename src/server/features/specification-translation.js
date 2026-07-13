const fs = require("fs");

function createSpecificationTranslationFeature(deps) {
  const { logLine, shopCredentials } = deps;

  function normalize(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function readWorkbookRows(filePath) {
    const archive = shopCredentials.zipEntries(fs.readFileSync(filePath));
    const shared = shopCredentials.sharedStrings(archive.get("xl/sharedStrings.xml"));
    return shopCredentials.readRows(archive.get("xl/worksheets/sheet1.xml"), shared).filter(Boolean);
  }

  function findLocalePair(headers, localeHint) {
    const hint = normalize(localeHint).toLowerCase();
    const aliases = {
      fr: ["français", "france", "french"], de: ["deutsch", "german"],
      it: ["italiano", "italian"], es: ["español", "spanish"],
      pl: ["polski", "polish"], nl: ["nederlands", "dutch"],
      pt: ["português", "portuguese"], ro: ["român", "romanian"],
      cz: ["český", "czech"], tr: ["türkçe", "turkish"]
    };
    const needles = [hint, ...(aliases[hint] || [])].filter(Boolean);
    for (let index = 0; index < headers.length; index += 2) {
      const text = normalize(headers[index]).toLowerCase();
      if (needles.some((needle) => text.includes(needle))) return index;
    }
    throw new Error("翻译 Excel 中没有找到目标语言列：" + localeHint);
  }

  function buildTranslationMap(filePath, localeHint) {
    const rows = readWorkbookRows(filePath);
    if (!rows.length) throw new Error("翻译 Excel 为空。");
    const targetStart = findLocalePair(rows[0], localeHint);
    const map = new Map();
    const add = (source, target) => {
      const from = normalize(source);
      const to = normalize(target);
      if (from && to && from !== to) map.set(from, to);
    };
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      add(row[0], row[targetStart]);
      add(row[1], row[targetStart + 1]);
    }
    return {
      localeHeader: normalize(rows[0][targetStart]),
      entries: [...map.entries()].map(([source, target]) => ({ source, target }))
    };
  }

  async function openProductEditor(page, productName, logs) {
    await page.goto("https://shop.ezvizlife.com/goods/index", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const result = await page.evaluate((name) => {
      const exact = [...document.querySelectorAll("body *")].filter((el) => {
        const text = (el.innerText || el.textContent || "").trim();
        return text.toLowerCase() === name.toLowerCase() && el.children.length < 4;
      });
      for (const title of exact) {
        let root = title;
        for (let depth = 0; root && depth < 7; depth += 1, root = root.parentElement) {
          const edit = [...root.querySelectorAll("a,button")].find((el) => /^edit$/i.test((el.innerText || el.textContent || "").trim()));
          if (edit) { edit.click(); return { ok: true, title: (title.innerText || title.textContent || "").trim() }; }
        }
      }
      return { ok: false };
    }, productName);
    if (!result.ok) throw new Error("商品列表中没有找到 " + productName + " 的 Edit 入口。");
    logLine(logs, "已打开商品编辑：" + result.title);
    await page.waitForTimeout(4000);
  }

  async function prepareDetailEditor(page, logs) {
    const basic = page.locator('[ng-model="vm.basic.isSearchable"]').first();
    if (await basic.count()) {
      const checked = await basic.isChecked().catch(() => false);
      if (checked) await basic.uncheck({ force: true }).catch(() => basic.click({ force: true }));
      logLine(logs, "vm.basic.isSearchable 已取消勾选。");
    } else {
      throw new Error("没有找到 vm.basic.isSearchable 复选框。");
    }
    const detail = page.getByText(/^Detail(?:s)?$/i).first();
    if (!(await detail.count())) {
      const candidates = await page.evaluate(() => [...document.querySelectorAll("a,button,li,span")]
        .filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length)
        .map((el) => (el.innerText || el.textContent || "").trim())
        .filter((text) => /detail|basic|information|spec/i.test(text))
        .slice(0, 30));
      throw new Error("没有找到 Detail 入口。候选项：" + JSON.stringify(candidates));
    }
    await detail.click();
    await page.waitForTimeout(1800);
    const editor = await page.evaluate(() => {
      const holders = [...document.querySelectorAll(".edui-editor-iframeholder.edui-default")];
      const candidates = holders.map((holder, index) => {
        const iframe = holder.querySelector("iframe");
        const body = iframe?.contentDocument?.body;
        const row = holder.closest(".row.toggle-item.ng-scope") || holder.closest(".toggle-item") || holder.parentElement;
        return { index, html: body?.innerHTML || "", rowText: (row?.innerText || "").trim().slice(0, 300) };
      });
      return candidates.find((item) => /specification/i.test(item.rowText) || /specification/i.test(item.html)) || candidates[0] || null;
    });
    if (!editor) throw new Error("没有找到 Specification 的 UEditor iframe。");
    logLine(logs, "已定位 Specification 编辑器，索引：" + editor.index);
    return editor;
  }

  async function translateEditor(page, editorIndex, entries, apply) {
    return page.evaluate(({ editorIndex, entries, apply }) => {
      const holder = document.querySelectorAll(".edui-editor-iframeholder.edui-default")[editorIndex];
      const iframe = holder?.querySelector("iframe");
      const body = iframe?.contentDocument?.body;
      if (!body) throw new Error("Specification iframe body is unavailable.");
      const originalHtml = body.innerHTML;
      const doc = new DOMParser().parseFromString(`<body>${originalHtml}</body>`, "text/html");
      const normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const translations = new Map(entries.map((item) => [normalize(item.source), item.target]));
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let node;
      let replaced = 0;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest("script,style")) continue;
        const key = normalize(node.nodeValue);
        if (!key || !translations.has(key)) continue;
        const leading = node.nodeValue.match(/^\s*/)?.[0] || "";
        const trailing = node.nodeValue.match(/\s*$/)?.[0] || "";
        node.nodeValue = leading + translations.get(key) + trailing;
        replaced += 1;
      }
      const generatedHtml = doc.body.innerHTML;
      const originalImages = [...body.querySelectorAll("img")].map((img) => ({ src: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "" }));
      const generatedDoc = new DOMParser().parseFromString(`<body>${generatedHtml}</body>`, "text/html");
      const generatedImages = [...generatedDoc.body.querySelectorAll("img")].map((img) => ({ src: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "" }));
      if (JSON.stringify(originalImages) !== JSON.stringify(generatedImages)) throw new Error("Image src/alt preservation check failed.");
      if (apply) {
        body.innerHTML = generatedHtml;
        body.dispatchEvent(new Event("input", { bubbles: true }));
        body.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return { originalHtml, generatedHtml, replaced, images: originalImages };
    }, { editorIndex, entries, apply });
  }

  async function run(page, options, excelFile, logs) {
    const translation = Array.isArray(options.translations) && options.translations.length
      ? { localeHeader: options.localeHeader || options.locale || options.siteCode, entries: options.translations }
      : buildTranslationMap(excelFile.path, options.locale || options.siteCode);
    await openProductEditor(page, options.productName || "CP8", logs);
    const editor = await prepareDetailEditor(page, logs);
    const result = await translateEditor(page, editor.index, translation.entries, options.submit === true);
    if (options.submit === true) {
      const complete = page.locator(".next-row.col-xs-12.button-fixed").getByText(/^Complete$/i).first();
      if (!(await complete.count())) throw new Error("没有找到 next-row col-xs-12 button-fixed 中的 Complete。");
      await complete.click();
      await page.waitForTimeout(3000);
      logLine(logs, "Specification 翻译已保存。");
    }
    return { productName: options.productName || "CP8", localeHeader: translation.localeHeader, ...result, submitted: options.submit === true };
  }

  return { buildTranslationMap, run };
}

module.exports = { createSpecificationTranslationFeature };
