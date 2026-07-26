const XLSX = require("xlsx");

function buildProductNameTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([[
    "Product_Name",
    "Old_Address_1",
    "New_Address_1",
    "Old_Address_2",
    "New_Address_2",
    "Delete_Code_Block"
  ]]);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 48 },
    { wch: 48 },
    { wch: 48 },
    { wch: 48 },
    { wch: 70 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function registerDetailAddressReplacementRoutes(app, deps) {
  const { feature, logLine } = deps;

  async function handle(req, res, operation, failureLabel) {
    const logs = [];
    try {
      const result = await operation(req.body || {}, logs);
      res.json({ ok: true, logs, result });
    } catch (error) {
      const message = error?.message || String(error);
      logLine(logs, failureLabel + "：" + message);
      const status = /请填写|请选择|必须|不能|一次最多|只允许选择一个|缺少|重复|没有填写|没有可执行|最多只能/.test(message)
        ? 400
        : 500;
      res.status(status).json({ ok: false, error: message, logs });
    }
  }

  app.get("/api/detail-address-replacement/template", (_req, res) => {
    try {
      const filename = "Detail临时功能信息模板.xlsx";
      res.setHeader(
        "content-type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "content-disposition",
        `attachment; filename="Detail-Temporary-Operation-Template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      res.send(buildProductNameTemplate());
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "生成产品名称导入模板失败：" + (error?.message || String(error))
      });
    }
  });

  app.post("/api/detail-address-replacement/preview", (req, res) =>
    handle(req, res, feature.preview, "Detail 内容操作预览失败"));

  app.post("/api/detail-address-replacement/submit", (req, res) =>
    handle(req, res, feature.submit, "Detail 内容操作提交失败"));
}

module.exports = {
  buildProductNameTemplate,
  registerDetailAddressReplacementRoutes
};
