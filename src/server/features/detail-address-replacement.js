const { parseProductNames } = require("./product-replacement");

function countOccurrences(text, target) {
  if (!target) return 0;
  return String(text || "").split(target).length - 1;
}

function collectDetailAddressMatches(value, target, path = "pcView", matches = []) {
  if (!target) return matches;
  if (typeof value === "string") {
    const count = countOccurrences(value, target);
    if (count) matches.push({ path, count });
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDetailAddressMatches(item, target, `${path}[${index}]`, matches));
    return matches;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectDetailAddressMatches(item, target, `${path}.${key}`, matches));
  }
  return matches;
}

function replaceDetailAddress(value, targetText, replacementText) {
  if (typeof value === "string") return value.split(targetText).join(replacementText);
  if (Array.isArray(value)) {
    return value.map((item) => replaceDetailAddress(item, targetText, replacementText));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceDetailAddress(item, targetText, replacementText)
      ])
    );
  }
  return value;
}

function buildDetailAddressReplacement(pcView, targetText, replacementText) {
  const oldMatches = collectDetailAddressMatches(pcView, targetText);
  const existingNewMatches = collectDetailAddressMatches(pcView, replacementText);
  return {
    oldMatches,
    existingNewMatches,
    matchCount: oldMatches.reduce((sum, item) => sum + item.count, 0),
    existingNewCount: existingNewMatches.reduce((sum, item) => sum + item.count, 0),
    updatedPcView: replaceDetailAddress(pcView, targetText, replacementText)
  };
}

function validateAddressPair(oldAddress, newAddress, label) {
  const targetText = String(oldAddress || "").trim();
  const replacementText = String(newAddress || "").trim();
  if (!targetText && !replacementText) return null;
  if (!targetText || !replacementText) {
    throw new Error(`${label}必须同时填写替换前地址和替换后地址。`);
  }
  if (!/^https?:\/\//i.test(targetText) || !/^https?:\/\//i.test(replacementText)) {
    throw new Error(`${label}的新旧地址都必须以 http:// 或 https:// 开头。`);
  }
  if (targetText === replacementText) throw new Error(`${label}的新旧地址不能相同。`);
  if (targetText.includes(replacementText) || replacementText.includes(targetText)) {
    throw new Error(`${label}的新旧地址不能互相包含，以免重复替换。`);
  }
  return {
    type: "replace",
    label,
    targetText,
    replacementText
  };
}

function validateOperationConflicts(operations, productName) {
  const replacements = operations.filter((operation) => operation.type === "replace");
  for (let leftIndex = 0; leftIndex < replacements.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < replacements.length; rightIndex += 1) {
      const left = replacements[leftIndex];
      const right = replacements[rightIndex];
      const valuesOverlap = [
        [left.targetText, right.targetText],
        [left.targetText, right.replacementText],
        [left.replacementText, right.targetText],
        [left.replacementText, right.replacementText]
      ].some(([first, second]) =>
        first === second || first.includes(second) || second.includes(first));
      if (valuesOverlap) {
        throw new Error(
          `${productName} 的地址 1 和地址 2 存在相同或互相包含的值，请拆分处理。`
        );
      }
    }
  }
}

function normalizeBatchItem(item, index) {
  const productName = String(item?.productName ?? item?.Product_Name ?? "").trim();
  if (!productName) throw new Error(`第 ${index + 1} 行缺少 Product_Name。`);

  const replacements = Array.isArray(item?.replacements)
    ? item.replacements
    : [
      {
        oldAddress: item?.oldAddress1 ?? item?.Old_Address_1,
        newAddress: item?.newAddress1 ?? item?.New_Address_1
      },
      {
        oldAddress: item?.oldAddress2 ?? item?.Old_Address_2,
        newAddress: item?.newAddress2 ?? item?.New_Address_2
      }
    ];
  if (replacements.length > 2) throw new Error(`${productName} 最多只能配置两组地址替换。`);

  const deleteCodeBlock = String(
    item?.deleteCodeBlock ?? item?.Delete_Code_Block ?? ""
  );
  if (deleteCodeBlock.length > 500000) {
    throw new Error(`${productName} 的删除代码块不能超过 500,000 个字符。`);
  }

  const operations = [];
  if (deleteCodeBlock.trim()) {
    operations.push({
      type: "delete",
      label: "删除代码块",
      targetText: deleteCodeBlock,
      replacementText: ""
    });
  }
  replacements.forEach((replacement, replacementIndex) => {
    const operation = validateAddressPair(
      replacement?.oldAddress ?? replacement?.targetText,
      replacement?.newAddress ?? replacement?.replacementText,
      `地址 ${replacementIndex + 1}`
    );
    if (operation) operations.push(operation);
  });
  if (!operations.length) {
    throw new Error(`${productName} 没有填写地址替换或待删除代码块。`);
  }
  validateOperationConflicts(operations, productName);
  return { productName, operations };
}

