const navigation = require("../config/shop-navigation.json");

function listShopNavigationItems() {
  return navigation.groups.flatMap((group) => group.items.map((item) => ({
    ...item,
    groupId: group.id,
    groupLabel: group.label
  })));
}

function findShopNavigationItem(idOrLabel) {
  const target = String(idOrLabel || "").trim().toLowerCase();
  return listShopNavigationItems().find((item) =>
    item.id.toLowerCase() === target || item.label.toLowerCase() === target
  ) || null;
}

function resolveShopNavigationUrl(idOrLabel, options = {}) {
  const item = findShopNavigationItem(idOrLabel);
  if (!item) throw new Error("Unknown EZVIZ shop navigation item: " + idOrLabel);
  if (options.preferAutomationUrl && item.automationUrl) return item.automationUrl;
  return new URL(item.route, navigation.baseUrl).href;
}

module.exports = {
  navigation,
  listShopNavigationItems,
  findShopNavigationItem,
  resolveShopNavigationUrl
};
