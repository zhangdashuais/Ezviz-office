const test = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateAddress, validateRemoteImageUrl } = require("./asset-upload-routes");

test("remote album image URL validation blocks unsafe network targets", () => {
  assert.equal(validateRemoteImageUrl("https://cdn.example.com/image?id=1").hostname, "cdn.example.com");
  assert.throws(() => validateRemoteImageUrl("http://cdn.example.com/image.jpg"), /HTTPS/);
  assert.throws(() => validateRemoteImageUrl("https://localhost/image.jpg"), /本机|内网/);
  assert.throws(() => validateRemoteImageUrl("https://127.0.0.1/image.jpg"), /本机|内网/);
  assert.equal(isPrivateAddress("10.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});
