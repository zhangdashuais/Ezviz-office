const fs = require("fs");
const pathModule = require("path");

function registerLanguagePackageRoutes(app, deps) {
  const { upload, languagePackageFeature, logLine } = deps;
  let activeDatasheetAction = "";

  app.post("/api/language-package/local-i18n-datasheet", (req, res) => {
    const logs = [];
    try {
      const result = languagePackageFeature.generateLocalI18nDatasheet(req.body || {});
      logLine(logs, `已生成 Datasheet：${result.outputFile}`);
      logLine(logs, `已替换 HTML 语言包字段：${result.htmlReplacementCount} 处`);
      if (result.htmlBackupFile) logLine(logs, `原 HTML 备份：${result.htmlBackupFile}`);
      res.json({ ok: true, logs, result });
    } catch (error) {
      logLine(logs, `本地 i18n Datasheet 生成失败：${error.message || String(error)}`);
      res.status(500).json({ ok: false, error: error.message || String(error), logs });
    }
  });

  app.post("/api/language-package/upload", upload.fields([
    { name: "languagePackage", maxCount: 1 }
  ]), async (req, res) => {
    const logs = [];
    try {
      const result = await languagePackageFeature.submitLanguagePackageToBackend(req.body || {}, req.files || {}, logs);
      logLine(logs, "语言包上传流程完成。");
      res.json({ ok: true, logs, result });
    } catch (error) {
      logLine(logs, "语言包上传失败：" + (error && error.message ? error.message : String(error)));
      res.status(500).json({ ok: false, error: error && error.message ? error.message : String(error), logs });
    }
  });

  const datasheetUpload = upload.single("datasheet");
  for (const [path, action, done] of [
    ["/api/language-package/datasheet-inspect", "inspectLanguageDatasheet", "Datasheet 识别完成。"],
    ["/api/language-package/datasheet-preview", "previewFromDatasheet", "Datasheet 语言包预览完成。"],
    ["/api/language-package/datasheet-submit", "submitFromDatasheet", "Datasheet 语言包更新完成。"]
  ]) {
    app.post(path, datasheetUpload, async (req, res) => {
      const logs = [];
      const requiresLock = action !== "inspectLanguageDatasheet";
      if (requiresLock && activeDatasheetAction) {
        if (req.file?.path) {
          fs.rmSync(req.file.path, { force: true });
          try { fs.rmdirSync(pathModule.dirname(req.file.path)); } catch {}
        }
        return res.status(409).json({
          ok: false,
          error: `已有语言包任务正在执行（${activeDatasheetAction}），请等待完成后再操作。`,
          logs
        });
      }
      if (requiresLock) activeDatasheetAction = action;
      try {
        const result = action === "inspectLanguageDatasheet"
          ? languagePackageFeature[action](req.file)
          : await languagePackageFeature[action](req.body || {}, req.file, logs);
        logLine(logs, done);
        res.json({ ok: true, logs, result });
      } catch (error) {
        logLine(logs, `${done.replace("完成", "失败")}：${error.message || String(error)}`);
        res.status(500).json({ ok: false, error: error.message || String(error), logs });
      } finally {
        if (requiresLock) activeDatasheetAction = "";
        if (req.file?.path) {
          fs.rmSync(req.file.path, { force: true });
          try { fs.rmdirSync(pathModule.dirname(req.file.path)); } catch {}
        }
      }
    });
  }

  for (const [path, action, done] of [
    ["/api/language-package/hg2-400-4-preview", "previewHg24004", "HG2_400_4 预览完成。"],
    ["/api/language-package/hg2-400-4-submit", "submitHg24004", "HG2_400_4 修订完成。"]
  ]) {
    app.post(path, async (req, res) => {
      const logs = [];
      try {
        const result = await languagePackageFeature[action](req.body || {}, logs);
        logLine(logs, done);
        res.json({ ok: true, logs, result });
      } catch (error) {
        logLine(logs, `${done.replace("完成", "失败")}：${error.message || String(error)}`);
        res.status(500).json({ ok: false, error: error.message || String(error), logs });
      }
    });
  }
}

module.exports = { registerLanguagePackageRoutes };
