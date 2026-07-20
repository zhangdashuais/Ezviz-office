const fs = require("fs");
const path = require("path");

const IMAGE_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#].*)?$/i;

function normalize(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function isLocalImage(value) {
  const text = String(value || "").trim();
  return !!text && !/^(?:https?:)?\/\//i.test(text) && !/^(?:data:|javascript:|#)/i.test(text) && IMAGE_PATTERN.test(text);
}

function splitSuffix(value) {
  const match = String(value).match(/^([^?#]*)([?#].*)?$/);
  return { pathname: match?.[1] || value, suffix: match?.[2] || "" };
}

function collectReferences(html) {
  const values = [];
  let match;
  const attr = /\b(?:src|href)=(['"])([^'"]+)\1/gi;
  const srcset = /\bsrcset=(['"])(.*?)\1/gis;
  const css = /url\(\s*(['"]?)([^)'\"]+)\1\s*\)/gi;
  while ((match = attr.exec(html))) values.push(match[2].trim());
  while ((match = srcset.exec(html))) {
    match[2].split(",").forEach((entry) => {
      const url = entry.trim().replace(/\s+\d+(?:\.\d+)?[wx]\s*$/i, "");
      if (url) values.push(url);
    });
  }
  while ((match = css.exec(html))) values.push(match[2].trim());
  return [...new Set(values.filter(isLocalImage))];
}

function listImages(root) {
  const files = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.isFile() && IMAGE_PATTERN.test(item.name)) files.push(full);
    }
  }
  const imageRoot = path.join(root, "images");
  if (fs.existsSync(imageRoot)) walk(imageRoot);
  return files;
}

function resolveReference(root, reference, imageFiles) {
  const cleanRef = decodeURIComponent(splitSuffix(reference).pathname);
  const direct = path.resolve(root, cleanRef.replace(/\//g, path.sep));
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return { filePath: direct, method: "direct" };

  const normalizedRef = normalize(cleanRef);
  const parts = normalizedRef.split("/").filter(Boolean);
  const tail = parts.length > 1 ? parts.slice(1).join("/") : normalizedRef;
  const structural = imageFiles.filter((file) => {
    const relative = normalize(path.relative(root, file));
    return relative === tail || relative.endsWith("/" + tail);
  });
  if (structural.length === 1) return { filePath: structural[0], method: "structural-tail" };
  if (structural.length > 1) return { error: "路径匹配到多个文件", candidates: structural };

  const exactSuffix = imageFiles.filter((file) => normalize(path.relative(root, file)).endsWith("/" + normalizedRef));
  if (exactSuffix.length === 1) return { filePath: exactSuffix[0], method: "suffix" };
  return { error: "未找到对应本地图片" };
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".avif": "image/avif" })[ext] || "application/octet-stream";
}

function uploadedUrl(payload) {
  if (payload.full_url) return payload.full_url;
  const uri = String(payload.uri || "").replace(/^\/+/, "");
  if (/^https?:\/\//i.test(uri)) return uri;
  if (/^mfs\.ezvizlife\.com\//i.test(uri)) return "https://" + uri;
  return uri ? "https://mfs.ezvizlife.com/" + uri : "";
}

async function uploadImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("app", "mall");
  form.append("flag", "op_image");
  form.append("quality", "100");
  form.append("adapt", "1");
  form.append("file", new Blob([buffer], { type: mimeFor(filePath) }), path.basename(filePath));
  const response = await fetch("https://fs.ezvizlife.com/upload.php", { method: "POST", body: form });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("上传返回不是 JSON：" + text.slice(0, 160)); }
  const url = uploadedUrl(payload);
  if (!response.ok || !payload.status || !url) throw new Error(payload.msg || "上传接口未返回图片地址");
  return url;
}

function replaceReferences(html, mapping) {
  let result = html.replace(/(\b(?:src|href)=(['"]))([^'"]+)(\2)/gi, (all, prefix, quote, value, suffix) =>
    prefix + (mapping[value] || value) + suffix
  );
  result = result.replace(/(\bsrcset=(['"]))(.*?)(\2)/gis, (all, prefix, quote, value, suffix) => {
    const next = value.split(",").map((entry) => {
      const trimmed = entry.trim();
      const descriptor = trimmed.match(/\s+(\d+(?:\.\d+)?[wx])\s*$/i)?.[1] || "";
      const source = descriptor ? trimmed.slice(0, trimmed.length - descriptor.length).trimEnd() : trimmed;
      return (mapping[source] || source) + (descriptor ? " " + descriptor : "");
    }).join(", ");
    return prefix + next + suffix;
  });
  result = result.replace(/url\(\s*(['"]?)([^)'\"]+)\1\s*\)/gi, (all, quote, value) =>
    "url(" + quote + (mapping[value] || value) + quote + ")"
  );
  return result;
}

async function main() {
  const root = path.resolve(process.argv[2] || ".");
  const inputPath = path.join(root, "index.html");
  if (!fs.existsSync(inputPath)) throw new Error("未找到 index.html：" + inputPath);
  const html = fs.readFileSync(inputPath, "utf8");
  const references = collectReferences(html);
  const imageFiles = listImages(root);
  const mapping = {};
  const uploadsByFile = new Map();
  const records = [];

  for (const [index, reference] of references.entries()) {
    const resolved = resolveReference(root, reference, imageFiles);
    if (!resolved.filePath) {
      records.push({ reference, status: "skipped", error: resolved.error, candidates: resolved.candidates || [] });
      process.stdout.write(`[${index + 1}/${references.length}] 跳过 ${reference}：${resolved.error}\n`);
      continue;
    }
    try {
      let url = uploadsByFile.get(resolved.filePath);
      if (!url) {
        url = await uploadImage(resolved.filePath);
        uploadsByFile.set(resolved.filePath, url);
      }
      const suffix = splitSuffix(reference).suffix;
      mapping[reference] = url + suffix;
      records.push({ reference, localFile: resolved.filePath, matchMethod: resolved.method, status: "uploaded", url });
      process.stdout.write(`[${index + 1}/${references.length}] 已上传 ${reference} -> ${url}\n`);
    } catch (error) {
      records.push({ reference, localFile: resolved.filePath, status: "failed", error: error.message });
      process.stdout.write(`[${index + 1}/${references.length}] 上传失败 ${reference}：${error.message}\n`);
    }
  }

  const outputPath = path.join(root, "index.uploaded.html");
  const reportPath = path.join(root, "asset-upload-map.json");
  fs.writeFileSync(outputPath, replaceReferences(html, mapping), "utf8");
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), inputPath, outputPath, totalReferences: references.length, replaced: Object.keys(mapping).length, records }, null, 2), "utf8");
  process.stdout.write(JSON.stringify({ outputPath, reportPath, totalReferences: references.length, replaced: Object.keys(mapping).length }, null, 2) + "\n");
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = { collectReferences, resolveReference, replaceReferences };
