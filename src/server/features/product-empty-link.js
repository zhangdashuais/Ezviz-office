const crypto = require("crypto");
const { normalizeProductNameForMatch } = require("./product-name-utils");

const DEFAULT_EMPTY_DETAIL = "<p>1<p>";
const MAX_EMPTY_LINK_PRODUCTS = 20;
const GOODS_ADD_URL = "https://shop.ezvizlife.com/goods/do-add";
const GOODS_INDEX_URL = "https://shop.ezvizlife.com/goods/index";

function parseProductNames(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[\n,;\uff0c\uff1b]+/)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.normalize("NFKC").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildEmptyProductPayload(sourcePayload, productName, detailHtml = DEFAULT_EMPTY_DETAIL) {
  const payload = JSON.parse(JSON.stringify(sourcePayload || {}));
  payload.name = productName;
  payload.bn = productName;
  payload.brief = productName;
  payload.is_search = 0;
  payload.summary_intro = detailHtml;
  payload.function_intro = "";
  payload.params_intro = "";
  payload.extra = [];
  payload.mobile_summary_intro = detailHtml;
  payload.mobile_function_intro = "";
  payload.mobile_params_intro = "";
  payload.mobile_extra = [];
  payload.recomm = "";
  payload.mobileRelations = [];
  payload.relations = [];
  payload.recommended_goods_ids = [];
  payload.seo = {
    ...(payload.seo || {}),
    web_name: productName,
    keyword: productName,
    web_desc: productName,
    set_url: ""
  };
  payload.goods_extra_info = {
    ...(payload.goods_extra_info || {}),
    goods_title: productName
  };
  (payload.spec || []).forEach((item) => {
    item.product_id = 0;
    item.product_bn = productName;
  });
  delete payload.goods_id;
  return payload;
}

