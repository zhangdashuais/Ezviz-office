const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeShopAccountText,
  shopAccountLooksCompatible
} = require("./browser-auth");

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
