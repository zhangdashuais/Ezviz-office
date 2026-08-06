const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeShopAccountText,
  shopAccountLooksCompatible,
  isShopBackendUrl,
  createShopAccountIdentityVerifier
} = require("./browser-auth");

test("shop backend URL accepts the legacy and current production hosts only", () => {
  assert.equal(isShopBackendUrl("https://shop.ezvizlife.com/templates/index"), true);
  assert.equal(isShopBackendUrl("https://new-shop.ezvizlife.com/templates/list?pageNum=1"), true);
  assert.equal(isShopBackendUrl("https://usauth.ezvizlife.com/signIn"), false);
  assert.equal(isShopBackendUrl("https://new-shop.ezvizlife.com.example.com/templates/list"), false);
  assert.equal(isShopBackendUrl("not-a-url"), false);
});

test("shop account comparison uses the full configured account instead of a site token", () => {
  assert.equal(
    shopAccountLooksCompatible("website-hq@example.com Exit", "website-vn@example.com"),
    false
  );
  assert.equal(
    shopAccountLooksCompatible("website-vn@example.com Exit", "website-vn@example.com"),
    true
  );
});

test("shop account comparison ignores display punctuation and casing", () => {
  assert.equal(
    normalizeShopAccountText(" Website.VN+Mall@Example.com "),
    "websitevnmallexamplecom"
  );
  assert.equal(
    shopAccountLooksCompatible("WEBSITE.VN+MALL@EXAMPLE.COM Logout", "website.vn+mall@example.com"),
    true
  );
});

test("shop account comparison rejects an empty expected account", () => {
  assert.equal(shopAccountLooksCompatible("website-vn@example.com", ""), false);
});

test("shop account verifier remembers a display alias only after authentication", () => {
  const verifier = createShopAccountIdentityVerifier();
  assert.equal(verifier.matches("global-display", "website@example.com"), false);
  assert.equal(verifier.remember("global-display", "website@example.com"), true);
  assert.equal(verifier.matches("global-display", "website@example.com"), true);
});

test("shop account verifier prevents one display alias from identifying two site accounts", () => {
  const verifier = createShopAccountIdentityVerifier();
  verifier.remember("global-display", "website@example.com");
  assert.throws(
    () => verifier.remember("global-display", "website-vn@example.com"),
    /另一个站点账号/
  );
});
