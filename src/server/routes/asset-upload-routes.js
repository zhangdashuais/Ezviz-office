const fs = require("fs");

function registerAssetUploadRoutes(app, { upload }) {
  app.post("/api/assets/upload-image", upload.single("file"), async (req, res) => {
    try {
      if (!req.file?.path || !fs.existsSync(req.file.path)) throw new Error("没有收到需要上传的图片文件。");
      const target = String(req.body?.uploadApi || "https://fs.ezvizlife.com/upload.php").trim();
      const parsed = new URL(target);
      if (parsed.protocol !== "https:" || parsed.hostname !== "fs.ezvizlife.com" || parsed.pathname !== "/upload.php") {
        throw new Error("图片上传接口只允许 https://fs.ezvizlife.com/upload.php。");
      }
      const buffer = fs.readFileSync(req.file.path);
      const form = new FormData();
      form.append("app", "mall");
      form.append("flag", "op_image");
      form.append("quality", "100");
      form.append("adapt", "1");
      form.append("file", new Blob([buffer], { type: req.file.mimetype || "application/octet-stream" }), req.file.originalname);
      const response = await fetch(target, { method: "POST", body: form });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error("图片上传接口返回的不是 JSON：" + text.slice(0, 200)); }
      if (!response.ok || (!payload.full_url && !payload.uri)) {
        throw new Error("图片上传失败：" + (payload.msg || text.slice(0, 200)));
      }
      const uri = String(payload.uri || "").replace(/^\/+/, "");
      const url = payload.full_url
        || (/^https?:\/\//i.test(uri) ? uri : /^mfs\.ezvizlife\.com\//i.test(uri) ? "https://" + uri : "https://mfs.ezvizlife.com/" + uri);
      res.json({ ok: true, url, payload });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  });
}

module.exports = { registerAssetUploadRoutes };
