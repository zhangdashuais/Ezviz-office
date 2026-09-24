const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createServiceUploadToken,
  createWebflowUploadToken,
  normalizeWebflowAssetUrl,
  normalizeSvgBuffer,
  validateWebflowUploadTarget
} = require("./webflow-asset-upload");

test("builds the Webflow upload token from the filename", () => {
  const token = createWebflowUploadToken("asset.png", "secret", 1_700_000_000_000);
  assert.equal(token, "67e017132901fb252308a0acef14a2c000000asset.png");
});

test("builds the service attachment upload token from the filename", () => {
  const token = createServiceUploadToken("datasheet.pdf", "secret", 1_700_000_000_000);
  assert.equal(token, "a88d779b99c34b91c7d2f7a3aadb682300000datasheet.pdf");
});

test("normalizes filesystem URIs to the CDN host", () => {
  assert.equal(
    normalizeWebflowAssetUrl({ uri: "mfs.ezvizlife.com/mall/static/file.svg" }),
    "https://mfs.ezvizlife.com/mall/static/file.svg"
  );
});

test("adds an XML declaration to SVGs rejected by the filesystem", () => {
  const normalized = normalizeSvgBuffer(Buffer.from("<svg viewBox=\"0 0 1 1\"/>"), {
    originalname: "icon.svg",
    mimetype: "image/svg+xml"
  });
  assert.match(normalized.toString("utf8"), /^<\?xml version="1.0" encoding="UTF-8"\?>/);
});

test("only allows the verified Webflow upload endpoint", () => {
  assert.equal(validateWebflowUploadTarget(), "https://fs.ezvizlife.com/upload.php");
  assert.throws(
    () => validateWebflowUploadTarget("https://example.com/upload.php"),
    /restricted/
  );
});
