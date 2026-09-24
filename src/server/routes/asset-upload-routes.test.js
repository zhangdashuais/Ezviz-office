const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDocumentListHtml,
  createServiceUploadToken,
  createWebflowUploadToken,
  isPdfDocument,
  isPrivateAddress,
  validateRemoteImageUrl
} = require("./asset-upload-routes");

test("Webflow upload token keeps the filename outside the digest", () => {
  const token = createWebflowUploadToken("asset.png", "secret", 1_700_000_000_000);
  assert.match(token, /^[a-f0-9]{32}\d{5}asset\.png$/);
});

test("DOC upload accepts PDF extensions and rejects other document types", () => {
  assert.equal(isPdfDocument({ originalname: "Datasheet.PDF", mimetype: "application/octet-stream" }), true);
  assert.equal(isPdfDocument({ originalname: "document.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), false);
});

test("DOC upload uses a service-scoped upload token", () => {
  const token = createServiceUploadToken("Datasheet.pdf", "secret", 1_700_000_000_000);
  assert.match(token, /^[a-f0-9]{32}\d{5}Datasheet\.pdf$/);
});

test("DOC upload formats successful PDFs as separate list items", () => {
  assert.equal(buildDocumentListHtml([
    { fileName: "Declaration A.pdf", ok: true, url: "https://mfs.ezvizlife.com/a.pdf?x=1&y=2" },
    { fileName: "Declaration <B>.PDF", ok: true, url: "https://mfs.ezvizlife.com/b.pdf" },
    { fileName: "failed.pdf", ok: false, error: "upload failed" }
  ]), [
    "<li>",
    "    <a target=\"_blank\" href=\"https://mfs.ezvizlife.com/a.pdf?x=1&amp;y=2\">Declaration A</a>",
    "</li>",
    "<li>",
    "    <a target=\"_blank\" href=\"https://mfs.ezvizlife.com/b.pdf\">Declaration &lt;B&gt;</a>",
    "</li>"
  ].join("\n"));
});

test("remote album image URL validation blocks unsafe network targets", () => {
  assert.equal(validateRemoteImageUrl("https://cdn.example.com/image?id=1").hostname, "cdn.example.com");
  assert.throws(() => validateRemoteImageUrl("http://cdn.example.com/image.jpg"), /HTTPS/);
  assert.throws(() => validateRemoteImageUrl("https://localhost/image.jpg"), /本机|内网/);
  assert.throws(() => validateRemoteImageUrl("https://127.0.0.1/image.jpg"), /本机|内网/);
  assert.equal(isPrivateAddress("10.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});
