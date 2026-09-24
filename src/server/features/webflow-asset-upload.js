const crypto = require("crypto");
const { Agent } = require("undici");

const WEBFLOW_UPLOAD_API = "https://fs.ezvizlife.com/upload.php";
const WEBFLOW_UPLOAD_BUNDLE_URL = "http://h5-v2.ezviz-mall.com:8800/static/js/module/home.3bbb70eae65b09cf092c.js";
let webflowUploadSecret;
const directAssetDispatcher = new Agent();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWebflowAssetUrl(payload) {
  const uri = String(payload.uri || "").replace(/^\/+/, "");
  return uri
    ? (/^https?:\/\//i.test(uri)
      ? uri
      : /^mfs\.ezvizlife\.com\//i.test(uri)
        ? "https://" + uri
        : "https://mfs.ezvizlife.com/" + uri)
    : payload.full_url;
}

function validateWebflowUploadTarget(rawTarget) {
  const target = String(rawTarget || WEBFLOW_UPLOAD_API).trim();
  const parsed = new URL(target);
  if (parsed.protocol !== "https:" || parsed.hostname !== "fs.ezvizlife.com" || parsed.pathname !== "/upload.php") {
    throw new Error("Upload API is restricted to https://fs.ezvizlife.com/upload.php.");
  }
  return target;
}

async function getWebflowUploadSecret() {
  if (process.env.FS_UPLOAD_SECRET) return process.env.FS_UPLOAD_SECRET;
  if (webflowUploadSecret) return webflowUploadSecret;

  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(WEBFLOW_UPLOAD_BUNDLE_URL, {
        dispatcher: directAssetDispatcher,
        signal: AbortSignal.timeout(15000)
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(300 * (attempt + 1));
    }
  }
  if (!response) {
    throw new Error("无法读取 Webflow 上传配置：" + (lastError?.cause?.message || lastError?.message || String(lastError)));
  }
  if (!response.ok) throw new Error(`无法读取 Webflow 上传配置：HTTP ${response.status}`);
  const source = await response.text();
  const match = source.match(/const r=n\(456\),i="mall",a="([^"]+)";function s\(e\)/);
  if (!match) throw new Error("无法读取 Webflow 上传配置。");
  webflowUploadSecret = match[1];
  return webflowUploadSecret;
}

function createWebflowUploadToken(fileName, secret, now = Date.now()) {
  const time = String(Math.floor(now / 1000)).slice(-5);
  const input = `mall${secret}${time}${fileName}`;
  return crypto.createHash("md5").update(input, "utf8").digest("hex") + time + fileName;
}

function inferAssetMimeType(file) {
  const ext = String(file.originalname || file.filename || "").split(".").pop().toLowerCase();
  return file.mimetype || ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    svg: "image/svg+xml",
    gif: "image/gif"
  }[ext] || "application/octet-stream");
}

function normalizeSvgBuffer(buffer, file) {
  const isSvg = inferAssetMimeType(file) === "image/svg+xml" || /\.svg$/i.test(file.originalname || file.filename || "");
  if (!isSvg) return buffer;

  const source = Buffer.from(buffer).toString("utf8").replace(/^\uFEFF/, "");
  if (/^\s*<\?xml\b/i.test(source)) return buffer;
  return Buffer.from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + source, "utf8");
}

async function uploadWebflowAssetBuffer(buffer, file, rawTarget = WEBFLOW_UPLOAD_API) {
  const target = validateWebflowUploadTarget(rawTarget);
  const originalname = String(file.originalname || file.filename || "asset");
  const secret = await getWebflowUploadSecret();
  const form = new FormData();
  form.append("app", "mall");
  form.append("appid", "mall");
  form.append("flag", "static");
  form.append("is_org_name", "0");
  form.append("token", createWebflowUploadToken(originalname, secret));
  form.append("file", new Blob([normalizeSvgBuffer(buffer, file)], { type: inferAssetMimeType(file) }), originalname);

  let response;
  try {
    response = await fetch(target, { dispatcher: directAssetDispatcher, method: "POST", body: form });
  } catch (error) {
    throw new Error("上传 Webflow 素材失败：" + (error?.cause?.message || error?.message || String(error)));
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Asset upload failed: " + text.slice(0, 200));
  }
  if (!response.ok || !(payload.full_url || payload.uri)) {
    throw new Error("Asset upload failed: " + text.slice(0, 200));
  }
  return { url: normalizeWebflowAssetUrl(payload), payload };
}

module.exports = {
  WEBFLOW_UPLOAD_API,
  createWebflowUploadToken,
  getWebflowUploadSecret,
  normalizeWebflowAssetUrl,
  normalizeSvgBuffer,
  uploadWebflowAssetBuffer,
  validateWebflowUploadTarget
};
