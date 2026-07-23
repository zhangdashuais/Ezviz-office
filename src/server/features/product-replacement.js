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

  async function readDetail(body, logs) {
    const productName = String(body?.productName || "").trim();
    if (!productName) throw new Error("请填写产品名称。");
    const requestBody = body?.sites || !body?.siteCode
      ? (body || {})
      : { ...(body || {}), sites: [String(body.siteCode).trim()] };
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
    logLine(logs, "产品 Detail 读取身份：" + authenticatedIdentity.replace(/\s+/g, " ").trim());

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
    logLine(logs, `Detail 字段读取完成：Overview ${detail.overview.length} 字符，Specifications ${detail.specifications.length} 字符。`);

    return {
      mode: "authenticated-read-only",
      site,
      authenticatedIdentity: authenticatedIdentity.replace(/\s+/g, " ").trim(),
      productName,
      goodsId: modelSnapshot.goodsId,
      editUrl: editInfo.editUrl,
      detail: {
        overview: detail.overview,
        specifications: detail.specifications
      }
    };
  }

  return { readDetail };
}

module.exports = {
  normalizeDetailFieldName,
  readDetailFieldsFromModel,
  createProductReplacementFeature
};
