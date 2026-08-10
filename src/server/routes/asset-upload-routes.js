const fs = require("fs");

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

async function uploadToFs(target, file) {
  const buffer = fs.readFileSync(file.path);
  const mime = file.mimetype || "application/octet-stream";
  const ext = String(file.originalname || file.filename || "").split(".").pop().toLowerCase();
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

module.exports = { registerAssetUploadRoutes };
