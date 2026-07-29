const fs = require("fs");
const path = require("path");

function uploadedFile(req, name) {
  return req.files?.[name]?.[0] || null;
}

function validateFiles(pdfFile, htmlFile) {
  if (!pdfFile || !htmlFile) {
    throw new Error("请同时上传 PDF 文件和 HTML 文件。");
  }
  if (path.extname(pdfFile.originalname).toLowerCase() !== ".pdf") {
    throw new Error("PDF 文件格式不正确。");
  }
  if (![".html", ".htm"].includes(path.extname(htmlFile.originalname).toLowerCase())) {
    throw new Error("HTML 文件格式不正确，只支持 .html 或 .htm。");
  }
  if (pdfFile.size > 60 * 1024 * 1024) {
    throw new Error("PDF 文件不能超过 60 MB。");
  }
  if (htmlFile.size > 10 * 1024 * 1024) {
    throw new Error("HTML 文件不能超过 10 MB。");
  }
}

function registerTextComparisonRoutes(app, deps) {
  const { feature, fileFeature, upload } = deps;

  app.get("/api/text-comparison", (_req, res) => {
    res.json({
      ok: true,
      endpoint: "/api/text-comparison/verify",
      method: "POST",
      contentType: "multipart/form-data",
      fields: {
        pdfFile: "一份未加密的电子版 PDF，最大 60 MB",
        htmlFile: "一份 .html 或 .htm 文件，最大 10 MB"
      },
      result: "返回核验结论、汇总、逐条差异和处理建议"
    });
  });

  app.post("/api/text-comparison/compare", (req, res) => {
    try {
      const result = feature.compareTextContent(req.body || {});
      res.json({ ok: true, result });
    } catch (error) {
      const message = error?.message || String(error);
      const status = /没有提取到|最多支持|必须|不能为空/.test(message) ? 400 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  app.post(
    "/api/text-comparison/verify",
    upload.fields([
      { name: "pdfFile", maxCount: 1 },
      { name: "htmlFile", maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const pdfFile = uploadedFile(req, "pdfFile");
        const htmlFile = uploadedFile(req, "htmlFile");
        validateFiles(pdfFile, htmlFile);
        const [pdfBuffer, htmlBuffer] = await Promise.all([
          fs.promises.readFile(pdfFile.path),
          fs.promises.readFile(htmlFile.path)
        ]);
        const [pdfPages, htmlSegments] = await Promise.all([
          fileFeature.extractPdfPages(pdfBuffer),
          Promise.resolve(fileFeature.extractHtmlSegments(
            htmlBuffer.toString("utf8").replace(/^\uFEFF/, "")
          ))
        ]);
        const result = feature.compareTextContent({
          files: {
            pdf: pdfFile.originalname,
            html: htmlFile.originalname
          },
          pdfPages,
          htmlSegments
        });
        res.json({ ok: true, result });
      } catch (error) {
        const message = error?.message || String(error);
        const status = /请同时上传|格式不正确|不能超过|为空|没有可提取|没有识别到|已加密/.test(message)
          ? 400
          : 500;
        res.status(status).json({ ok: false, error: message });
      }
    }
  );
}

module.exports = {
  validateFiles,
  registerTextComparisonRoutes
};
