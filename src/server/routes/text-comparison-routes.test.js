const test = require("node:test");
const assert = require("node:assert/strict");
const { validateFiles } = require("./text-comparison-routes");

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