function publicProductUrl(value) {
  try {
    const url = new URL(value);
    url.protocol = "https:";
    url.hostname = "www.ezviz.com";
    url.pathname = url.pathname.replace(/^\/inter\/en\/product\//, "/inter/product/");
    return url.href;
  } catch {
    return String(value || "");
  }
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createProductEmptyLinkFeature(deps) {
  const {
    logLine,
    readCampaignConfig,
    getCampaignSites,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductEditorByName,
    productExistsInCurrentSite
  } = deps;

  function requestValues(body = {}) {
    const referenceProductName = String(body.referenceProductName || "").trim();
    const productNames = parseProductNames(body.productNames);
    const detailHtml = String(body.detailHtml || DEFAULT_EMPTY_DETAIL).trim();
    if (!referenceProductName) throw new Error("请填写参考产品名称。");
    if (!productNames.length) throw new Error("请填写至少一个新产品名称。");
    if (productNames.length > MAX_EMPTY_LINK_PRODUCTS) {
      throw new Error(`一次最多创建 ${MAX_EMPTY_LINK_PRODUCTS} 个产品，请分批执行。`);
    }
    if (!detailHtml) throw new Error("详情占位 HTML 不能为空。");
    if (detailHtml.length > 10000) throw new Error("详情占位 HTML 最多 10000 个字符。");
    if (productNames.some((name) => name.normalize("NFKC").toLowerCase()
      === referenceProductName.normalize("NFKC").toLowerCase())) {
      throw new Error("新产品名称不能与参考产品相同。");
    }
    return { referenceProductName, productNames, detailHtml };
  }

  function globalSite() {
    const sites = getCampaignSites(readCampaignConfig());
    const site = sites.find((item) => item.siteCode === "hq")
      || sites.find((item) => /\/inter\/?$/i.test(item.url || ""));
    if (!site) throw new Error("站点配置中没有找到国际站（hq）。");
    return site;
  }

  async function prepareSession(body, logs) {
    const site = globalSite();
    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(30000);
    page = await ensureShopLoggedIn(page, {
      ...(body || {}),
      sites: [site.siteCode],
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);
    const identity = await page.evaluate(() => (
      document.querySelector("#username > a")?.textContent
      || document.querySelector(".clearfix.login-bar")?.innerText
      || document.querySelector(".login-bar")?.innerText
      || ""
    )).catch(() => "");
    if (!identity.trim()) throw new Error("国际站后台登录后未能读取当前用户身份。");
    logLine(logs, `已登录国际站（${site.siteCode}）：${identity.replace(/\s+/g, " ").trim()}`);
    return { page, site };
  }

  async function readReference(page, referenceProductName, logs) {
    await page.goto(GOODS_INDEX_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    const edit = await openProductEditorByName(
      page,
      referenceProductName,
      logs,
      { exactOnly: true }
    );
    const expectedName = normalizeProductNameForMatch(referenceProductName);
    await page.waitForFunction((name) => {
      const normalize = (value) => String(value || "")
        .normalize("NFKC")
        .replace(/\u207a/g, "+")
        .replace(/\s*([()])\s*/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(
        scope?.goodsId
        && normalize(scope?.vm?.basic?.name) === name
        && scope?.vm?.specification?.records?.length
        && typeof scope?.md?.toModel === "function"
      );
    }, expectedName, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const source = await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      return {
        goodsId: String(scope.goodsId),
        payload: scope.md.toModel(scope.vm)
      };
    });
    if (!source.payload?.images?.length || !source.payload?.spec?.length) {
      throw new Error("参考产品尚未完整加载 Product Album 或规格，请稍后重试。");
    }
    return { ...source, editUrl: edit.editUrl };
  }

  async function inspect(body, logs) {
    const values = requestValues(body);
    const session = await prepareSession(body, logs);
    logLine(logs, `读取参考产品：${values.referenceProductName}`);
    const reference = await readReference(session.page, values.referenceProductName, logs);
    const results = [];
    for (const productName of values.productNames) {
      const exists = await productExistsInCurrentSite(session.page, productName, logs);
      results.push({
        productName,
        status: exists.exists ? "already-exists" : "ready",
        message: exists.exists ? "国际站已存在同名产品，不会重复创建。" : "可创建"
      });
    }
    const previewFingerprint = fingerprint({
      referenceGoodsId: reference.goodsId,
      referencePayload: reference.payload,
      productNames: values.productNames,
      detailHtml: values.detailHtml,
      states: results.map((item) => [item.productName, item.status])
    });
    return { values, session, reference, results, previewFingerprint };
  }

  function publicResult(internal, mode) {
    return {
      mode,
      site: internal.session.site,
      reference: {
        productName: internal.values.referenceProductName,
        goodsId: internal.reference.goodsId,
        imageCount: internal.reference.payload.images.length,
        specificationCount: internal.reference.payload.spec.length
      },
      detailHtml: internal.values.detailHtml,
      productCount: internal.results.length,
      readyCount: internal.results.filter((item) => item.status === "ready").length,
      existingCount: internal.results.filter((item) => item.status === "already-exists").length,
      failedCount: internal.results.filter((item) => item.status === "failed").length,
      completedCount: internal.results.filter((item) => item.status === "completed").length,
      previewFingerprint: internal.previewFingerprint,
      results: internal.results
    };
  }

  async function preview(body, logs) {
    const internal = await inspect(body, logs);
    logLine(logs, `预览完成：可创建 ${internal.results.filter((item) => item.status === "ready").length} 个。`);
    return publicResult(internal, "product-empty-link-preview");
  }

  async function addProduct(page, payload) {
    const response = await page.request.post(GOODS_ADD_URL, {
      data: { data: payload },
      headers: { "x-requested-with": "XMLHttpRequest" },
      timeout: 60000
    });
    const text = await response.text().catch(() => "");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("产品新增接口返回的不是 JSON：" + text.slice(0, 200));
    }
    if (!response.ok() || Number(data?.status) !== 1) {
      throw new Error(data?.msg || data?.message || `产品新增失败（HTTP ${response.status()}）`);
    }
    return data;
  }

  async function rawProductReadback(page, goodsId) {
    const response = await page.request.get(
      `https://shop.ezvizlife.com/goods/edit-goods?goods_id=${encodeURIComponent(goodsId)}`,
      { timeout: 60000 }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok() || data?.status !== true || !data?.data) {
      throw new Error(data?.msg || `产品回读失败（HTTP ${response.status()}）`);
    }
    return data.data;
  }

  async function submit(body, logs) {
    const internal = await inspect(body, logs);
    const expected = String(body.previewFingerprint || "").trim();
    if (!expected || expected !== internal.previewFingerprint) {
      throw new Error("参考产品、产品列表或后台状态已变化，请重新预览。");
    }
    const results = [];
    for (const item of internal.results) {
      if (item.status !== "ready") {
        results.push(item);
        continue;
      }
      try {
        logLine(logs, `创建国际站产品空链接：${item.productName}`);
        const payload = buildEmptyProductPayload(
          internal.reference.payload,
          item.productName,
          internal.values.detailHtml
        );
        await addProduct(internal.session.page, payload);
        const edit = await openProductEditorByName(
          internal.session.page,
          item.productName,
          logs,
          { exactOnly: true }
        );
        const goodsId = new URL(edit.editUrl).searchParams.get("id") || "";
        if (!goodsId) throw new Error("创建后未能读取 goods_id。");
        const readback = await rawProductReadback(internal.session.page, goodsId);
        const verified = readback.name === item.productName
          && readback.bn === item.productName
          && readback.summary_intro === internal.values.detailHtml
          && readback.mobile_summary_intro === internal.values.detailHtml
          && Number(readback.is_search) === 0
          && Number(readback.cat_id) === Number(payload.cat_id)
          && Number(readback.type_id) === Number(payload.type_id)
          && readback.images?.length === payload.images?.length
          && readback.spec?.length === payload.spec?.length;
        if (!verified) {
          throw new Error("产品已经创建，但后台回读内容不一致；为避免重复创建，未自动重试。");
        }
        const productUrl = publicProductUrl(edit.productPageUrl);
        results.push({
          productName: item.productName,
          status: "completed",
          goodsId,
          productUrl,
          readback: {
            pcDetail: readback.summary_intro,
            mobileDetail: readback.mobile_summary_intro,
            searchable: Boolean(Number(readback.is_search)),
            imageCount: readback.images.length,
            specificationCount: readback.spec.length
          }
        });
        logLine(logs, `创建并回读通过：${item.productName} / ${goodsId}`);
      } catch (error) {
        results.push({
          productName: item.productName,
          status: "failed",
          error: error?.message || String(error)
        });
        logLine(logs, `${item.productName} 创建失败：${error?.message || error}`);
      }
    }
    return publicResult({ ...internal, results }, "product-empty-link-submit");
  }

  return { preview, submit };
}

module.exports = {
  DEFAULT_EMPTY_DETAIL,
  MAX_EMPTY_LINK_PRODUCTS,
  parseProductNames,
  buildEmptyProductPayload,
  publicProductUrl,
  createProductEmptyLinkFeature
};
