const fs = require("fs");
const dns = require("dns").promises;
const net = require("net");
const path = require("path");

const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function normalizeUploadedUrl(payload) {
  const uri = String(payload.uri || "").replace(/^\/+/, "");
  return uri
    ? (/^https?:\/\//i.test(uri)
      ? uri
      : /^mfs\.ezvizlife\.com\//i.test(uri)
        ? "https://" + uri
        : "https://mfs.ezvizlife.com/" + uri)
    : payload.full_url;
}

async function uploadBufferToFs(target, buffer, file) {
  const ext = String(file.originalname || file.filename || "").split(".").pop().toLowerCase();
  const mime = file.mimetype || ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  }[ext] || "application/octet-stream");
  const isStaticAsset = ext === "css" || ext === "js";
  const dataCandidates = isStaticAsset
    ? [{ app: "mall", flag: "static", is_org_name: "0", _debug: "1" }]
    : [
        { app: "mall", flag: "static", is_org_name: "0", _debug: "1" },
        { app: "mall", flag: "op_image", quality: "90", _debug: "1" },
        { app: "mall", flag: "op_image", quality: "100", adapt: "1" },
        { app: "mall", mall: "1", flag: "1", cover: "1", quality: "100", adapt: "1" },
        { app: "mall", quality: "100", adapt: "1" },
        {}
      ];

  let lastText = "";
  for (const data of dataCandidates) {
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => form.append(key, value));
    form.append("file", new Blob([buffer], { type: mime }), file.originalname);

    const response = await fetch(target, { method: "POST", body: form });
    const text = await response.text();
    lastText = text;

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      continue;
    }

    if (response.ok && (payload.full_url || payload.uri)) {
      return { url: normalizeUploadedUrl(payload), payload };
    }
  }

  throw new Error("Asset upload failed: " + lastText.slice(0, 200));
}

async function uploadToFs(target, file) {
  return uploadBufferToFs(target, fs.readFileSync(file.path), file);
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    const mapped = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    return normalized === "::" || normalized === "::1"
      || normalized.startsWith("fc") || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || Boolean(mapped && isPrivateAddress(mapped[1]));
  }
  return true;
}

function validateRemoteImageUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim());
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Product Album 图片地址必须是无账号信息的 HTTPS 地址。");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("Product Album 图片地址只允许使用 HTTPS 默认端口。");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")
    || (net.isIP(hostname) && isPrivateAddress(hostname))) {
    throw new Error("Product Album 图片地址不能指向本机或内网地址。");
  }
  return parsed;
}

async function assertPublicHost(parsed) {
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Product Album 图片地址解析到了本机、内网或保留地址。");
  }
}

async function downloadRemoteImage(rawUrl) {
  let current = validateRemoteImageUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    await assertPublicHost(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 5) throw new Error("Product Album 图片地址重定向次数过多。");
      current = validateRemoteImageUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) throw new Error(`下载 Product Album 图片失败：HTTP ${response.status}`);

    const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_MIME_TO_EXT[mime];
    if (!ext) throw new Error("Product Album 远程地址必须返回 jpg、png 或 webp 图片。");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_REMOTE_IMAGE_BYTES) throw new Error("Product Album 图片不能超过 25 MB。");

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REMOTE_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("Product Album 图片不能超过 25 MB。");
      }
      chunks.push(Buffer.from(value));
    }
    const originalBase = path.basename(current.pathname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const originalname = /\.(?:jpe?g|png|webp)$/i.test(originalBase)
      ? originalBase
      : `product-album.${ext}`;
    return { buffer: Buffer.concat(chunks), file: { originalname, mimetype: mime } };
  }
  throw new Error("下载 Product Album 图片失败。");
}

async function uploadUrlToFs(target, rawUrl) {
  const downloaded = await downloadRemoteImage(rawUrl);
  return uploadBufferToFs(target, downloaded.buffer, downloaded.file);
}

function registerAssetUploadRoutes(app, { upload }) {
  app.post("/api/assets/upload-image", upload.single("file"), async (req, res) => {
    try {
      if (!req.file?.path || !fs.existsSync(req.file.path)) {
        throw new Error("No file received for upload.");
      }

      const target = String(req.body?.uploadApi || "https://fs.ezvizlife.com/upload.php").trim();
      const parsed = new URL(target);
      if (parsed.protocol !== "https:" || parsed.hostname !== "fs.ezvizlife.com" || parsed.pathname !== "/upload.php") {
        throw new Error("Upload API is restricted to https://fs.ezvizlife.com/upload.php.");
      }

      const result = await uploadToFs(target, req.file);
      res.json({ ok: true, url: result.url, payload: result.payload });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });
}

module.exports = {
  registerAssetUploadRoutes,
  uploadToFs,
  uploadUrlToFs,
  validateRemoteImageUrl,
  isPrivateAddress
};
