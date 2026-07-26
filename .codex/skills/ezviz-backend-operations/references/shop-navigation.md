# EZVIZ 国际商城后台导航

后台落点：`https://shop.ezvizlife.com/templates/index`

机器可读真源：`src/server/config/shop-navigation.json`

查询辅助：`src/server/features/shop-navigation.js`

页面选择器：

- 侧栏：`.sidebar`
- 导航：`.sidebar .nav-bar`
- 链接：`.sidebar .nav-bar a[href]`

页面可能渲染多份响应式侧栏。采集时按 `route + label` 去重，不依赖菜单只出现一次。

## 菜单清单

| 一级菜单 | 子菜单 | 路由 |
| --- | --- | --- |
| Store Management | Language Management | `/language/index` |
| Store Management | Homepage | `/pages/index` |
| Store Management | Custom Page | `/templates/index` |
| Store Management | Newsroom | `/news/index` |
| Store Management | Category Page | `/category/index` |
| Store Management | Map Management | `/map/index` |
| Store Management | Customization | `/config/edit` |
| Store Management | Contact | `/mailtemplate/index` |
| Store Management | Contact Submission | `/feedback/index` |
| Store Management | TDK | `/tdk/index` |
| Store Management | Where to buy | `/whereToBuy/index` |
| Store Management | Cloudplay | `/cloudplay/index` |
| Store Management | Popup | `/config/popup` |
| Store Management | Legal | `/config/legal-edit` |
| Store Management | Topic Manage | `/topic-management/index` |
| Store Management | Combination | `/combination/index` |
| Store Management | Campaign | `/campaign/index` |
| Store Management | Award | `/award/index` |
| Mall Management | Mall Homepage | `/mall-pages/index` |
| Mall Management | Mall Category Page | `/mall-category/index` |
| Mall Management | Mall Topic Manage | `/mall-topic-management/index` |
| Blog Management | Blog | `/blog/index` |
| Blog Management | Blog Category | `/blog/category/index` |
| Event Management | Event Management | `/event/index` |
| Promotion Management | All Promotions | `/promotion/index` |
| Promotion Management | Coupon Management | `/discount-coupon/coupon-list` |
| Promotion Management | Coupon Receive Management | `/coupon-receive/receive-list` |
| Promotion Management | Coupon Send Management | `/coupon-send/send-list` |
| Promotion Management | Coupon Used Management | `/coupon-used/used-list` |
| Product Page | Product Page | `/goods/index` |
| Product Page | Product Support | `/support/index` |
| Account Management | Sub-Account Management | `/subuser/index` |
| Account Management | Role Management | `/role/index` |

## 特殊地址

- TDK 可能从 `/tdk/index` 跳转到 `https://new-eu-shop.ezvizlife.com/tdk/index`。
- Popup 自动化优先使用 `https://new-shop.ezvizlife.com/popup/index`，旧侧栏仍显示 `/config/popup`。

## 代码调用

```js
const {
  findShopNavigationItem,
  resolveShopNavigationUrl
} = require("./src/server/features/shop-navigation");

const item = findShopNavigationItem("where-to-buy");
const popupUrl = resolveShopNavigationUrl("popup", {
  preferAutomationUrl: true
});
```

新增菜单时先更新 JSON，再更新 `docs/backend-navigation.md` 和本参考文件。
