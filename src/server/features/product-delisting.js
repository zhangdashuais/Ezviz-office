const crypto = require("crypto");

const MAX_DELIST_PRODUCTS = 50;
const MAX_DELIST_OPERATIONS = 200;

function normalize(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function parseProductNames(value) {
  const seen = new Set();
  const products = String(value || "")
    .split(/[\r\n,;，；]+/)
    .map(normalize)
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!products.length) throw new Error("请填写至少一个需要下架的产品名称。");
  if (products.length > MAX_DELIST_PRODUCTS) {
    throw new Error(`一次最多下架 ${MAX_DELIST_PRODUCTS} 个产品，请分批执行。`);
  }
  return products;
}

function parseSiteCodes(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = parsed.split(","); }
  }
  if (!Array.isArray(parsed)) throw new Error("目标站点格式不正确。");
  return [...new Set(parsed.map((item) => normalize(
    typeof item === "string" ? item : item?.siteCode
  ).toLowerCase()).filter(Boolean))];
}

function stateFingerprint(state) {
  return crypto.createHash("sha256").update(JSON.stringify({
    goodsId: state.goodsId,
    isSearchable: state.isSearchable,
    whenType: state.whenType
  })).digest("hex");
}

function createProductDelistingFeature(deps) {
  const {
    logLine,
    readCampaignConfig,
    getCampaignSites,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductEditorByName
  } = deps;

  function validate(body) {
    const products = parseProductNames(body?.productNames ?? body?.productName);
    const requestedSites = parseSiteCodes(body?.targetsJson ?? body?.sites ?? body?.siteCodes);
    if (!requestedSites.length) throw new Error("请至少选择一个目标站点。");
    const sites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const byCode = new Map(sites.map((site) => [site.siteCode, site]));
    const targets = requestedSites.map((siteCode) => {
      const site = byCode.get(siteCode);
      if (!site) throw new Error(`没有找到目标站点：${siteCode}。`);
      return site;
    });
    if (products.length * targets.length > MAX_DELIST_OPERATIONS) {
      throw new Error(`一次最多执行 ${MAX_DELIST_OPERATIONS} 个“产品 × 站点”下架任务，请分批执行。`);
    }
    return { products, targets };
  }

  async function prepareSiteSession(site, body, logs) {
    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(30000);
    page = await ensureShopLoggedIn(page, {
      ...(body || {}),
      sites: [site.siteCode],
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);
    return page;
  }

  async function readState(page, productName, logs) {
    const editInfo = await openProductEditorByName(page, productName, logs);
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(scope?.goodsId && scope?.vm?.basic && typeof scope?.md?.toModel === "function");
    }, null, { timeout: 30000 });
    const state = await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      return {
        goodsId: String(scope.goodsId),
        isSearchable: Boolean(scope.vm.basic.isSearchable),
        whenType: Number(scope.vm.basic.whenType ?? 0)
      };
    });
    return { ...state, editUrl: editInfo.editUrl, fingerprint: stateFingerprint(state) };
  }

  async function saveDelisted(page) {
    const payload = await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      scope.vm.basic.isSearchable = false;
      scope.vm.basic.whenType = 0;
      (scope.$root || scope).$applyAsync?.();
      const data = scope.md.toModel(scope.vm);
      data.goods_id = scope.goodsId;
      return data;
    });
    const response = await page.request.post("https://shop.ezvizlife.com/goods/do-edit-goods", {
      data: { data: payload },
      headers: { "x-requested-with": "XMLHttpRequest" },
      timeout: 60000
    });
    const text = await response.text().catch(() => "");
    let result;
    try { result = JSON.parse(text); } catch { result = null; }
    if (!response.ok() || Number(result?.status) !== 1) {
      throw new Error(result?.msg || `产品下架保存失败（HTTP ${response.status()}）。`);
    }
    return { responseStatus: response.status(), backendStatus: Number(result.status) };
  }

  async function preview(body, logs) {
    const request = validate(body);
    const results = [];
    for (const site of request.targets) {
      let page;
      try {
        page = await prepareSiteSession(site, body, logs);
      } catch (error) {
        request.products.forEach((productName) => results.push({
          status: "failed", site, productName, error: error?.message || String(error)
        }));
        continue;
      }
      for (const productName of request.products) {
        try {
          const before = await readState(page, productName, logs);
          results.push({
            status: !before.isSearchable && before.whenType === 0 ? "no-change" : "ready",
            site,
            productName,
            before,
            desired: { isSearchable: false, whenType: 0 }
          });
        } catch (error) {
          results.push({ status: "failed", site, productName, error: error?.message || String(error) });
        }
      }
    }
    return {
      mode: "product-delisting-preview",
      productCount: request.products.length,
      siteCount: request.targets.length,
      operationCount: results.length,
      readyCount: results.filter((item) => item.status === "ready").length,
      noChangeCount: results.filter((item) => item.status === "no-change").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results
    };
  }

  async function submit(body, logs) {
    const request = validate(body);
    let expected;
    try { expected = JSON.parse(String(body?.expectedFingerprints || "{}")); }
    catch { throw new Error("下架预览校验信息格式不正确，请重新预览。"); }
    const results = [];
    for (const site of request.targets) {
      let page;
      try {
        page = await prepareSiteSession(site, body, logs);
      } catch (error) {
        request.products.forEach((productName) => results.push({
          status: "failed", site, productName, error: error?.message || String(error)
        }));
        continue;
      }
      for (const productName of request.products) {
        try {
          const before = await readState(page, productName, logs);
          const key = `${site.siteCode}\n${productName.toLowerCase()}`;
          if (!expected[key] || expected[key] !== before.fingerprint) {
            throw new Error("产品状态在预览后发生变化，请重新预览。");
          }
          if (!before.isSearchable && before.whenType === 0) {
            results.push({ status: "no-change", site, productName, before, after: before });
            continue;
          }
          const save = await saveDelisted(page);
          const after = await readState(page, productName, logs);
          if (after.isSearchable !== false || after.whenType !== 0) {
            throw new Error("下架保存后回读失败：Searchable 或 Type of listing 与预期不一致。");
          }
          results.push({ status: "completed", site, productName, before, after, save });
        } catch (error) {
          results.push({ status: "failed", site, productName, error: error?.message || String(error) });
        }
      }
    }
    return {
      mode: "product-delisting-submit",
      productCount: request.products.length,
      siteCount: request.targets.length,
      operationCount: results.length,
      completedCount: results.filter((item) => item.status === "completed").length,
      noChangeCount: results.filter((item) => item.status === "no-change").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results
    };
  }

  return { preview, submit };
}

module.exports = {
  MAX_DELIST_PRODUCTS,
  MAX_DELIST_OPERATIONS,
  parseProductNames,
  parseSiteCodes,
  stateFingerprint,
  createProductDelistingFeature
};
