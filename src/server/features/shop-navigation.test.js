const test = require("node:test");
const assert = require("node:assert/strict");
const {
  navigation,
  listShopNavigationItems,
  findShopNavigationItem,
  resolveShopNavigationUrl
} = require("./shop-navigation");

test("records every observed international shop navigation item", () => {
  const items = listShopNavigationItems();
  assert.equal(navigation.groups.length, 7);
  assert.equal(items.length, 33);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(new Set(items.map((item) => item.route)).size, items.length);
});

test("finds and resolves navigation targets for automation", () => {
  assert.equal(findShopNavigationItem("TDK").route, "/tdk/index");
  assert.equal(resolveShopNavigationUrl("where-to-buy"), "https://shop.ezvizlife.com/whereToBuy/index");
  assert.equal(resolveShopNavigationUrl("popup", { preferAutomationUrl: true }), "https://new-shop.ezvizlife.com/popup/index");
});
