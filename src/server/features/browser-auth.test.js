const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeShopAccountText,
  shopAccountLooksCompatible,
  shopAccountLooksLikeConcreteLogin,
  isShopBackendUrl,
  createShopAccountIdentityVerifier,
  createBrowserAuth
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

test("shop account comparison accepts concrete login when target site code matches", () => {
  assert.equal(
    shopAccountLooksCompatible("tr114514 Exit", "website@example.com", {
      credentialDomain: "www.ezviz.com/tr"
    }),
    true
  );
  assert.equal(
    shopAccountLooksCompatible("tr114514 Exit", "website@example.com", {
      credentialDomain: "www.ezviz.com/nl"
    }),
    false
  );
});

test("shop account comparison accepts the global concrete login for root site", () => {
  assert.equal(
    shopAccountLooksCompatible("global114514 l", "website@example.com", {
      credentialDomain: "www.ezviz.com"
    }),
    true
  );
  assert.equal(
    shopAccountLooksCompatible("vn114514", "website@example.com", {
      credentialDomain: "www.ezviz.com"
    }),
    false
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

test("shop account verifier accepts a concrete login for the credential domain site", () => {
  const verifier = createShopAccountIdentityVerifier();
  const options = { credentialDomain: "https://www.ezviz.com/tr" };
  assert.equal(verifier.remember("tr114514", "website@example.com", options), true);
  assert.equal(verifier.matches("tr114514 Exit", "website@example.com", options), true);
  assert.equal(
    verifier.matches("nl114514", "website@example.com", { credentialDomain: "https://www.ezviz.com/tr" }),
    false
  );
});

test("shop account verifier ignores a previously poisoned concrete-login alias", () => {
  const verifier = createShopAccountIdentityVerifier();
  assert.throws(() => verifier.remember("nl114514", "jp114514"));
  assert.equal(verifier.matches("nl114514", "jp114514"), false);
});

test("shop login reuse jumps back to the legacy shop root before returning", async () => {
  const visited = [];
  const page = {
    currentUrl: "https://shop.ezvizlife.com/templates/index",
    isClosed() {
      return false;
    },
    url() {
      return this.currentUrl;
    },
    locator() {
      return {
        first() {
          return {
            async isVisible() {
              return false;
            }
          };
        }
      };
    },
    async evaluate() {
      return "website-tr@example.com";
    },
    async goto(url) {
      visited.push(url);
      this.currentUrl = url;
    },
    async waitForTimeout() {}
  };
  const auth = createBrowserAuth({
    chromium: {},
    PROFILE_DIR: "",
    SHOP_PROFILE_DIR: "",
    SHOP_DASHBOARD_URL: "https://shop.ezvizlife.com/templates/index",
    SHOP_LOGIN_URL: "https://usauth.ezvizlife.com/signIn",
    SHOP_LOGOUT_URL: "",
    shopCredentials: { read() { throw new Error("should not read credentials"); } },
    logLine() {},
    normalizeBool: Boolean
  });

  const result = await auth.ensureShopLoggedIn(page, { username: "website-tr@example.com", password: "ok" }, []);

  assert.equal(result, page);
  assert.deepEqual(visited, ["https://shop.ezvizlife.com/"]);
  assert.equal(page.url(), "https://shop.ezvizlife.com/");
});

test("shop account check jumps from new shop to legacy root before reading username", async () => {
  const visited = [];
  const page = {
    currentUrl: "https://new-shop.ezvizlife.com/templates/list?pageNum=1&pageSize=20",
    isClosed() {
      return false;
    },
    url() {
      return this.currentUrl;
    },
    locator() {
      return {
        first() {
          return {
            async isVisible() {
              return false;
            }
          };
        }
      };
    },
    async evaluate() {
      return this.currentUrl.startsWith("https://shop.ezvizlife.com/")
        ? "website@example.com"
        : "new-shop-display";
    },
    async goto(url) {
      visited.push(url);
      this.currentUrl = url;
    },
    async waitForTimeout() {}
  };
  const auth = createBrowserAuth({
    chromium: {},
    PROFILE_DIR: "",
    SHOP_PROFILE_DIR: "",
    SHOP_DASHBOARD_URL: "https://shop.ezvizlife.com/templates/index",
    SHOP_LOGIN_URL: "https://usauth.ezvizlife.com/signIn",
    SHOP_LOGOUT_URL: "",
    shopCredentials: { read() { throw new Error("should not read credentials"); } },
    logLine() {},
    normalizeBool: Boolean
  });

  const result = await auth.ensureShopLoggedIn(page, { username: "website@example.com", password: "ok" }, []);

  assert.equal(result, page);
  assert.deepEqual(visited, ["https://shop.ezvizlife.com/"]);
  assert.equal(page.url(), "https://shop.ezvizlife.com/");
});