function validateRequest(body) {
  if (Array.isArray(body?.items)) {
    if (!body.items.length) throw new Error("Excel 中没有可执行的产品数据。");
    if (body.items.length > 50) throw new Error("一次最多处理 50 个产品。");
    const items = body.items.map(normalizeBatchItem);
    const names = new Set();
    items.forEach((item) => {
      if (names.has(item.productName)) {
        throw new Error(`Product_Name 重复：${item.productName}。`);
      }
      names.add(item.productName);
    });
    return {
      operation: "batch",
      productNames: items.map((item) => item.productName),
      items
    };
  }

  const productNames = parseProductNames(body?.productNames ?? body?.productName);
  const operation = body?.operation === "delete" ? "delete" : "replace";
  const rawTargetText = String(body?.targetText ?? body?.codeBlock ?? body?.oldUrl ?? "");
  const targetText = operation === "delete" ? rawTargetText : rawTargetText.trim();
  const replacementText = operation === "delete"
    ? ""
    : String(body?.replacementText ?? body?.newUrl ?? "").trim();
  if (!productNames.length) throw new Error("请填写至少一个产品名称。");
  if (productNames.length > 50) throw new Error("一次最多处理 50 个产品。");

  let operationConfig;
  if (operation === "delete") {
    if (!targetText.trim()) throw new Error("请填写要删除的完整代码块。");
    if (targetText.length > 500000) throw new Error("匹配内容不能超过 500,000 个字符。");
    operationConfig = {
      type: "delete",
      label: "删除代码块",
      targetText,
      replacementText: ""
    };
  } else {
    operationConfig = validateAddressPair(targetText, replacementText, "地址替换");
    if (!operationConfig) throw new Error("请填写被替换地址和替换后地址。");
  }
  const items = productNames.map((productName) => ({
    productName,
    operations: [operationConfig]
  }));
  return {
    productNames,
    items,
    operation,
    targetText,
    replacementText,
    oldUrl: targetText,
    newUrl: replacementText
  };
}

function planDetailOperations(pcView, operations) {
  let updatedPcView = pcView;
  const steps = operations.map((operation) => {
    const analysis = buildDetailAddressReplacement(
      updatedPcView,
      operation.targetText,
      operation.replacementText
    );
    updatedPcView = analysis.updatedPcView;
    return {
      ...operation,
      matchCount: analysis.matchCount,
      matches: analysis.oldMatches,
      existingNewCount: analysis.existingNewCount,
      expectedNewCount: operation.replacementText
        ? analysis.existingNewCount + analysis.matchCount
        : 0
    };
  });
  return {
    steps,
    updatedPcView,
    matchCount: steps.reduce((sum, step) => sum + step.matchCount, 0)
  };
}

