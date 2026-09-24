const fs = require("fs");
const dns = require("dns").promises;
const net = require("net");
const path = require("path");
const {
  WEBFLOW_UPLOAD_API,
  createServiceUploadToken,
  createWebflowUploadToken,
  getWebflowUploadSecret,
  normalizeWebflowAssetUrl,
  uploadWebflowAssetBuffer,
  validateWebflowUploadTarget
} = require("../features/webflow-asset-upload");

const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
const FS_UPLOAD_URL = "https://fs.ezvizlife.com/upload.php";

async function uploadBufferToFs(target, buffer, file) {
  return uploadWebflowAssetBuffer(buffer, file, target);
}

async function uploadToFs(target, file) {
  return uploadBufferToFs(target, fs.readFileSync(file.path), file);
}

function isPdfDocument(file) {
  return /\.pdf$/i.test(String(file?.originalname || ""))
    || String(file?.mimetype || "").toLowerCase() === "application/pdf";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildDocumentListHtml(results) {
  return (results || [])
    .filter((item) => item?.ok && item.url)
    .map((item) => {
      const label = String(item.fileName || "").replace(/\.pdf$/i, "");
      return [
        "<li>",
        `    <a target="_blank" href="${escapeHtml(item.url)}">${escapeHtml(label)}</a>`,
        "</li>"
      ].join("\n");
    })
    .join("\n");
}

async function uploadDocumentToFs(file) {
  const originalname = String(file.originalname || "document.pdf");
  const secret = await getWebflowUploadSecret();
  const form = new FormData();
  form.append("app", "service");
  form.append("appid", "service");
  form.append("flag", "attach");
  form.append("quality", "100");
  form.append("ext", "pdf,zip,rar,exe,bin,dav,apk");
  form.append("size", "102400");
  form.append("path_rule", "custom");
  form.append("path", "");
  form.append("purge", "1");
  form.append("token", createServiceUploadToken(originalname, secret));
  form.append("file", new Blob([fs.readFileSync(file.path)], {
    type: file.mimetype || "application/pdf"
  }), originalname);

  const response = await fetch(FS_UPLOAD_URL, { method: "POST", body: form });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("文件服务返回格式异常：" + text.slice(0, 160));
  }

  if (!response.ok || payload.status === false) {
    throw new Error(payload.message || payload.msg || "HTTP " + response.status);
  }

  const url = normalizeWebflowAssetUrl(payload);
  if (!url) throw new Error("上传成功，但未返回文件地址。");
  return { url, payload };
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

      const target = validateWebflowUploadTarget(req.body?.uploadApi || WEBFLOW_UPLOAD_API);

      const result = await uploadToFs(target, req.file);
      res.json({ ok: true, url: result.url, payload: result.payload });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.post("/api/doc-upload", upload.array("files", 50), async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ ok: false, error: "请至少选择一个 PDF 文件。" });
    }

    const results = [];
    for (const file of files) {
      if (!isPdfDocument(file)) {
        results.push({ fileName: file.originalname, ok: false, error: "仅支持 PDF 文件。" });
        continue;
      }
      try {
        const result = await uploadDocumentToFs(file);
        results.push({ fileName: file.originalname, ok: true, url: result.url });
      } catch (error) {
        results.push({ fileName: file.originalname, ok: false, error: error?.message || String(error) });
      }
    }
    res.json({
      ok: results.some((item) => item.ok),
      results,
      html: buildDocumentListHtml(results)
    });
  });
}

module.exports = {
  registerAssetUploadRoutes,
  uploadToFs,
  uploadUrlToFs,
  uploadDocumentToFs,
  isPdfDocument,
  buildDocumentListHtml,
  createServiceUploadToken,
  createWebflowUploadToken,
  validateRemoteImageUrl,
  isPrivateAddress
};
