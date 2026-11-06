const LEGACY_PRODUCT_API = "https://shop.ezvizlife.com/goods/edit-goods";

function goodsIdFromEditorUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:"
      || !/^(?:shop|new-shop|new-[a-z]{2,3}-shop)\.ezvizlife\.com$/i.test(url.hostname)) return "";
    const match = url.pathname.match(/^\/goods\/edit\/(\d+)\/?$/);
    if (match) return match[1];
    if (/^\/goods\/(?:add|edit)$/.test(url.pathname)) {
      const id = url.searchParams.get("id") || url.searchParams.get("goods_id");
      return /^\d+$/.test(id || "") ? id : "";
    }
    return "";
  } catch {
    return "";
  }
}

async function readProductBackendRecord(page, options = {}) {
  const goodsId = String(options.goodsId || goodsIdFromEditorUrl(page.url()));
  if (!/^\d+$/.test(goodsId)) throw new Error("产品编辑地址中没有有效的 goods_id。" + page.url());
  const url = `${LEGACY_PRODUCT_API}?goods_id=${encodeURIComponent(goodsId)}`;
  const response = await page.request.get(url, {
    headers: { "x-requested-with": "XMLHttpRequest" },
    timeout: 60000
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`产品数据接口没有返回 JSON（HTTP ${response.status()}）。`); }
  const record = result?.data;
  if (!response.ok() || !result?.status || !record || typeof record !== "object") {
    throw new Error(result?.msg || `产品数据读取失败（HTTP ${response.status()}）。`);
  }
  if (String(record.goods_id) !== goodsId) {
    throw new Error(`产品 goods_id 不一致：期望 ${goodsId}，实际 ${record.goods_id ?? "空"}。`);
  }
  if (options.productName) {
    const normalize = (value) => String(value || "").normalize("NFKC")
      .replace(/\u207a/g, "+").replace(/\s+/g, " ").trim().toLowerCase();
    if (normalize(record.name) !== normalize(options.productName)) {
      throw new Error(`产品名称不一致：期望 ${options.productName}，实际 ${record.name || "空"}。`);
    }
  }
  return record;
}

function pcViewFromBackendRecord(record) {
  return {
    summary: String(record?.summary_intro || ""),
    customs: (Array.isArray(record?.extra) ? record.extra : []).map((item) => ({
      name: String(item?.name_key || ""),
      value: String(item?.name_value || "")
    }))
  };
}

module.exports = {
  LEGACY_PRODUCT_API,
  goodsIdFromEditorUrl,
  readProductBackendRecord,
  pcViewFromBackendRecord
};
