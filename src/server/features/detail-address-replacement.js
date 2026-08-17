const fs = require("fs");
const path = require("path");
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectWhitespaceFlexibleMatches(value, target, path = "pcView", matches = []) {
  const parts = String(target || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return matches;
  if (typeof value === "string") {
    const pattern = parts.map(escapeRegExp).join("\\s+");
    for (const match of value.matchAll(new RegExp(pattern, "g"))) {
      matches.push({ path, targetText: match[0] });
    }
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectWhitespaceFlexibleMatches(item, target, `${path}[${index}]`, matches));
    return matches;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectWhitespaceFlexibleMatches(item, target, `${path}.${key}`, matches));
  }
  return matches;
}

function extractGuidElement(text, target) {
  const trimmedTarget = String(target || "").trim();
  const root = trimmedTarget.match(/^<([a-z][\w:-]*)\b[^>]*\bdata-guid=["']([^"']+)["'][^>]*>/i);
  if (!root || !trimmedTarget.endsWith(`</${root[1]}>`)) return "";
  const openingPattern = new RegExp(`<${root[1]}\\b[^>]*\\bdata-guid=["']${escapeRegExp(root[2])}["'][^>]*>`, "ig");
  const openings = [...String(text || "").matchAll(openingPattern)];
  if (openings.length !== 1) return "";
  const tagPattern = new RegExp(`<(/?)${root[1]}\\b[^>]*>`, "ig");
  tagPattern.lastIndex = openings[0].index;
  let depth = 0;
  for (const match of String(text || "").matchAll(tagPattern)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return text.slice(openings[0].index, match.index + match[0].length);
  }
  return "";
}

function collectGuidElementMatches(value, target, path = "pcView", matches = []) {
  if (typeof value === "string") {
    const targetText = extractGuidElement(value, target);
    if (targetText) matches.push({ path, targetText });
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectGuidElementMatches(item, target, `${path}[${index}]`, matches));
    return matches;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectGuidElementMatches(item, target, `${path}.${key}`, matches));
  }
  return matches;
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
  if (targetText === replacementText) throw new Error(`${label}的新旧地址不能相同。`);
  return {
    type: "replace",
    label,
    targetText,
    replacementText
  };
}

function isAlbumPath(path) {
  const value = String(path || "");
  return !/(?:^|[.\[])pcView(?:$|[.\]])/i.test(value)
    && /(?:^|\.)(?:[^.[\]]*(?:album|gallery|master(?:pic|image)|(?:pic|image)(?:hd|high|original|large|big)|(?:hd|high|original|large|big)(?:pic|image)|product(?:pic|image)|(?:pic|image|img)s?(?:list)?)[^.[\]]*)(?=$|[.\[])/i.test(value);
}

function matchesAlbumBinding(pathText, modelPaths) {
  return (modelPaths || []).some((modelPath) =>
    pathText === modelPath || pathText.startsWith(`${modelPath}.`) || pathText.startsWith(`${modelPath}[`));
}

function collectAlbumImageEntries(value, pathText = "vm", entries = [], modelPaths = []) {
  if (typeof value === "string") {
    if ((isAlbumPath(pathText) || matchesAlbumBinding(pathText, modelPaths))
      && /^(?:https?:)?\/\//i.test(value.trim())) {
      entries.push({ path: pathText, value: value.trim() });
    }
    return entries;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectAlbumImageEntries(item, `${pathText}[${index}]`, entries, modelPaths));
    return entries;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectAlbumImageEntries(item, `${pathText}.${key}`, entries, modelPaths));
  }
  return entries;
}

function collectStringValueEntries(value, targets, pathText = "data", entries = []) {
  if (typeof value === "string") {
    if ((targets || []).includes(value.trim())) entries.push({ path: pathText, value: value.trim() });
    return entries;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectStringValueEntries(item, targets, `${pathText}[${index}]`, entries));
    return entries;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectStringValueEntries(item, targets, `${pathText}.${key}`, entries));
  }
  return entries;
}

function describeCandidateArray(entries) {
  const parsed = entries.map((entry) => {
    const match = entry.path.match(/^(.*)\[(\d+)\](.*)$/);
    return match ? { arrayPath: match[1], index: Number(match[2]), suffix: match[3] } : null;
  });
  const sameArray = parsed.length > 1 && parsed.every(Boolean)
    && parsed.every((item) => item.arrayPath === parsed[0].arrayPath && item.suffix === parsed[0].suffix);
  return {
    arrayPath: sameArray ? parsed[0].arrayPath : "",
    arrayIndexes: sameArray ? parsed.map((item) => item.index) : []
  };
}

