const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateFiles,
  validateLanguagePackageFile,
  extractPdfPagesPreferText
} = require("./text-comparison-routes");

test("multipart text comparison accepts PDF and HTML files", () => {
  assert.doesNotThrow(() => validateFiles(
    { originalname: "datasheet.pdf", size: 1024 },
    { originalname: "detail.html", size: 2048 }
  ));
});

test("multipart text comparison rejects missing or wrong file types", () => {
  assert.throws(() => validateFiles(null, null), /同时上传/);
  assert.throws(() => validateFiles(
    { originalname: "datasheet.png", size: 10 },
    { originalname: "detail.html", size: 10 }
  ), /PDF 文件格式/);
  assert.throws(() => validateFiles(
    { originalname: "datasheet.pdf", size: 10 },
    { originalname: "detail.txt", size: 10 }
  ), /HTML 文件格式/);
});

test("multipart text comparison accepts an optional language package excel", () => {
  assert.doesNotThrow(() => validateLanguagePackageFile(null));
  assert.doesNotThrow(() => validateLanguagePackageFile({
    originalname: "en-US.xlsx",
    size: 1024
  }));
  assert.throws(() => validateLanguagePackageFile({
    originalname: "en-US.csv",
    size: 1024
  }), /语言包 Excel 文件格式/);
});

test("PDF comparison prefers its text layer and only uses OCR when no text exists", async () => {
  let ocrCalls = 0;
  const direct = await extractPdfPagesPreferText({
    extractPdfPages: async () => [{ page: 1, lines: ["Direct text"] }]
  }, Buffer.from("pdf"), "file.pdf", "eng", async () => {
    ocrCalls += 1;
    return [];
  });
  assert.equal(direct.source, "PDF 文字层");
  assert.equal(ocrCalls, 0);

  const fallback = await extractPdfPagesPreferText({
    extractPdfPages: async () => { throw new Error("PDF 中没有可提取文字"); }
  }, Buffer.from("pdf"), "file.pdf", "eng", async () => {
    ocrCalls += 1;
    return [{ page: 1, lines: ["OCR text"] }];
  });
  assert.equal(fallback.source, "OCR 图片识别（PDF 无文字层）");
  assert.equal(ocrCalls, 1);
});