function createDetailAddressReplacementFeature(deps) {
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

  async function prepareSession(body, logs) {
    const requestBody = requestBodyForSite(body);
    const site = requireSingleCampaignSite(readCampaignConfig(), requestBody);
    const context = await getShopContext();
    let page = await getOpenPage(context);
    page.setDefaultTimeout(30000);
    page = await ensureShopLoggedIn(page, {
      ...requestBody,
      credentialDomain: credentialDomainForSite(site),
      credentialGroup: "Website"
    }, logs);
    const identity = await page.evaluate(() =>
      document.querySelector(".clearfix.login-bar")?.innerText
      || document.querySelector(".login-bar")?.innerText
      || ""
    ).catch(() => "");
    if (!identity.trim()) {
      throw new Error("商城后台登录后未能读取当前用户身份，已停止 Detail 临时操作。");
    }
    const authenticatedIdentity = identity.replace(/\s+/g, " ").trim();
    logLine(logs, "Detail 临时操作后台身份：" + authenticatedIdentity);
    return { site, page, authenticatedIdentity };
  }

  async function readProductPcView(page, productName, logs) {
    const editInfo = await openProductEditorByName(page, productName, logs);
    await page.waitForFunction(() => {
      const element = document.querySelector("#replenish");
      const scope = window.angular && element ? window.angular.element(element).scope() : null;
      return Boolean(
        scope?.goodsId
        && scope?.vm?.pcView
        && scope?.vm?.tabNav
        && typeof scope?.md?.toModel === "function"
      );
    }, null, { timeout: 30000 });
    const snapshot = await page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      scope.vm.tabNav.moveTo(2);
      (scope.$root || scope).$applyAsync?.();
      return {
        goodsId: String(scope.goodsId),
        pcView: JSON.parse(JSON.stringify(scope.vm.pcView || {}))
      };
    });
    return { editInfo, ...snapshot };
  }

  async function buildSavePayload(page, operations) {
    return page.evaluate((operationList) => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const replacedCounts = [];
      function applyOperation(operation) {
        let replaced = 0;
        function update(value) {
          if (typeof value === "string") {
            const count = value.split(operation.targetText).length - 1;
            replaced += count;
            return value.split(operation.targetText).join(operation.replacementText);
          }
          if (Array.isArray(value)) {
            value.forEach((item, index) => { value[index] = update(item); });
            return value;
          }
          if (value && typeof value === "object") {
            Object.keys(value).forEach((key) => { value[key] = update(value[key]); });
          }
          return value;
        }
        update(scope.vm.pcView);
        replacedCounts.push(replaced);
      }
      operationList.forEach(applyOperation);
      const data = scope.md.toModel(scope.vm);
      data.goods_id = scope.goodsId;
      return { payload: data, replacedCounts };
    }, operations.map(({ targetText, replacementText }) => ({
      targetText,
      replacementText
    })));
  }

  async function postProductUpdate(page, payload) {
    const requestUrl = "https://shop.ezvizlife.com/goods/do-edit-goods";
    const response = await page.request.post(requestUrl, {
      data: { data: payload },
      headers: { "x-requested-with": "XMLHttpRequest" },
      timeout: 60000
    });
    const responseText = await response.text().catch(() => "");
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("产品保存接口返回的不是 JSON：" + responseText.slice(0, 200));
    }
    if (!response.ok() || Number(data?.status) !== 1) {
      throw new Error(data?.msg || data?.message || `产品保存接口返回异常（HTTP ${response.status()}）`);
    }
    return {
      requestUrl,
      responseStatus: response.status(),
      backendStatus: Number(data.status),
      redirect: data.redirect || ""
    };
  }

  async function preview(body, logs) {
    const request = validateRequest(body);
    const session = await prepareSession(body, logs);
    const results = [];
    for (const item of request.items) {
      logLine(logs, "检查 Detail 临时操作：" + item.productName);
      try {
        const snapshot = await readProductPcView(session.page, item.productName, logs);
        const plan = planDetailOperations(snapshot.pcView, item.operations);
        results.push({
          status: plan.matchCount ? "ready" : "no-match",
          productName: item.productName,
          goodsId: snapshot.goodsId,
          editUrl: snapshot.editInfo.editUrl,
          matchCount: plan.matchCount,
          operations: plan.steps
        });
      } catch (error) {
        results.push({
          status: "failed",
          productName: item.productName,
          matchCount: 0,
          operations: [],
          error: error?.message || String(error)
        });
      }
    }
    const matchCount = results.reduce((sum, item) => sum + (item.matchCount || 0), 0);
    return {
      mode: "detail-temporary-operation-preview",
      operation: request.operation,
      site: session.site,
      authenticatedIdentity: session.authenticatedIdentity,
      productCount: results.length,
      readyCount: results.filter((item) => item.status === "ready").length,
      noMatchCount: results.filter((item) => item.status === "no-match").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      matchCount,
      results
    };
  }

  async function submit(body, logs) {
    const request = validateRequest(body);
    const session = await prepareSession(body, logs);
    const results = [];
    for (const item of request.items) {
      logLine(logs, "开始执行 Detail 临时操作：" + item.productName);
      try {
        const before = await readProductPcView(session.page, item.productName, logs);
        const plan = planDetailOperations(before.pcView, item.operations);
        if (!plan.matchCount) {
          results.push({
            status: "no-match",
            productName: item.productName,
            goodsId: before.goodsId,
            editUrl: before.editInfo.editUrl,
            matchCount: 0,
            operations: plan.steps
          });
          continue;
        }

        const update = await buildSavePayload(session.page, item.operations);
        plan.steps.forEach((step, index) => {
          if (update.replacedCounts[index] !== step.matchCount) {
            throw new Error(
              `${step.label}保存前匹配数量发生变化：预览 ${step.matchCount}，`
              + `实际 ${update.replacedCounts[index]}。`
            );
          }
        });
        const save = await postProductUpdate(session.page, update.payload);
        const after = await readProductPcView(session.page, item.productName, logs);
        const operationChecks = plan.steps.map((step) => {
          const remainingTargetCount = collectDetailAddressMatches(
            after.pcView,
            step.targetText
          ).reduce((sum, match) => sum + match.count, 0);
          const finalReplacementCount = step.replacementText
            ? collectDetailAddressMatches(after.pcView, step.replacementText)
              .reduce((sum, match) => sum + match.count, 0)
            : 0;
          const passed = remainingTargetCount === 0
            && (!step.replacementText || finalReplacementCount >= step.expectedNewCount);
          if (!passed) {
            throw new Error(
              `${step.label}保存后回读失败：目标内容剩余 ${remainingTargetCount}，`
              + `替换后内容 ${finalReplacementCount}，预期至少 ${step.expectedNewCount}。`
            );
          }
          return {
            label: step.label,
            type: step.type,
            status: "passed",
            matchCount: step.matchCount,
            remainingTargetCount,
            finalReplacementCount,
            expectedNewCount: step.expectedNewCount
          };
        });
        results.push({
          status: "completed",
          productName: item.productName,
          goodsId: after.goodsId,
          editUrl: after.editInfo.editUrl,
          matchCount: plan.matchCount,
          operations: plan.steps,
          save,
          backendCheck: {
            status: "passed",
            operations: operationChecks
          }
        });
        logLine(logs, `Detail 临时操作并回读通过：${item.productName} / ${plan.matchCount} 处。`);
      } catch (error) {
        results.push({
          status: "failed",
          productName: item.productName,
          matchCount: 0,
          error: error?.message || String(error)
        });
        logLine(
          logs,
          "Detail 临时操作失败，继续下一个："
          + item.productName + " / " + (error?.message || String(error))
        );
      }
    }
    return {
      mode: "authenticated-detail-temporary-operation",
      operation: request.operation,
      site: session.site,
      authenticatedIdentity: session.authenticatedIdentity,
      productCount: results.length,
      completedCount: results.filter((item) => item.status === "completed").length,
      noMatchCount: results.filter((item) => item.status === "no-match").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      replacementCount: results
        .filter((item) => item.status === "completed")
        .reduce((sum, item) => sum + item.matchCount, 0),
      results
    };
  }

  return { preview, submit };
}

module.exports = {
  countOccurrences,
  collectDetailAddressMatches,
  replaceDetailAddress,
  buildDetailAddressReplacement,
  validateAddressPair,
  normalizeBatchItem,
  validateRequest,
  planDetailOperations,
  createDetailAddressReplacementFeature
};
