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

本地完整上架流程提供 `POST /api/product-publishing/preview` 和 `POST /api/product-publishing/submit`。产品上架只登录目标国家站账号，不登录国际站账号；在目标站会话中打开 `/goods/int-goods-list`，明确把复制来源站选择为“国际站”，再等待目标分类的产品列表真实刷新后精确匹配。预览读取 `goods_id`、摘要和列表图片并生成复制源指纹，不打开尚未复制的空 Detail；提交时先复制国际产品，再从目标站新产品回读完整 Detail、Specification 图片和 Product Description，随后执行本地化更新。执行顺序为：目标站同名产品查重 → 锁定并校验国际列表复制源 → 国际产品复制 → 回读复制后的目标产品 → Specification/语言包更新 → 后台回读。预览接口不写入后台。

多产品文件夹流程使用 `/api/product-publishing/batch-preview` 和 `/api/product-publishing/batch-submit`；每个产品配对 Datasheet 与 Specifications。国际复制源的 Detail 标签会等待异步加载完成后再读取，找到复制源且至少有一个目标站可执行时即可确认提交；部分站点失败不会阻塞其他已通过预检的站点。Datasheet 明确提供 Product Description 时写入目标译文；未提供时保留目标站国际产品复制源的 Product Description。产品下架使用 `/api/product-delisting/preview` 和 `/api/product-delisting/submit`，只关闭 `isSearchable` 并把 `whenType` 设为 `0`（No Set Uptime），随后回读验证。

## 后台会话与产品查询复用

同一站点的连续任务优先复用已验证的商城后台页和账号，不再每次返回 `/templates/index` 或重新读取凭据。产品首次查询仍从 `/goods/index` 严格匹配名称，找到后按“账号 + 产品名”缓存编辑地址。后续回读直接重新加载该地址，依然从后台取得最新数据。

## 本地 i18n 语言转换

本地页面的 i18n 工具只将 HTML 英文文案生成新字段，并排除单独或位于末尾的数字、单位、产品名称、数字上下角标、AES/TLS 和度数。纯标点节点跳过，标点与英文文案一起出现时随整段原文转换。新字段与英文原文在页面单独展示；HTML 已有字段按总语言包 `Single word` 与 `en-US` 列回查。结果 Excel 分为“新语言包字段”和“已有字段原文”两个工作表。

上传单产品语言包后，硬编码英文文案会先按 `en-US` 原文精确匹配并复用原字段；只有未匹配文案才按用户设置的产品名称生成新字段。页面和结果 Excel 会单独列出“产品包复用字段”。

## 服务中心资料平台

本地入口 `POST /api/ecadmin/run` 支持按选项创建下载资料、补全多语言、更新产品背景图和生成 SharePoint 归档计划。补全多语言会在 UMP 的“服务中心 → 下载中心管理 → 程序下载管理”中按标题精确搜索资料，点击“补全多语言”，并提交弹窗中的标题；它可独立执行，不要求本轮创建资料或上传文件。提交后读取后台返回的新增多语言记录数量；若本轮同时创建资料，则会在日志中关联新生成的 `downloadId`。

SharePoint 素材归档类目固定为 `02_Security Camera`、`03_Home Sensor & Control`、`04_NVR & Network`、`07_Smart Home`，接口会拒绝其他非空类目值。

## 商城后台登录兼容

商城旧入口 `shop.ezvizlife.com/templates/index` 可能重定向到新版 `new-shop.ezvizlife.com`。本地工具会将两个精确域名都视为正式后台，并分别从旧版登录栏或新版 `#username` 区域读取当前账号；其他域名仍会被拒绝。切换不同国家站账号时会先清理商城专用浏览器的旧 Cookie，再直接打开目标账号登录入口，不再为了退出旧账号先进入旧站后台首页。新版页面只显示站点别名时，工具仅在明确提交目标凭据并认证成功后，为当前服务进程记录登录账号与显示别名的对应关系；未知会话仍强制重新登录，且同一别名不能绑定两个站点账号。

产品上架和产品修订使用的语言包 Datasheet 允许穿插说明行：当一行只有第一列说明文字、原文及全部译文列均为空时会安全跳过；只要任一译文列有内容而原文为空，仍会阻止预览。

产品上架和产品修订读取 Detail 规格字段时兼容明确的单数 `Specification` 与复数 `Specifications`；若两者同时存在，优先使用复数。不会回退到其他自定义字段。

规格 HTML 的主图地址支持标准 `src` 以及常见懒加载属性 `data-src`、`data-original`、`data-lazy-src` 和 `srcset`。
若源规格明确包含无地址的空图片占位标签，则视为源产品无规格图，目标规格会省略图片块；不会猜测或生成图片地址。
