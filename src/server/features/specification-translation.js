const fs = require("fs");

function createSpecificationTranslationFeature(deps) {
  const { logLine, shopCredentials, openProductEditorByName } = deps;
  if (typeof openProductEditorByName !== "function") {
    throw new Error("Specification 翻译缺少共用产品查询能力。");
  }

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

  async function readSpecificationModel(page) {
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(scope?.goodsId && scope?.vm?.pcView && typeof scope?.md?.toModel === "function");
    }, null, { timeout: 30000 });
    return page.evaluate(() => {
      const normalizeField = (value) => String(value || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "");
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const field = (scope.vm.pcView?.customs || []).find(
        (item) => normalizeField(item?.name) === "specifications"
      );
      if (!field) throw new Error("Detail 中没有找到 Specifications 字段。");
      return {
        goodsId: String(scope.goodsId),
        html: String(field.value || ""),
        isSearchable: Boolean(scope.vm.basic?.isSearchable)
      };
    });
  }

  async function translateSpecificationHtml(page, originalHtml, entries) {
    return page.evaluate(({ originalHtml, entries }) => {
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
      const originalImages = [...doc.body.querySelectorAll("img")].map((img) => ({ src: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "" }));
      const generatedDoc = new DOMParser().parseFromString(`<body>${generatedHtml}</body>`, "text/html");
      const generatedImages = [...generatedDoc.body.querySelectorAll("img")].map((img) => ({ src: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "" }));
      if (JSON.stringify(originalImages) !== JSON.stringify(generatedImages)) throw new Error("Image src/alt preservation check failed.");
      return { originalHtml, generatedHtml, replaced, images: originalImages };
    }, { originalHtml, entries });
  }

  async function buildDirectSavePayload(page, specifications) {
    return page.evaluate((nextSpecifications) => {
      const normalizeField = (value) => String(value || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "");
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const field = (scope.vm.pcView?.customs || []).find(
        (item) => normalizeField(item?.name) === "specifications"
      );
      if (!field) throw new Error("Detail 中没有找到 Specifications 字段。");
      scope.vm.basic = scope.vm.basic || {};
      scope.vm.basic.isSearchable = false;
      field.value = nextSpecifications;
      (scope.$root || scope).$applyAsync?.();
      const data = scope.md.toModel(scope.vm);
      data.goods_id = scope.goodsId;
      return data;
    }, specifications);
  }

  async function postProductUpdate(page, payload) {
    const requestUrl = "https://shop.ezvizlife.com/goods/do-edit-goods";
    const response = await page.request.post(requestUrl, {
      data: { data: payload },
      headers: { "x-requested-with": "XMLHttpRequest" },
      timeout: 60000
    });
    const text = await response.text().catch(() => "");
    let result;
    try { result = JSON.parse(text); } catch {
      throw new Error("产品保存接口返回的不是 JSON：" + text.slice(0, 200));
    }
    if (!response.ok() || Number(result?.status) !== 1) {
      throw new Error(result?.msg || result?.message || `产品保存失败（HTTP ${response.status()}）`);
    }
    return {
      requestUrl,
      responseStatus: response.status(),
      backendStatus: Number(result.status),
      redirect: result.redirect || ""
    };
  }

  async function run(page, options, excelFile, logs) {
    const translation = Array.isArray(options.translations) && options.translations.length
      ? { localeHeader: options.localeHeader || options.locale || options.siteCode, entries: options.translations }
      : buildTranslationMap(excelFile.path, options.locale || options.siteCode);
    const productName = options.productName || "CP8";
    const editInfo = await openProductEditorByName(page, productName, logs);
    const before = await readSpecificationModel(page);
    const result = await translateSpecificationHtml(page, before.html, translation.entries);
    let save = null;
    let verification = null;
    if (options.submit === true) {
      const payload = await buildDirectSavePayload(page, result.generatedHtml);
      save = await postProductUpdate(page, payload);
      await openProductEditorByName(page, productName, logs);
      const after = await readSpecificationModel(page);
      const htmlMatches = after.html === result.generatedHtml;
      const searchableDisabled = after.isSearchable === false;
      verification = { htmlMatches, searchableDisabled, goodsId: after.goodsId };
      if (!htmlMatches || !searchableDisabled) {
        throw new Error(
          `Specification 直接保存回读失败：HTML ${htmlMatches ? "通过" : "不一致"}，`
          + `isSearchable ${searchableDisabled ? "已关闭" : "未关闭"}。`
        );
      }
      logLine(logs, "Specification 翻译已通过直接请求保存并回读验证。");
    }
    return {
      productName,
      localeHeader: translation.localeHeader,
      editUrl: editInfo.editUrl,
      goodsId: before.goodsId,
      ...result,
      submitted: options.submit === true,
      strategy: options.submit === true ? "direct-request" : "preview-only",
      save,
      verification
    };
  }

  return {
    buildTranslationMap,
    readSpecificationModel,
    translateSpecificationHtml,
    buildDirectSavePayload,
    postProductUpdate,
    run
  };
}

module.exports = { createSpecificationTranslationFeature };
