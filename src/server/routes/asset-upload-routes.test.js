const test = require("node:test");
const assert = require("node:assert/strict");
const { createWebflowUploadToken, isPdfDocument, isPrivateAddress, validateRemoteImageUrl } = require("./asset-upload-routes");

test("Webflow upload token keeps the filename outside the digest", () => {
  const token = createWebflowUploadToken("asset.png", "secret", 1_700_000_000_000);
  assert.match(token, /^[a-f0-9]{32}\d{5}asset\.png$/);
});

test("DOC upload accepts PDF extensions and rejects other document types", () => {
  assert.equal(isPdfDocument({ originalname: "Datasheet.PDF", mimetype: "application/octet-stream" }), true);
  assert.equal(isPdfDocument({ originalname: "document.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), false);
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