function selectAlbumImageEntry(viewModel, modelPaths = []) {
  const entries = collectAlbumImageEntries(viewModel, "vm", [], modelPaths);
  const bound = entries.filter((entry) => matchesAlbumBinding(entry.path, modelPaths));
  const scoped = bound.length ? bound : entries;
  const preferred = scoped.filter((entry) => /(?:hd|high|original|large|big|master)/i.test(entry.path));
  const candidates = preferred.length ? preferred : scoped;
  if (!candidates.length) throw new Error("产品编辑页没有找到 Product Album 高清图地址。");
  if (candidates.length === 1) return candidates[0];

  const array = describeCandidateArray(candidates);
  return {
    ...candidates[0],
    candidatePaths: candidates.map((entry) => entry.path),
    targetTexts: [...new Set(candidates.map((entry) => entry.value))],
    albumArrayPath: array.arrayPath,
    albumArrayIndexes: array.arrayIndexes,
    collapseCandidates: true
  };
}

function validateAlbumImageSource(rawSource, productName) {
  const input = String(rawSource || "").trim();
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) {
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error(`${productName} 的 Product Album 高清图地址无效。`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error(`${productName} 的 Product Album 高清图必须使用无账号信息的 HTTPS 地址。`);
    }
    if (parsed.port && parsed.port !== "443") {
      throw new Error(`${productName} 的 Product Album 高清图地址只允许使用 HTTPS 默认端口。`);
    }
    return {
      type: "replace-album-image-source",
      label: "Product Album 高清图",
      sourceType: parsed.hostname.toLowerCase() === "mfs.ezvizlife.com" ? "mfs-url" : "remote-url",
      imageSource: parsed.href
    };
  }
  if (!path.isAbsolute(input)) {
    throw new Error(`${productName} 的 Product Album 高清图必须填写本机绝对路径或 HTTPS 图片地址。`);
  }
  const filePath = path.resolve(input);
  if (!/\.(?:jpe?g|png|webp)$/i.test(filePath)) {
    throw new Error(`${productName} 的 Product Album 高清图必须是 jpg、jpeg、png 或 webp 文件。`);
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${productName} 的 Product Album 高清图不存在：${filePath}`);
  }
  return {
    type: "replace-album-image-source",
    label: "Product Album 高清图",
    sourceType: "local-file",
    imageSource: filePath
  };
}

function isAlbumImageIndex(path, imageIndex) {
  return !imageIndex || String(path).includes(`[${imageIndex - 1}]`);
}

function collectAlbumImageMatches(value, target, path = "vm", matches = [], imageIndex = 0, fieldPath = "") {
  if (!target) return matches;
  if (typeof value === "string") {
    const count = (fieldPath ? path === fieldPath : isAlbumPath(path) && isAlbumImageIndex(path, imageIndex))
      ? countOccurrences(value, target)
      : 0;
    if (count) matches.push({ path, count });
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectAlbumImageMatches(item, target, `${path}[${index}]`, matches, imageIndex, fieldPath));
    return matches;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectAlbumImageMatches(item, target, `${path}.${key}`, matches, imageIndex, fieldPath));
  }
  return matches;
}

function replaceAlbumImage(value, targetText, replacementText, path = "vm", imageIndex = 0, fieldPath = "") {
  if (typeof value === "string") {
    return (fieldPath ? path === fieldPath : isAlbumPath(path) && isAlbumImageIndex(path, imageIndex))
      ? value.split(targetText).join(replacementText)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      replaceAlbumImage(item, targetText, replacementText, `${path}[${index}]`, imageIndex, fieldPath));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceAlbumImage(item, targetText, replacementText, `${path}.${key}`, imageIndex, fieldPath)
      ])
    );
  }
  return value;
}

function buildAlbumImageReplacement(viewModel, targetText, replacementText, imageIndex = 0, fieldPath = "") {
  const oldMatches = collectAlbumImageMatches(viewModel, targetText, "vm", [], imageIndex, fieldPath);
  const existingNewMatches = collectAlbumImageMatches(viewModel, replacementText, "vm", [], imageIndex, fieldPath);
  return {
    oldMatches,
    existingNewMatches,
    matchCount: oldMatches.reduce((sum, item) => sum + item.count, 0),
    existingNewCount: existingNewMatches.reduce((sum, item) => sum + item.count, 0),
    updatedViewModel: replaceAlbumImage(viewModel, targetText, replacementText, "vm", imageIndex, fieldPath)
  };
}

function validateAlbumReplacement(albumReplacement, productName) {
  const targetText = String(
    albumReplacement?.oldAddress ?? albumReplacement?.Old_Album_Image ?? ""
  ).trim();
  const replacementText = String(
    albumReplacement?.newAddress ?? albumReplacement?.New_Album_Image ?? ""
  ).trim();
  const rawIndex = String(
    albumReplacement?.index
      ?? albumReplacement?.albumImageIndex
      ?? albumReplacement?.Album_Image_Index
      ?? ""
  ).trim();
  if (!targetText && !replacementText && !rawIndex) return null;
  if (!targetText || !replacementText) {
    throw new Error(`${productName} 的 Product Album 高清图必须同时填写替换前和替换后地址。`);
  }
  if (targetText === replacementText) throw new Error(`${productName} 的 Product Album 高清图新旧地址不能相同。`);
  const imageIndex = rawIndex ? Number(rawIndex) : 0;
  if (rawIndex && (!Number.isInteger(imageIndex) || imageIndex < 1)) {
    throw new Error(`${productName} 的 Album_Image_Index 必须是大于 0 的整数。`);
  }
  return {
    type: "replace-album-image",
    label: "Product Album 高清图",
    targetText,
    replacementText,
    imageIndex
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
    if (body.items.length > 60) throw new Error("一次最多处理 60 个产品。");
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
  const operation = body?.operation === "delete"
    ? body.operation
    : "replace";
  const rawTargetText = String(body?.targetText ?? body?.codeBlock ?? body?.oldUrl ?? "");
  const targetText = operation === "delete" ? rawTargetText : rawTargetText.trim();
  const replacementText = operation === "delete"
    ? ""
    : String(body?.replacementText ?? body?.newUrl ?? "").trim();
  if (!productNames.length) throw new Error("请填写至少一个产品名称。");
  if (productNames.length > 60) throw new Error("一次最多处理 60 个产品。");

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
    let effectiveOperation = operation;
    let matchingMode = "exact";
    let analysis = buildDetailAddressReplacement(
      updatedPcView,
      operation.targetText,
      operation.replacementText
    );
    if (operation.type === "delete" && !analysis.matchCount) {
      const flexibleMatches = collectWhitespaceFlexibleMatches(updatedPcView, operation.targetText);
      if (flexibleMatches.length === 1) {
        effectiveOperation = { ...operation, targetText: flexibleMatches[0].targetText };
        matchingMode = "whitespace-flexible";
        analysis = buildDetailAddressReplacement(
          updatedPcView,
          effectiveOperation.targetText,
          operation.replacementText
        );
      }
    }
    if (operation.type === "delete" && !analysis.matchCount) {
      const guidMatches = collectGuidElementMatches(updatedPcView, operation.targetText);
      if (guidMatches.length === 1) {
        effectiveOperation = { ...operation, targetText: guidMatches[0].targetText };
        matchingMode = "guid-element";
        analysis = buildDetailAddressReplacement(
          updatedPcView,
          effectiveOperation.targetText,
          operation.replacementText
        );
      }
    }
    updatedPcView = analysis.updatedPcView;
    return {
      ...effectiveOperation,
      matchingMode,
      matchCount: analysis.matchCount,
      matches: analysis.oldMatches,
      existingNewCount: analysis.existingNewCount,
      expectedNewCount: effectiveOperation.replacementText
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

function planAlbumOperations(viewModel, operations) {
  let updatedViewModel = viewModel;
  const steps = operations.map((operation) => {
    const analysis = buildAlbumImageReplacement(
      updatedViewModel,
      operation.targetText,
      operation.replacementText,
      operation.imageIndex,
      operation.fieldPath
    );
    updatedViewModel = analysis.updatedViewModel;
    return {
      ...operation,
      matchingMode: "album-path",
      matchCount: analysis.matchCount,
      matches: analysis.oldMatches,
      existingNewCount: analysis.existingNewCount,
      expectedNewCount: analysis.existingNewCount + analysis.matchCount
    };
  });
  return {
    steps,
    updatedViewModel,
    matchCount: steps.reduce((sum, step) => sum + step.matchCount, 0)
  };
}

function planAlbumFileOperations(viewModel, saveModel, operations, albumModelPaths = []) {
  const steps = operations.map((operation) => {
    const target = selectAlbumImageEntry(viewModel, albumModelPaths);
    const targetTexts = target.targetTexts || [target.value];
    const payloadCandidates = collectStringValueEntries(saveModel, targetTexts);
    if (!payloadCandidates.length) {
      throw new Error("Product Album 高清图在后台保存模型中没有找到对应字段。");
    }
    const payloadArray = describeCandidateArray(payloadCandidates);
    return {
      ...operation,
      targetText: target.value,
      targetTexts,
      replacementText: "",
      fieldPath: target.path,
      candidatePaths: target.candidatePaths || [target.path],
      albumArrayPath: target.albumArrayPath || "",
      albumArrayIndexes: target.albumArrayIndexes || [],
      collapseCandidates: !!target.collapseCandidates,
      payloadCandidatePaths: payloadCandidates.map((entry) => entry.path),
      payloadArrayPath: payloadArray.arrayPath,
      payloadArrayIndexes: payloadArray.arrayIndexes,
      matchingMode: "product-album-field",
      matchCount: (target.candidatePaths || [target.path]).length,
      matches: (target.candidatePaths || [target.path]).map((path) => ({ path, count: 1 })),
      existingNewCount: 0,
      expectedNewCount: 1
    };
  });
  return { steps, matchCount: steps.length };
}

function planProductOperations(snapshot, operations) {
  const detailOperations = operations.filter((operation) =>
    !["replace-album-image", "replace-album-image-source"].includes(operation.type));
  const albumOperations = operations.filter((operation) => operation.type === "replace-album-image");
  const albumFileOperations = operations.filter((operation) => operation.type === "replace-album-image-source");
  const detailPlan = planDetailOperations(snapshot.pcView, detailOperations);
  const albumPlan = planAlbumOperations(snapshot.viewModel, albumOperations);
  const albumFilePlan = planAlbumFileOperations(
    snapshot.viewModel,
    snapshot.saveModel || snapshot.viewModel,
    albumFileOperations,
    snapshot.albumModelPaths
  );
  return {
    steps: [...detailPlan.steps, ...albumPlan.steps, ...albumFilePlan.steps],
    matchCount: detailPlan.matchCount + albumPlan.matchCount + albumFilePlan.matchCount
  };
}

function isTransientShopLogoutMessage(message) {
  return /账号.*退出|退出.*刷新|重新刷新|登录.*失效|未登录/.test(String(message || ""));
}

function createDetailAddressReplacementFeature(deps) {
  const {
    logLine,
    readCampaignConfig,
    getCampaignSites,
    requireSingleCampaignSite,
    getShopContext,
    getOpenPage,
    ensureShopLoggedIn,
    credentialDomainForSite,
    openProductEditorByName,
    resolveAlbumImageSource
  } = deps;

  function requestBodyForSite(body) {
    return body?.sites || !body?.siteCode
      ? (body || {})
      : { ...(body || {}), sites: [String(body.siteCode).trim()] };
  }

  function selectedSites(body) {
    const raw = body?.sites ?? body?.siteCode;
    const codes = (Array.isArray(raw) ? raw : String(raw || "").split(","))
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    if (!codes.length) throw new Error("请选择国家站点。");
    const allSites = getCampaignSites(readCampaignConfig()).filter((site) => site.enabled !== false);
    const byCode = new Map(allSites.map((site) => [site.siteCode.toLowerCase(), site]));
    const unique = [...new Set(codes)];
    const sites = unique.map((code) => byCode.get(code));
    if (sites.some((site) => !site)) {
      throw new Error(`目标站点不存在或未启用：${unique.find((code) => !byCode.has(code))}。`);
    }
    return sites;
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
      const albumModelPaths = [];
      const labels = [...document.querySelectorAll("label, th, td, span, div")]
        .filter((element) => /^product\s+album\s*[:：*]?$/i.test((element.textContent || "").trim()));
      labels.forEach((label) => {
        const container = label.closest("tr, .form-group, .control-group, .row") || label.parentElement;
        [container, ...(container?.querySelectorAll("*") || [])].filter(Boolean).forEach((element) => {
          [...element.attributes].forEach((attribute) => {
            const paths = attribute.value.match(/\bvm(?:\.[A-Za-z_$][\w$]*|\[\d+\])+/g) || [];
            paths.forEach((modelPath) => {
              if (!albumModelPaths.includes(modelPath)) albumModelPaths.push(modelPath);
            });
          });
        });
      });
      scope.vm.tabNav.moveTo(2);
      (scope.$root || scope).$applyAsync?.();
      return {
        goodsId: String(scope.goodsId),
        viewModel: JSON.parse(JSON.stringify(scope.vm || {})),
        saveModel: JSON.parse(JSON.stringify(scope.md.toModel(scope.vm) || {})),
        pcView: JSON.parse(JSON.stringify(scope.vm.pcView || {})),
        albumModelPaths
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
        if (operation.type === "replace-album-image-ui") {
          replacedCounts.push(operation.matchCount || 1);
          return;
        }
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
        function updateAlbum(value, path = "vm") {
          const candidatePaths = operation.candidatePaths || [];
          const candidateIndex = candidatePaths.indexOf(path);
          const isAlbumPath = operation.fieldPath
            ? path === operation.fieldPath
            : /(?:^|\.)(?:[^.[\]]*(?:album|gallery)[^.[\]]*)(?=$|[.\[])/i.test(path)
              && !/(?:^|[.\[])pcView(?:$|[.\]])/i.test(path);
          const isSelectedImage = !operation.imageIndex
            || path.includes(`[${operation.imageIndex - 1}]`);
          if (typeof value === "string") {
            if (operation.collapseCandidates && candidateIndex >= 0) {
              replaced += 1;
              return candidateIndex === 0 ? operation.replacementText : "";
            }
            if (!isAlbumPath || !isSelectedImage) return value;
            const count = value.split(operation.targetText).length - 1;
            replaced += count;
            return value.split(operation.targetText).join(operation.replacementText);
          }
          if (Array.isArray(value)) {
            value.forEach((item, index) => { value[index] = updateAlbum(item, `${path}[${index}]`); });
            if (operation.collapseCandidates && path === operation.albumArrayPath) {
              const indexes = new Set(operation.albumArrayIndexes || []);
              const keepIndex = (operation.albumArrayIndexes || [])[0];
              value.splice(0, value.length, ...value.filter((_item, index) => !indexes.has(index) || index === keepIndex));
            }
            return value;
          }
          if (value && typeof value === "object") {
            Object.keys(value).forEach((key) => { value[key] = updateAlbum(value[key], `${path}.${key}`); });
          }
          return value;
        }
        if (operation.type === "replace-album-image") updateAlbum(scope.vm);
        else update(scope.vm.pcView);
        replacedCounts.push(replaced);
      }
      operationList.forEach(applyOperation);
      const data = scope.md.toModel(scope.vm);
      function syncAlbumPayload(value, operation, path = "data") {
        const candidatePaths = operation.payloadCandidatePaths || [];
        const candidateIndex = candidatePaths.indexOf(path);
        if (typeof value === "string") {
          if (operation.collapseCandidates && candidateIndex >= 0) {
            return candidateIndex === 0 ? operation.replacementText : "";
          }
          if (candidateIndex < 0) return value;
          return value.split(operation.targetText).join(operation.replacementText);
        }
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            value[index] = syncAlbumPayload(item, operation, `${path}[${index}]`);
          });
          if (operation.collapseCandidates && path === operation.payloadArrayPath) {
            const indexes = new Set(operation.payloadArrayIndexes || []);
            const keepIndex = (operation.payloadArrayIndexes || [])[0];
            value.splice(0, value.length, ...value.filter((_item, index) => !indexes.has(index) || index === keepIndex));
          }
          return value;
        }
        if (value && typeof value === "object") {
          Object.keys(value).forEach((key) => {
            value[key] = syncAlbumPayload(value[key], operation, `${path}.${key}`);
          });
        }
        return value;
      }
      operationList
        .filter((operation) => operation.type === "replace-album-image")
        .forEach((operation) => syncAlbumPayload(data, operation));
      data.goods_id = scope.goodsId;
      const payloadText = JSON.stringify(data);
      const payloadChecks = operationList.map((operation) => ({
        oldCount: (operation.targetTexts || [operation.targetText])
          .reduce((sum, target) => sum + (target ? payloadText.split(target).length - 1 : 0), 0),
        newCount: operation.replacementText ? payloadText.split(operation.replacementText).length - 1 : 0
      }));
      return { payload: data, replacedCounts, payloadChecks };
    }, operations.map(({
      type, targetText, replacementText, imageIndex, fieldPath, candidatePaths, matchCount,
      albumArrayPath, albumArrayIndexes, collapseCandidates, payloadCandidatePaths,
      payloadArrayPath, payloadArrayIndexes
    }) => ({
      type,
      matchCount,
      targetText,
      replacementText,
      imageIndex,
      fieldPath,
      candidatePaths,
      albumArrayPath,
      albumArrayIndexes,
      collapseCandidates,
      payloadCandidatePaths,
      payloadArrayPath,
      payloadArrayIndexes
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
      const message = data?.msg || data?.message || `产品保存接口返回异常（HTTP ${response.status()}）`;
      if (!isTransientShopLogoutMessage(message)) throw new Error(message);
      return {
        requestUrl,
        responseStatus: response.status(),
        backendStatus: Number(data?.status || 0),
        reportedError: message,
        requiresReadback: true
      };
    }
    return {
      requestUrl,
      responseStatus: response.status(),
      backendStatus: Number(data.status),
      redirect: data.redirect || ""
    };
  }

  async function previewSingle(body, logs) {
    const request = validateRequest(body);
    const session = await prepareSession(body, logs);
    const results = [];
    for (const item of request.items) {
      logLine(logs, "检查 Detail 临时操作：" + item.productName);
      try {
        const snapshot = await readProductPcView(session.page, item.productName, logs);
        const plan = planProductOperations(snapshot, item.operations);
        results.push({
          status: plan.matchCount ? "ready" : "no-match",
          productName: item.productName,
          goodsId: snapshot.goodsId,
          editUrl: snapshot.editInfo.editUrl,
          matchCount: plan.matchCount,
          operations: plan.steps
        });
      } catch (error) {
        if (error?.code === "TASK_CANCELLED") throw error;
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

  async function submitSingle(body, logs) {
    const request = validateRequest(body);
    const session = await prepareSession(body, logs);
    const results = [];
    for (const item of request.items) {
      logLine(logs, "开始执行 Detail 临时操作：" + item.productName);
      try {
        const before = await readProductPcView(session.page, item.productName, logs);
        const plan = planProductOperations(before, item.operations);
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

        const saveSteps = [];
        for (const step of plan.steps) {
          if (step.type !== "replace-album-image-source") {
            saveSteps.push(step);
            continue;
          }
          const uploadResult = await replaceAlbumUsingUploader(session.page, step);
          if (!uploadResult.thumbnail?.big_img) {
            throw new Error("Product Album 上传组件没有返回高清图地址。");
          }
          logLine(logs, `Product Album 高清图已通过后台上传组件生成：${uploadResult.thumbnail.big_img}`);
          saveSteps.push({
            ...step,
            type: "replace-album-image-ui",
            replacementText: uploadResult.thumbnail.big_img,
            expectedNewCount: 1
          });
        }

        const update = await buildSavePayload(session.page, saveSteps);
        saveSteps.forEach((step, index) => {
          if (update.replacedCounts[index] !== step.matchCount) {
            throw new Error(
              `${step.label}保存前匹配数量发生变化：预览 ${step.matchCount}，`
              + `实际 ${update.replacedCounts[index]}。`
            );
          }
          if (step.type === "replace-album-image" && update.payloadChecks[index]?.newCount < 1) {
            throw new Error(
              `${step.label}保存载荷生成失败：新图数量 ${update.payloadChecks[index]?.newCount ?? 0}。`
            );
          }
        });
        const save = await postProductUpdate(session.page, update.payload);
        const after = await readProductPcView(session.page, item.productName, logs);
        const operationChecks = saveSteps.map((step) => {
          const isAlbumStep = ["replace-album-image", "replace-album-image-ui"].includes(step.type);
          const remainingTargetCount = (isAlbumStep
            ? (step.collapseCandidates
              ? (step.targetTexts || [step.targetText]).flatMap((targetText) =>
                (step.candidatePaths || [step.fieldPath]).flatMap((fieldPath) =>
                  collectAlbumImageMatches(after.viewModel, targetText, "vm", [], step.imageIndex, fieldPath)))
              : collectAlbumImageMatches(after.viewModel, step.targetText, "vm", [], step.imageIndex, step.fieldPath))
            : collectDetailAddressMatches(after.pcView, step.targetText)
          ).reduce((sum, match) => sum + match.count, 0);
          const finalReplacementCount = step.replacementText
            ? (isAlbumStep
              ? collectAlbumImageMatches(after.viewModel, step.replacementText, "vm", [], step.imageIndex, step.fieldPath)
              : collectDetailAddressMatches(after.pcView, step.replacementText)
            ).reduce((sum, match) => sum + match.count, 0)
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
          operations: saveSteps,
          save,
          backendCheck: {
            status: "passed",
            operations: operationChecks
          }
        });
        if (save.requiresReadback) {
          logLine(logs, `后台曾提示“${save.reportedError}”，但 ${item.productName} 回读确认修改已生效，已忽略该误报。`);
        }
        logLine(logs, `Detail 临时操作并回读通过：${item.productName} / ${plan.matchCount} 处。`);
      } catch (error) {
        if (error?.code === "TASK_CANCELLED") throw error;
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

  async function preview(body, logs) {
    const sites = selectedSites(body);
    const results = [];
    for (const site of sites) {
      try {
        results.push(await previewSingle({ ...(body || {}), sites: [site.siteCode] }, logs));
      } catch (error) {
        if (error?.code === "TASK_CANCELLED") throw error;
        results.push({
          mode: "detail-temporary-operation-preview",
          site,
          productCount: 0,
          readyCount: 0,
          noMatchCount: 0,
          failedCount: 1,
          matchCount: 0,
          results: [],
          error: error?.message || String(error)
        });
      }
    }
    if (results.length === 1) return results[0];
    return {
      mode: "detail-temporary-operation-multi-preview",
      sites: results,
      siteCount: results.length,
      productCount: results.reduce((sum, item) => sum + item.productCount, 0),
      readyCount: results.reduce((sum, item) => sum + item.readyCount, 0),
      noMatchCount: results.reduce((sum, item) => sum + item.noMatchCount, 0),
      failedCount: results.reduce((sum, item) => sum + item.failedCount, 0),
      matchCount: results.reduce((sum, item) => sum + item.matchCount, 0)
    };
  }

  async function submit(body, logs) {
    const sites = selectedSites(body);
    const results = [];
    for (const site of sites) {
      try {
        results.push(await submitSingle({ ...(body || {}), sites: [site.siteCode] }, logs));
      } catch (error) {
        if (error?.code === "TASK_CANCELLED") throw error;
        results.push({
          mode: "authenticated-detail-temporary-operation",
          site,
          productCount: 0,
          completedCount: 0,
          noMatchCount: 0,
          failedCount: 1,
          replacementCount: 0,
          results: [],
          error: error?.message || String(error)
        });
      }
    }
    if (results.length === 1) return results[0];
    return {
      mode: "authenticated-detail-temporary-operation-multi",
      sites: results,
      siteCount: results.length,
      productCount: results.reduce((sum, item) => sum + item.productCount, 0),
      completedCount: results.reduce((sum, item) => sum + item.completedCount, 0),
      noMatchCount: results.reduce((sum, item) => sum + item.noMatchCount, 0),
      failedCount: results.reduce((sum, item) => sum + item.failedCount, 0),
      replacementCount: results.reduce((sum, item) => sum + item.replacementCount, 0)
    };
  }

  async function replaceAlbumUsingUploader(page, operation) {
    let filePath = operation.imageSource;
    let tempDir = "";
    if (operation.sourceType !== "local-file") {
      const response = await fetch(operation.imageSource, {
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`下载 Product Album 高清图失败：HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 25 * 1024 * 1024) throw new Error("Product Album 高清图不能超过 25 MB。");
      const ext = String(new URL(operation.imageSource).pathname).match(/\.(png|jpe?g|webp)$/i)?.[1] || "png";
      tempDir = path.join(process.cwd(), "runtime_uploads", `album-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(tempDir, { recursive: true });
      filePath = path.join(tempDir, `product-album.${ext}`);
      fs.writeFileSync(filePath, buffer);
    }
    try {
      const before = await page.evaluate(() => {
        const scope = window.angular.element(document.querySelector("#replenish")).scope();
        return JSON.parse(JSON.stringify(scope.vm?.basic?.thumbnails || []));
      });
      await page.setInputFiles("#picker input[type=file]", filePath);
      await page.waitForFunction((oldSources) => {
        const scope = window.angular.element(document.querySelector("#replenish")).scope();
        const thumbnails = scope.vm?.basic?.thumbnails || [];
        return thumbnails.some((item) => item?.src && !oldSources.includes(item.src));
      }, before.map((item) => item.src), { timeout: 60000 });
      return page.evaluate((oldSources) => {
        const scope = window.angular.element(document.querySelector("#replenish")).scope();
        const thumbnails = scope.vm.basic.thumbnails || [];
        const uploaded = [...thumbnails].reverse().find((item) => item?.src && !oldSources.includes(item.src));
        if (!uploaded) throw new Error("上传组件没有返回新的 Product Album 图片记录。");
        delete uploaded.id;
        uploaded.big_img = uploaded.big_img || uploaded.src;
        uploaded.middle_img = uploaded.middle_img || uploaded.src;
        uploaded.small_img = uploaded.small_img || uploaded.src;
        ["src", "big_img", "middle_img", "small_img"].forEach((key) => {
          if (String(uploaded[key] || "").startsWith("//")) uploaded[key] = "https:" + uploaded[key];
        });
        uploaded.is_default = 1;
        uploaded.isDefault = true;
        scope.vm.basic.thumbnails.splice(0, scope.vm.basic.thumbnails.length, uploaded);
        (scope.$root || scope).$applyAsync?.();
        const saveModel = scope.md.toModel(scope.vm);
        return {
          thumbnail: JSON.parse(JSON.stringify(uploaded)),
          saveImage: JSON.parse(JSON.stringify(saveModel?.images?.[0] || null))
        };
      }, before.map((item) => item.src));
    } finally {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async function diagnoseAlbum(body, logs) {
    const productName = String(body?.productName || "").trim();
    if (!productName) throw new Error("请填写产品名称。");
    const session = await prepareSession(body, logs);
    const snapshot = await readProductPcView(session.page, productName, logs);
    const pageDetails = await session.page.evaluate(() => {
      const scope = window.angular.element(document.querySelector("#replenish")).scope();
      const saveModel = scope.md.toModel(scope.vm);
      const labels = [...document.querySelectorAll("label, th, td, span, div")]
        .filter((element) => /^product\s+album\s*[:：*]?$/i.test((element.textContent || "").trim()));
      const containers = labels.map((label) =>
        label.closest("tr, .form-group, .control-group, .row") || label.parentElement).filter(Boolean);
      const methodNames = [];
      let current = scope;
      for (let depth = 0; current && depth < 3; depth += 1, current = Object.getPrototypeOf(current)) {
        Object.getOwnPropertyNames(current).forEach((key) => {
          if (/(?:image|img|thumb|upload|album)/i.test(key) && typeof scope[key] === "function" && !methodNames.includes(key)) {
            methodNames.push(key);
          }
        });
      }
      return {
        thumbnail: JSON.parse(JSON.stringify(scope.vm?.basic?.thumbnails?.[0] || null)),
        saveImage: JSON.parse(JSON.stringify(saveModel?.images?.[0] || null)),
        saveImagesCount: Array.isArray(saveModel?.images) ? saveModel.images.length : 0,
        albumHtml: containers.map((container) => container.outerHTML).join("\n").slice(0, 20000),
        thumbnailBindings: [...document.querySelectorAll("*")]
          .filter((element) => [...element.attributes].some((attribute) =>
            /vm\.basic\.thumbnails|basic\.setDefault|basic\.deleteItem/.test(attribute.value)))
          .map((element) => element.outerHTML).join("\n").slice(0, 30000),
        scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
        methodNames
      };
    });
    return {
      site: session.site,
      productName,
      goodsId: snapshot.goodsId,
      albumModelPaths: snapshot.albumModelPaths,
      ...pageDetails
    };
  }

  return { preview, submit, diagnoseAlbum };
}

module.exports = {
  countOccurrences,
  collectDetailAddressMatches,
  replaceDetailAddress,
  collectWhitespaceFlexibleMatches,
  collectGuidElementMatches,
  collectAlbumImageMatches,
  buildAlbumImageReplacement,
  buildDetailAddressReplacement,
  validateAddressPair,
  validateAlbumReplacement,
  normalizeBatchItem,
  validateRequest,
  planDetailOperations,
  planProductOperations,
  isTransientShopLogoutMessage,
  createDetailAddressReplacementFeature
};
