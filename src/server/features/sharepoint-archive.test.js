const test = require("node:test");
const assert = require("node:assert/strict");
const { publicPlan } = require("./sharepoint-archive");
const {
  cleanFolderSegment,
  validateSharePointRoot,
  isSharePointTranslationExcel,
  sharePointTranslationRole,
  productFolderNameFromDatasheet
} = require("./ecadmin-platform");

test("SharePoint 归档返回结果不暴露本地上传路径", () => {
  assert.deepEqual(publicPlan({
    siteUrl: "http://sharepoint/sites/test",
    overwrite: false,
    folders: ["Shared Documents/05_Website/Camera/CP8"],
    files: [{
      name: "CP8.pdf",
      localPath: "D:/private/runtime/CP8.pdf",
      role: "datasheet",
      folderPath: "Shared Documents/05_Website/Camera/CP8"
    }]
  }), {
    siteUrl: "http://sharepoint/sites/test",
    overwrite: false,
    folders: ["Shared Documents/05_Website/Camera/CP8"],
    files: [{
      name: "CP8.pdf",
      role: "datasheet",
      folderPath: "Shared Documents/05_Website/Camera/CP8"
    }]
  });
});

test("SharePoint 归档目录只允许位于 05_Website 下", () => {
  assert.equal(
    validateSharePointRoot("Shared Documents\\05_Website\\00_Product Translation", "根目录"),
    "Shared Documents/05_Website/00_Product Translation"
  );
  assert.throws(
    () => validateSharePointRoot("Shared Documents/Finance", "根目录"),
    /05_Website/
  );
  assert.throws(
    () => validateSharePointRoot("Shared Documents/05_Website/../Finance", "根目录"),
    /05_Website/
  );
});

test("产品文件夹名移除 SharePoint 非法路径字符", () => {
  assert.equal(cleanFolderSegment(" CP8 / Pro: 2026 "), "CP8 - Pro- 2026");
});

test("Product Translation 接收全部 xlsx，其他扩展名不接收", () => {
  const file = (name) => ({ originalname: name });
  assert.equal(isSharePointTranslationExcel(file("CP8 Spec.xlsx")), true);
  assert.equal(isSharePointTranslationExcel(file("CP8_datasheet.XLS")), false);
  assert.equal(isSharePointTranslationExcel(file("Spec.xlsx")), true);
  assert.equal(isSharePointTranslationExcel(file("CP8 specification.xlsx")), true);
  assert.equal(isSharePointTranslationExcel(file("CP8 spec final.xlsx")), true);
  assert.equal(isSharePointTranslationExcel(file("CP8 Datasheet.pdf")), false);
  assert.equal(isSharePointTranslationExcel(file("素材/spec/CP8-SPEC.xlsx")), true);
  assert.equal(sharePointTranslationRole(file("CP8 Datasheet.xlsx")), "translationExcel");
});

test("SharePoint 产品文件夹名取 Datasheet 前的产品名称", () => {
  assert.equal(productFolderNameFromDatasheet({
    allFiles: [{ originalname: "CP8 Datasheet.pdf" }]
  }), "CP8");
  assert.equal(productFolderNameFromDatasheet({
    allFiles: [{ originalname: "资料/CS-EP8_Ultra_DATASHEET.xlsx" }]
  }), "CS-EP8_Ultra");
  assert.throws(
    () => productFolderNameFromDatasheet({ allFiles: [{ originalname: "CP8 Manual.pdf" }] }),
    /Datasheet/
  );
  assert.throws(
    () => productFolderNameFromDatasheet({ allFiles: [{ originalname: "Datasheet.pdf" }] }),
    /缺少产品名称/
  );
});
