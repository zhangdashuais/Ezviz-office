const fs = require("fs");
const path = require("path");
const {
  readLanguageReplacementMap,
  replaceLanguageFieldsInHtml
} = require("../features/text-comparison-language-package");

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

function validateLanguagePackageFile(file) {
  if (!file) return;
  if (![".xls", ".xlsx"].includes(path.extname(file.originalname).toLowerCase())) {
    throw new Error("语言包 Excel 文件格式不正确，只支持 .xls 或 .xlsx。");
  }
  if (file.size > 30 * 1024 * 1024) {
    throw new Error("语言包 Excel 文件不能超过 30 MB。");
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
        htmlFile: "一份 .html 或 .htm 文件，最大 10 MB",
        languagePackageFile: "可选，总语言包 .xls/.xlsx，用于先把 HTML 中的 {{t('goods.xxx')}} 字段还原为文字",
        languageColumn: "可选，指定语言包替换列；留空时使用 en-US 原文列"
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
      { name: "htmlFile", maxCount: 1 },
      { name: "languagePackageFile", maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const pdfFile = uploadedFile(req, "pdfFile");
        const htmlFile = uploadedFile(req, "htmlFile");
        const languagePackageFile = uploadedFile(req, "languagePackageFile");
        validateFiles(pdfFile, htmlFile);
        validateLanguagePackageFile(languagePackageFile);
        const [pdfBuffer, htmlBuffer] = await Promise.all([
          fs.promises.readFile(pdfFile.path),
          fs.promises.readFile(htmlFile.path)
        ]);
        let htmlText = htmlBuffer.toString("utf8").replace(/^\uFEFF/, "");
        let languageReplacement = null;
        if (languagePackageFile) {
          const mapInfo = readLanguageReplacementMap(languagePackageFile.path, {
            column: req.body?.languageColumn
          });
          const replaced = replaceLanguageFieldsInHtml(htmlText, mapInfo.valuesByKey, {
            annotate: true
          });
          htmlText = replaced.html;
          languageReplacement = {
            fileName: languagePackageFile.originalname,
            column: String(req.body?.languageColumn || "").trim() || "en-US 原文列",
            fieldCount: mapInfo.fieldCount,
            sectionCount: mapInfo.sections.length,
            replacementCount: replaced.replacementCount,
            replacedFieldCount: replaced.replacedKeys.length,
            missingFieldCount: replaced.missingKeys.length,
            missingKeys: replaced.missingKeys.slice(0, 100)
          };
        }
        const [pdfPages, htmlSegments] = await Promise.all([
          fileFeature.extractPdfPages(pdfBuffer),
          Promise.resolve(fileFeature.extractHtmlSegments(htmlText))
        ]);
        const result = feature.compareTextContent({
          files: {
            pdf: pdfFile.originalname,
            html: htmlFile.originalname,
            languagePackage: languagePackageFile?.originalname || ""
          },
          languageReplacement,
          pdfPages,
          htmlSegments
        });
        res.json({ ok: true, result });
      } catch (error) {
        const message = error?.message || String(error);
        const status = /请同时上传|格式不正确|不能超过|为空|没有可提取|没有识别到|已加密|语言包/.test(message)
          ? 400
          : 500;
        res.status(status).json({ ok: false, error: message });
      }
    }
  );
}

module.exports = {
  validateFiles,
  validateLanguagePackageFile,
  registerTextComparisonRoutes
};
