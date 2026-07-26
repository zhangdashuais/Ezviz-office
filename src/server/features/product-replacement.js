function normalizeDetailFieldName(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function readDetailFieldsFromModel(viewModel) {
  const pcView = viewModel?.pcView && typeof viewModel.pcView === "object"
    ? viewModel.pcView
    : {};
  const customFields = Array.isArray(pcView.customs) ? pcView.customs : [];
  const specificationsField = customFields.find(
    (field) => normalizeDetailFieldName(field?.name) === "specifications"
  );
  return {
    overview: String(pcView.summary || ""),
    specifications: String(specificationsField?.value || ""),
    overviewFound: Object.prototype.hasOwnProperty.call(pcView, "summary"),
    specificationsFound: Boolean(specificationsField),
    specificationsFieldName: specificationsField?.name || ""
  };
}

function parseProductNames(value) {
  const source = Array.isArray(value) ? value : [value];
  const names = source
    .flatMap((item) => String(item || "").split(/[\r\n,，;；]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createProductReplacementFeature(deps) {
  const {
    logLine,
    readCampaignConfig,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductEditorByName
  } = deps;

  function requestBodyForSite(body) {
    return body?.sites || !body?.siteCode
      ? (body || {})
      : { ...(body || {}), sites: [String(body.siteCode).trim()] };
  }

  async function prepareAuthenticatedPage(body, logs) {
    const requestBody = requestBodyForSite(body);
    const site = requireSingleCampaignSite(readCampaignConfig(), requestBody);
    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(30000);
    page = await ensureShopLoggedIn(page, {
      ...requestBody,
      forceShopRelogin: true,
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);

    const authenticatedIdentity = await page.evaluate(() =>
      document.querySelector(".clearfix.login-bar")?.innerText
      || document.querySelector(".login-bar")?.innerText
      || ""
    ).catch(() => "");
    if (!authenticatedIdentity.trim()) {
      throw new Error("商城后台登录后未能读取当前用户身份，已停止读取产品 Detail。");
    }
    const normalizedIdentity = authenticatedIdentity.replace(/\s+/g, " ").trim();
    logLine(logs, "产品 Detail 读取身份：" + normalizedIdentity);
    return { page, site, authenticatedIdentity: normalizedIdentity };
  }

  async function readProductDetail(page, site, authenticatedIdentity, productName, logs) {
    const editInfo = await openProductEditorByName(page, productName, logs);
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(scope?.goodsId && scope?.vm?.pcView && scope?.vm?.tabNav);
    }, null, { timeout: 30000 });

    const modelSnapshot = await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      scope.vm.tabNav.moveTo(2);
      (scope.$root || scope).$applyAsync?.();
      return {
        goodsId: String(scope.goodsId),
        pcView: {
          summary: scope.vm.pcView?.summary || "",
          customs: (scope.vm.pcView?.customs || []).map((field) => ({
            name: field?.name || "",
            value: field?.value || ""
          }))
        }
      };
    });
    const detail = readDetailFieldsFromModel(modelSnapshot);
    if (!detail.overviewFound) throw new Error("Detail 中没有找到 Overview 字段。");
    if (!detail.specificationsFound) {
      throw new Error("Detail 中没有找到名称为 Specifications 的字段。");
    }
    logLine(logs, `Detail 字段读取完成：${productName}，Overview ${detail.overview.length} 字符，Specifications ${detail.specifications.length} 字符。`);

    return {
      mode: "authenticated-read-only",
      site,
      authenticatedIdentity,
      productName,
      goodsId: modelSnapshot.goodsId,
      editUrl: editInfo.editUrl,
      detail: {
        overview: detail.overview,
        specifications: detail.specifications
      }
    };
  }

  async function readDetail(body, logs) {
    const productName = parseProductNames(body?.productName)[0] || "";
    if (!productName) throw new Error("请填写产品名称。");
    const session = await prepareAuthenticatedPage(body, logs);
    return readProductDetail(
      session.page,
      session.site,
      session.authenticatedIdentity,
      productName,
      logs
    );
  }

  async function readDetails(body, logs) {
    const productNames = parseProductNames(body?.productNames ?? body?.productName);
    if (!productNames.length) throw new Error("请填写至少一个产品名称。");
    if (productNames.length > 50) throw new Error("一次最多读取 50 个产品。");

    const session = await prepareAuthenticatedPage(body, logs);
    const results = [];
    for (const productName of productNames) {
      logLine(logs, "开始读取产品 Detail：" + productName);
      try {
        const result = await readProductDetail(
          session.page,
          session.site,
          session.authenticatedIdentity,
          productName,
          logs
        );
        results.push({ status: "completed", ...result });
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        logLine(logs, `产品 Detail 读取失败，继续下一个：${productName} / ${message}`);
        results.push({ status: "failed", productName, error: message });
      }
    }

    const successCount = results.filter((item) => item.status === "completed").length;
    return {
      mode: "authenticated-read-only-batch",
      site: session.site,
      authenticatedIdentity: session.authenticatedIdentity,
      requestedCount: productNames.length,
      successCount,
      failedCount: results.length - successCount,
      results
    };
  }

  return { readDetail, readDetails };
}

module.exports = {
  normalizeDetailFieldName,
  readDetailFieldsFromModel,
  parseProductNames,
  createProductReplacementFeature
};
