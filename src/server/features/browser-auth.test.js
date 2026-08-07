const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeShopAccountText,
  shopAccountLooksCompatible,
  shopAccountLooksLikeConcreteLogin,
  isShopBackendUrl,
  createShopAccountIdentityVerifier
} = require("./browser-auth");

test("shop backend URL accepts legacy, global, and regional production hosts only", () => {
  assert.equal(isShopBackendUrl("https://shop.ezvizlife.com/templates/index"), true);
  assert.equal(isShopBackendUrl("https://new-shop.ezvizlife.com/templates/list?pageNum=1"), true);
  assert.equal(isShopBackendUrl("https://new-sa-shop.ezvizlife.com/templates/list?pageNum=1"), true);
  assert.equal(isShopBackendUrl("https://new-eu-shop.ezvizlife.com/tdk/index"), true);
  assert.equal(isShopBackendUrl("https://usauth.ezvizlife.com/signIn"), false);
  assert.equal(isShopBackendUrl("https://new-shop.ezvizlife.com.example.com/templates/list"), false);
  assert.equal(isShopBackendUrl("https://new-south-america-shop.ezvizlife.com/templates/list"), false);
  assert.equal(isShopBackendUrl("http://new-sa-shop.ezvizlife.com/templates/list"), false);
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

test("shop account identity distinguishes a site alias from a concrete login", () => {
  assert.equal(shopAccountLooksLikeConcreteLogin("Japan"), false);
  assert.equal(shopAccountLooksLikeConcreteLogin("nl114514 Exit"), true);
  assert.equal(shopAccountLooksLikeConcreteLogin("website-nl@example.com"), true);
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

test("shop account verifier rejects a different concrete site login as an alias", () => {
  const verifier = createShopAccountIdentityVerifier();
  assert.throws(
    () => verifier.remember("nl114514", "jp114514"),
    /不一致的登录账号/
  );
  assert.equal(verifier.matches("nl114514", "jp114514"), false);
});

test("shop account verifier ignores a previously poisoned concrete-login alias", () => {
  const verifier = createShopAccountIdentityVerifier();
  assert.throws(() => verifier.remember("nl114514", "jp114514"));
  assert.equal(verifier.matches("nl114514", "jp114514"), false);
});
