# EZVIZ 国际商城后台导航清单

本清单于 2026-07-21 通过 Playwright CLI 从国际站后台实时提取，登录后的采集入口为 `https://shop.ezvizlife.com/templates/index`。

页面实际使用的导航容器是 `.sidebar .nav-bar`，当次采集未发现字面量为 `.navigation` 的 CSS 类。页面可能同时渲染多份响应式侧栏，因此扩展脚本应按 `route + label` 去重，不应依赖菜单在 DOM 中只出现一次。

机器可读配置位于 `src/server/config/shop-navigation.json`，辅助查询方法位于 `src/server/features/shop-navigation.js`。

## 菜单结构

| 一级菜单 | 子菜单 | 后台原始路由 |
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

## 脚本调用示例

```js
const {
  findShopNavigationItem,
  resolveShopNavigationUrl
} = require("./src/server/features/shop-navigation");

const tdk = findShopNavigationItem("tdk");
const wtbUrl = resolveShopNavigationUrl("where-to-buy");
const popupUrl = resolveShopNavigationUrl("popup", { preferAutomationUrl: true });
```

TDK 当前会从 `shop.ezvizlife.com/tdk/index` 跳转到 `new-eu-shop.ezvizlife.com/tdk/index`。Popup 自动化目前使用 `new-shop.ezvizlife.com/popup/index`，与旧侧栏路由 `/config/popup` 并存。

## 添加产品特殊入口

从国际站复制产品到当前国家站时，直接打开 `/goods/int-goods-list`，无需先进入 `/goods/index`。默认按 `WiFi Cameras → For Home → 其他有效类目` 查找产品。页面的 `Copy → Complete` 最终提交 `POST /goods/save-cite`，表单字段为 `cite=` 和 `copy=<goods_id>,`。

本地完整上架流程提供 `POST /api/product-publishing/preview` 和 `POST /api/product-publishing/submit`。执行顺序为：目标站同名产品查重 → 国际站产品复制 → Overview/Specification 同步 → 语言包上传 → 后台回读。预览接口不写入后台。

多产品文件夹流程使用 `/api/product-publishing/batch-preview` 和 `/api/product-publishing/batch-submit`；每个产品配对 Datasheet 与 Specifications，并将目标语言的 Product Description 写入 `vm.basic.summary`。产品下架使用 `/api/product-delisting/preview` 和 `/api/product-delisting/submit`，只关闭 `isSearchable` 并把 `whenType` 设为 `0`（No Set Uptime），随后回读验证。

## 后台会话与产品查询复用

同一站点的连续任务优先复用已验证的商城后台页和账号，不再每次返回 `/templates/index` 或重新读取凭据。产品首次查询仍从 `/goods/index` 严格匹配名称，找到后按“账号 + 产品名”缓存编辑地址。后续回读直接重新加载该地址，依然从后台取得最新数据。
