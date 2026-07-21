const { parseTdkWorkbook, groupRowsBySite } = require("../features/tdk-management");

function registerTdkRoutes(app, deps) {
  const { upload, feature, readCampaignConfig, getCampaignSites, logLine } = deps;

  function validationPayload(parsed) {
    const activeRows = parsed.rows.filter((row) => row.action !== "skip");
    return {
      sheetName: parsed.sheetName,
      rowCount: parsed.rows.length,
      activeRowCount: activeRows.length,
      skippedRowCount: parsed.rows.length - activeRows.length,
      siteCount: groupRowsBySite(parsed.rows).length,
      sites: groupRowsBySite(parsed.rows).map((group) => ({
        name: group.site?.name || group.rows[0]?.siteCode || "",
        siteCode: group.site?.siteCode || group.rows[0]?.siteCode || "",
        rowCount: group.rows.length
      })),
      issues: parsed.issues
    };
  }

  app.post("/api/tdk/validate", upload.single("tdkExcel"), (req, res) => {
    try {
      if (!req.file) throw new Error("请上传 TDK Excel。");
      const sites = getCampaignSites(readCampaignConfig());
      const parsed = parseTdkWorkbook(req.file.path, sites);
      const validation = validationPayload(parsed);
      res.status(parsed.issues.length ? 400 : 200).json({ ok: !parsed.issues.length, validation });
    } catch (error) {
      res.status(400).json({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  });

  app.post("/api/tdk/submit", upload.single("tdkExcel"), async (req, res) => {
    const logs = [];
    try {
      if (!req.file) throw new Error("请上传 TDK Excel。");
      const sites = getCampaignSites(readCampaignConfig());
      const parsed = parseTdkWorkbook(req.file.path, sites);
      if (parsed.issues.length) {
        return res.status(400).json({ ok: false, error: "TDK Excel 校验未通过。", issues: parsed.issues, logs });
      }
      logLine(logs, `TDK Excel 校验通过：${parsed.rows.length} 行。`);
      const result = await feature.submitRows(parsed.rows, req.body || {}, logs);
      logLine(logs, `TDK 后台配置完成：提交 ${result.submittedRows} 行，跳过 ${result.skippedRows} 行。`);
      res.json({ ok: true, validation: validationPayload(parsed), logs, result });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      logLine(logs, "TDK 后台配置失败：" + message);
      res.status(500).json({ ok: false, error: message, logs });
    }
  });

}

module.exports = { registerTdkRoutes };
