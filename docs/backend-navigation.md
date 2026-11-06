# EZVIZ 国际商城后台导航清单

本清单于 2026-07-21 通过 Playwright CLI 从国际站后台实时提取，登录后的采集入口为 `https://shop.ezvizlife.com/templates/index`。

页面实际使用的导航容器是 `.sidebar .nav-bar`，当次采集未发现字面量为 `.navigation` 的 CSS 类。页面可能同时渲染多份响应式侧栏，因此扩展脚本应按 `route + label` 去重，不应依赖菜单在 DOM 中只出现一次。

机器可读配置位于 `src/server/config/shop-navigation.json`，辅助查询方法位于 `src/server/features/shop-navigation.js`。

本地平台的“一键内联打包”会同步完成 Webflow CSS 作用域处理，并把编辑器产生的同族数字后缀类在 HTML、CSS 和组合选择器中统一为基础类；`w-*` 系统类及没有同族证据的单个编号类保持不变。最终 CSS 固定附加 `.page.page-webflow b, .page.page-webflow strong { font-weight: medium; }`，每个 `li` 的 `style` 固定为 `list-style: decimal;`，但保留原有 class。可选输出 `head`、`body` 标签；默认不输出，便于粘贴到商城后台。最终代码始终以 `<!-- product detail webflow -->` 标记开头，包括保留 `head`、`body` 时。下载 `store.html` 的同时在页面展示最终 CSS，并提供 `webflow.scoped.css` 下载。“图片 AI 标志”的输出超过 512 KB 时会保持原分辨率转为 JPG 并降低画质；最低画质仍超限时明确报错，不会缩放图片。其“DOC上传”使用文件服务 `service/attach` 动态 token 批量上传 PDF，并为每个成功文件生成一个与 `declaration-of-conformity.html` 一致的独立 `<li>` 标签，不包含外层 `<ul>`；“PDF / HTML 文字对比”可上传总语言包还原 `goods.xxx` 字段；生成字段修改建议后，可将建议应用到原始 HTML 的对应语言字段，并在页面显示完整修改版源码，不覆盖用户原文件。若原始 HTML 是片段，输出仍保持片段，不额外补 `DOCTYPE` / `html` 外层标签。

本地 GA4 / Google 数据连接会把十分钟有效的 OAuth 临时状态保存在忽略 Git 的 `runtime/ga4-oauth-pending.json`，即使授权期间后台进程重载，回调也能继续完成；成功后立即清除对应状态。

“图片 AI 标志”另提供网页 HTML 模式：上传或粘贴代码后生成可复制、下载的 HTML。运行时仅在每个可见 `section` 右下角显示标识，包括没有背景图的区块；单独的 `img` 不打标，也不改原图片文件。

基础工具另有独立的“Blog 图片 AI 标志”：上传或粘贴 Blog HTML 后，通过 `/api/blog-ai-badge` 为每张 `<img>`（或包含图片的 `<picture>`）生成右下角标识，整体尺寸为原来的 75%，结果可下载。仅插入内联 HTML/CSS，不依赖脚本，不修改图片地址；再次处理会替换旧标识而非叠加。

商城 Detail 模板处理可能把内联脚本中相邻的 `}}` 改写为 `;?>`，造成前台脚本语法错误；网页 AI 标志生成器通过分隔闭合花括号规避此问题。旧版生成的 HTML 需要重新生成后替换，单纯刷新前台无效。

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

TDK 当前会从 `shop.ezvizlife.com/tdk/index` 跳转到 `new-eu-shop.ezvizlife.com/tdk/index`。Popup 自动化目前使用 `new-shop.ezvizlife.com/popup/index`，与旧侧栏路由 `/config/popup` 并存。Banner 不使用新版 Custom Page 入口；Homepage 管理固定直接访问 `https://shop.ezvizlife.com/pages/index`。

普通 Banner 对所有站点（含波兰）插入轮播第 1 位；PC/Mobile 图片使用项目共用的带签名文件服务上传方式，避免旧版 `op_image` 参数被拒绝。
Banner UTM 修复按前台当前可见顺序匹配后台轮播链接，跳过定时隐藏的轮播；`banner-fix-utm` 可带 `dryRun=1` 只读预览。官网巡查请求带一次性查询参数，避免误读发布前的缓存页面。

DTC 德法西意荷批量入口只要求本地素材绝对路径和统一上线/下线时间，并可在界面选择“Banner + Popup”“仅 Banner”或“仅 Popup”；选择 Banner 时还可指定 White / Black 字体颜色。它不读取普通 Banner/Popup 表单：标题固定为空白占位，Model 使用五国固定文案，链接固定为 `https://www.ezviz.com/{siteCode}/store/topic/hot-sale` 并分别添加 Banner/Popup UTM；Banner 通过后台当前 WebUploader 上传，默认隐藏 More、新窗口打开、直接发布，Popup 通过 Playwright 填写真实后台表单、文件控件上传图片、点击 Submit 并在列表页点击 Enable。接口可用 `includeBanner=false` 或 `includePopup=false` 只执行另一类资源，并用 `bannerColor=White|Black` 选择颜色。根目录下按 `de/fr/es/it/nl`（亦支持国家英文名、本地名和中文名）分类；文件名或子目录名用 `banner-pc`、`banner-mobile`、`popup` 标识用途。`POST /api/campaign/dtc-assets` 只读预检目录；单文件超过 10 MB、必需素材缺失或同一用途匹配多个文件时，该国家会被跳过并返回原因，不影响其他国家继续执行。

## 添加产品特殊入口

国际站创建占位产品使用本地工具“产品空链接创建”。预览接口为 `POST /api/product-empty-link/preview`，提交接口为 `POST /api/product-empty-link/submit`。它读取一个现有国际站产品作为配置参考，经 Manual Add 对应的 `/goods/do-add` 新增产品，保留分类、类型、品牌、相册、规格、价格和库存，重置产品名称、序列号、SEO 与推荐关系，把 PC / Mobile Details 写为指定占位 HTML，并固定写入 `is_search=0`（取消勾选 Searchable）。提交前检查重名和预览指纹；创建后按 `goods_id` 调用 `/goods/edit-goods` 回读详情与 Searchable 状态，不因前台缓存未刷新而重复创建。

从国际站复制产品到当前国家站时，直接打开 `/goods/int-goods-list`，无需先进入 `/goods/index`。默认按 `WiFi Cameras → For Home → 其他有效类目` 查找产品。只读页面快照同时返回列表产品的 `goods_id`、型号、类型、上架状态、创建时间、URL，以及响应中实际存在的 Searchable 字段；未返回该字段时不得由列表数据推断 Detail 开关。页面的 `Copy → Complete` 最终提交 `POST /goods/save-cite`，表单字段为 `cite=` 和 `copy=<goods_id>,`。WTB 登录后从 `https://shop.ezvizlife.com/goods/index` 读取账号并查找产品；旧入口重定向至新版商品列表时继续按新版页面和接口操作。

本地完整上架流程提供 `POST /api/product-publishing/preview` 和 `POST /api/product-publishing/submit`。产品上架只登录目标国家站账号，不登录国际站账号；目标站没有同名产品时，在目标站会话中打开 `/goods/int-goods-list`，明确把复制来源站选择为“国际站”，再等待目标分类的产品列表真实刷新后精确匹配。预览读取 `goods_id`、摘要和列表图片并生成复制源指纹，不打开尚未复制的空 Detail；提交时先核对目标站语言包与预览指纹，默认仅计划填入空译文并保留已有译文；传入 `forceTranslationOverwrite=1` 时改为用 Datasheet 强制覆盖目标译文列，但始终保留英文源列，预检通过后才复制国际产品，再从目标站新产品回读完整 Detail、Specification 图片和 Product Description 并执行本地化更新。目标站已有同名产品时跳过国际复制，直接读取现有产品并只更新 Specification、Product Description 和语言包，Overview 保持不变。预览接口不写入后台。
保存产品资料前，空的 Ads Additional Information → Product Title 会自动补为当前产品名称；已有值不覆盖。

Detail 中的 Specification 表格内容使用目标站映射到的 Specifications 工作簿译文列；后台 Custom Page Name 输入框（`vm.pcView.customs[n].name`）按官网 tab 固定文案本地化，HTML 顶部标题按规格内容标题本地化，不再依赖工作簿首行是否已经翻译。Custom Page Name 固定映射包括：荷兰/比利时 `Specificaties`，德国 `Technische Daten`，法国 `Spécifications`，西班牙/拉美/阿根廷 `Especificaciones`，意大利 `Specifiche`，捷克 `Technické údaje`，泰国 `รายละเอียด`；未知站点才回退到工作簿标题。

“网站翻译表精简”用于处理同一 Excel 中并存的 Datasheet 与 Specification/Spec 工作表。页面自动读取首行语言表头，Datasheet 以单列为一个语言块，Specification 以相邻两列为一个语言块；用户可分别选择目标语言并下载两份文件。输出只保留英文和所选语言，Datasheet 额外保留字段键列，原有模板样式与字体颜色不改写。

语言包定向修订提供 `/api/language-package/hg2-400-4-preview` 与 `/api/language-package/hg2-400-4-submit`。流程逐站下载语言包，精确定位 `HG2_400_4` 并只处理 E 列中的 `15s / 18s / 20s`；E 列为空或不含目标内容时不上传。旧 `.xls` 使用本机 Excel 原生保存以保留后台要求的文件结构，提交后重新下载回读，失败时恢复原包。

语言包页另有独立的“按单产品 Datasheet 更新站点语言包”功能。`datasheet-inspect` 识别第三列起的语种说明；`datasheet-preview` 按字段 Key 对比所选站点当前语言包；`datasheet-submit` 只提交预览状态为 `ready` 的站点，`failed` 与 `no-change` 会显示为跳过，不再禁用整批确认按钮，也不会在提交阶段再次登录这些站点。Global 选择 `English (Source)` 时会同时覆盖 `en-US` 原文列和译文列，并在上传后双列回读；其他站点仍只覆盖译文列。没有 Edit/Download 行、但明确提供带 `lang_code` 的 `Download Language Template` 时，英文站点可用该链接读取当前模板，语种不匹配时仍拒绝。页面默认跳过站点不存在的 Key，避免追加缺少后台元数据的行。空译文跳过，实际下载语言代码必须与 Datasheet 语种一致。全站提交中 Global 为 `ready` 时会强制先更新 Global，再等待英文原文同步到其他站点并自动刷新这些站点的预览基线；基线只忽略本批次已验证的英文源字段变化，其他字段变化仍停止提交。同一时间只允许一个 Datasheet 预览或提交任务。旧 `.xls` 仍由本机 Excel 原生保存，尾部格式化空行不会被当成追加模板行；上传后最多回读 6 次、每次间隔 3 秒，重试只重新下载而不重复上传，最终仍不一致时恢复原包。

“本地 i18n Datasheet 生成”从产品 HTML 提取未 i18n 化的英文文案，将当前产品的新字段放在黄色提示行上方；HTML 已引用或按英文原文复用的旧字段放在黄色提示行下方。生成成功后先备份原 HTML，再把硬编码文案写回对应的 `goods.*` 字段；重复执行会复用现有输出并保持字段归类不变。
“i18n 语言转换”的最终代码始终以 `<!-- product detail webflow -->` 开头，且只保留一个该标记。处理 HTML 片段时会原样保留全部 `<link>` 标签，包括样式表、预加载字体以及属性顺序或引号写法不同的 CSS 引用，避免浏览器解析时将其移入临时 `head` 后从片段输出中丢失。
产品名及其从左到右的名称前缀（如 `TY1`、`TY1 G1`、`TY1 G1 3K`）视为型号，不生成语言包字段；包含型号的完整描述句不受此规则影响。
纯数字单独出现时不转换为语言字段；数字出现在完整文案中时保留在整句语言字段内，例如 `Up to 15m` 必须整体转换。单位值、角度和加密协议单独出现时也不转换。
重复生成会读取输出目录中的既有 Datasheet 和备份，为 HTML 已引用但当前输出缺少的产品字段恢复源文案。
页面开放 HTML、单产品 Excel、总语言包、样式模板、输出目录和最终保存文件六个可编辑路径。“同步所有默认路径”会一次保存全部字段到忽略 Git 的 `runtime/local-i18n-paths.json`，清空某个字段后同步即可恢复该项自动匹配。最终保存文件必须是绝对 `.xlsx` 路径并优先于输出目录；生成请求中的路径优先于已保存默认值，已保存默认值优先于内置自动匹配。自动匹配不到单产品 Excel 时仍执行 i18n 语言转换，只是不加载单产品历史字段作为参考；输出的语言列沿用样式模板。

Detail 批量替换默认选择“全选”，可在一次预览中同时处理地址替换和代码块删除，也可切换为单项操作。替换前后值按精确文本处理，可填写完整 URL、相对路径或地址片段，不要求以 `http://` 或 `https://` 开头。页面和六列 Excel 不再包含或处理 Product Album 高清图。

产品批量上架遇到带翻译状态行的 Specification 时，目标站点列表只显示全部所选产品对应语言列状态均为 `OK` 的站点；没有状态行的普通独立 Specification 文件保持原有兼容行为。

批量上架的“强制覆盖已有译文”选项位于预览结果下方，首次预览完成并展示后台现有译文与 Datasheet 候选译文后才显示。切换选项会自动重新执行只读预览；只有当前选项对应的预览通过后才能提交。

多产品文件夹流程使用 `/api/product-publishing/batch-preview` 和 `/api/product-publishing/batch-submit`；每个产品配对 Datasheet 与 Specifications，语言表头从实际工作簿读取并由页面选择。目标站已有同名产品时跳过复制，只更新 Specification、Product Description 和语言包，保留 Overview。批量上架先读取 Datasheet 黄色的 `If you have proofread …` 依赖说明，若依赖产品同批次上架则先处理依赖产品；预览和提交均逐站查询依赖产品是否已存在。黄色行后续字段与其他字段一样按 Key 处理：默认只补后台空译文或追加缺失字段，勾选“强制覆盖已有译文”后用 Datasheet 覆盖目标译文列；即使英文原文不匹配也始终保留后台英文源列并提示差异。批量提交逐站合并语言包，一站一次上传；默认保留的已有译文列入人工校对 CSV。预览和提交的 `forceTranslationOverwrite` 值必须一致，否则拒绝执行并要求重新预览。产品上架不允许修改语言包 `Sheet1`：预览阻止写入，生成后逐格比对，不一致不上传。一次上传后最多下载回读 6 次，不重复上传；语言包处理失败的站点不再执行产品复制或保存，其他通过站点可继续。每个产品还须在该站预览通过，才进入产品操作。明确提供 Product Description 时写入目标译文；缺少时首次上架保留国际复制源描述，已存在产品保留目标站当前描述。Detail 规格字段兼容 `Specification/Specifications`、本地化标题与日本站 `仕様`。产品下架仍使用 `/api/product-delisting/preview` 和 `/api/product-delisting/submit`，关闭 `isSearchable` 并设 `whenType=0` 后回读。

无需 Excel 的产品内容同步使用 `/api/product-content-sync/preview` 和 `/api/product-content-sync/submit`。源固定为国际站 `hq`，按同名产品只把 PC Details 的 Overview 原样同步到所选目标站；目标站不存在产品时跳过，不复制产品，也不修改 Specifications、语言包、Product Description、Specification 字段名或其他配置。目标站的规格自定义字段名即使未识别，也可只比较和同步 Overview。提交前同时校验源站与目标站 Overview 指纹，保存后回读 Overview，并确认原自定义字段（含 Specifications）仍保持不变。

左侧“后台运营”分组中的独立 Tab“产品上线站点搜索”使用只读接口 `POST /api/product-availability/search`，不再放在“产品资料操作”的流程下拉框中。它访问全部启用站点的官网 `/search?keywords=` 页面，同时读取普通搜索结果和组合产品卡片 `data-jsond` 内全部规格 Tab。按 Unicode NFKC、忽略大小写和所有空格后的完整产品名精确匹配；括号后缀仍参与最终匹配，但会追加一次去后缀搜索以兼容官网检索。单站搜索失败独立记录，不影响其他站点。

## 后台会话与产品查询复用

同一站点的连续任务优先复用已验证的商城后台页和账号，不再每次返回 `/templates/index` 或重新读取凭据。产品首次查询仍从 `/goods/index` 严格匹配名称，找到后按“账号 + 产品名”缓存编辑地址。后续回读直接重新加载该地址，依然从后台取得最新数据。

## 本地 i18n 语言转换

HTML 文本节点中的换行、缩进和连续空格会压缩为单个空格后写入新字段英文原文；替换 HTML 时仍按原始文本定位，保留节点两侧的排版空白。

文字翻译字段结果 Excel 和本地 Datasheet 的样式处理优先使用 `PYTHON` 指定的解释器；未指定时查找 Codex 随附的 Python，最后使用系统 PATH 中的 `python`。所选 Python 需安装 `openpyxl`。预设样式模板不存在时，结果 Excel 使用默认表头样式。

离线分享版位于 `outputs/i18n-converter-sheet1-20261028.zip`：解压后直接打开 `index.html`。总语言包仅读取 Sheet1，将 Category 与 Single word 拼成完整字段名，不读取 Sheet2；单产品语言包仍按 Datasheet 结构读取。支持转换后 HTML 与字段结果 Excel 下载，不包含需本地服务和绝对路径的 Datasheet 生成。

本地页面的 i18n 工具将 HTML 英文文案生成新字段；单独出现的纯数字跳过，完整文案中的数字保留在原句内一起转换。单独出现的单位值、产品名称、数字上下角标、AES/TLS、度数和纯标点节点也跳过。新字段与英文原文在页面单独展示。只有单产品语言包的原文或 Key 可以判定为复用；总包仅用于字段名冲突规避，不参与复用判定。HTML 已有 Key 若不在单产品包，也归入新字段，英文原文留空提示人工补充；结果 Excel 分列“新语言包字段”和“产品包复用字段”。

上传单产品语言包后，解析器只接受 Datasheet 布局（第 1 列字段键、第 2 列英文原文）；硬编码英文文案会先按原文精确匹配并复用原字段，未匹配文案按用户设置的产品名称生成新字段。HTML 原有 Key 只按单产品包检查，缺失时在页面转换模式保留 Key 但列为新字段，需人工补英文原文。页面和结果 Excel 会单独列出“产品包复用字段”。本地按路径生成 Datasheet 也只用原始单产品包决定复用，不把总包或之前生成的工作簿作为复用依据；若原 HTML 使用了单产品包未收录的其他产品 Key，本地生成会从既有输出或 HTML 备份取得英文原文，改为当前产品前缀的新 Key，并同步改写 HTML。当前产品已有 Key 的译文予以保留；由其他产品 Key 新建的字段不沿用旧译文。

## 服务中心资料平台

本地入口 `POST /api/ecadmin/local-files` 根据产品名读取 `D:\产品\<产品名称>\upload`；`POST /api/ecadmin/run` 支持按选项创建下载资料、补全多语言和更新产品背景图，不再接收浏览器上传文件，也不再生成 SharePoint 归档计划。补全多语言会在 UMP 的“服务中心 → 下载中心管理 → 程序下载管理”中按标题精确搜索资料并提交弹窗标题。该流程只依赖 ecadmin 登录，不读取或写入 Google Sheet。

基础工具新增“视频上传-海外”：`POST /api/ecadmin/upload-video` 通过已登录的 UMP 视频上传页面上传单个 MP4（不超过 500 MB），并返回经校验的 MFS 视频地址。页面实际先取 `/common/ovs-file-token`，再上传至 `https://fs.ezvizlife.com/upload.php`；项目不保存临时 token，也不创建产品记录。

## 商城后台登录兼容

商城旧入口 `shop.ezvizlife.com/templates/index` 可能重定向到新版全球后台 `new-shop.ezvizlife.com`，也可能按账号区域重定向到 `new-<区域>-shop.ezvizlife.com`；拉美站实测落点为 `new-sa-shop.ezvizlife.com/templates/list`。本地工具只将 HTTPS 下的旧后台、全球新版后台和两到三位区域码新版后台视为正式后台，并分别从旧版登录栏或新版 `#username` 区域读取当前账号；相似域名、非 HTTPS 地址和其他页面仍会被拒绝。切换不同国家站账号时会先清理商城专用浏览器的旧 Cookie，再直接打开目标账号登录入口，不再为了退出旧账号先进入旧站后台首页。新版页面只显示站点别名时，工具仅在明确提交目标凭据并认证成功后，为当前服务进程记录登录账号与显示别名的对应关系；未知会话仍强制重新登录，且同一别名不能绑定两个站点账号。若页面返回包含数字或邮箱标记的具体登录账号且与目标凭据不一致，工具会立即停止，绝不会将其自动记作目标站点别名。

产品上架和产品修订使用的语言包 Datasheet 允许穿插说明行：当一行只有第一列说明文字、原文及全部译文列均为空时会安全跳过；只要任一译文列有内容而原文为空，仍会阻止预览。

产品上架和产品修订读取 Detail 规格字段时兼容明确的单数 `Specification`、复数 `Specifications` 和已记录的本地化规格标题；若单复数同时存在，优先使用复数。不会回退到其他自定义字段。

规格 HTML 的主图地址支持标准 `src` 以及常见懒加载属性 `data-src`、`data-original`、`data-lazy-src` 和 `srcset`。
若源规格明确包含无地址的空图片占位标签，则视为源产品无规格图，目标规格会省略图片块；不会猜测或生成图片地址。
后台产品资料操作页面用同一个操作类型下拉承载文件夹批量上架、源站同步修订、只改 Specification、多产品相同内容修订和产品下架；页面按模式显示必要字段。选择“只改语言包”会跳转至独立的单产品 Datasheet 语言包功能，不再读取产品 Detail/Spec。只改 Specification 可上传欧洲云盘双工作表 Excel 并自动选择 Spec / Specification；独立语言包功能自动读取 Datasheet，普通单工作表文件也兼容。多产品相同部分修订可同时选择多个国家站点，对最多 50 个产品的 Detail 或 Specification 执行同一条精确删除/替换，也可只把 Specification 的 Custom Page Name 输入框修成站点固定文案，并按国家 × 产品逐项预览、保存和回读。直接修订接口可只更新 Basic Information 的 Product Description，或只更新 Specification 自定义字段名；Overview 与 Specification 内容会原样保留。

已上架产品只需更新资料文案和语言包时，`/api/product-revision-sync/preview` 与 `/api/product-revision-sync/submit` 可传 `updateScope=specification-language`。该范围不读取或复制国际站源产品，明确保留目标站当前 Overview 和规格图；Product Description 若在 Datasheet 中存在或能由当前后台文案反查到唯一字段行，则按目标语种更新，缺失时才保留现值；Specification 自定义字段名按官网 tab 固定映射，HTML 顶部标题按规格内容标题映射，正文按目标语言列生成，并按稳定 Key 更新总语言包。新增语言键只追加到与本次既有键匹配最多的语言工作表，避免跨工作表重复。
产品预览、修订、上架与回读查找产品时从 `https://shop.ezvizlife.com/goods/index` 发起。后台可能重定向到 `new-shop` 或区域新版的 `/goods/index`；最终地址、HTTP 状态及商品列表控件都验证通过才继续。旧版表格行和新版商品卡片均支持查找；真正的 404 或空后台壳仍停止。

新版商品编辑页是 `/goods/edit/<goods_id>`，不再提供旧 Angular 的 `#replenish` 模型。商品预览通过经登录会话读取旧商品 JSON 接口 `/goods/edit-goods?goods_id=...`，并核对商品 ID 与名称；Overview 对应 `summary_intro`，Detail 自定义字段对应 `extra[].name_key/name_value`，Product Description 对应 `brief`。产品列表的精确搜索优先使用 `Product Name` 输入框，不使用分页数量输入框；缓存的编辑地址须重新核验，否则回到列表查找。空链接创建、产品下架、Detail 替换和产品修订预览均沿用这套读取与核验流程。Specification 批量翻译在新版列表通过 `get-goods-list` 分页读取商品，按 ID 回读详情。WTB 在新版编辑页通过 `get-where-to-buy` 读取购买渠道，提交时填写对应渠道的页面输入框并检查 `goods/modify` 结果。预览只读，提交路径仍需以具体商品的保存后回读为准。

# 欧洲分类页与 Support 只读巡查

运行 `node scripts/audit-europe-category-support.js`。站点来自本地 `/api/campaign/sites`，默认覆盖 `eu,de,fr,it,es,pl,cz,be,uk,nl,ro,tr`；可通过 `CATEGORY_AUDIT_SITES` 指定其中的站点代码。

逐站发现 Security Cameras / Smart Home 分类入口，点击顶部分类导航以及产品卡片的全部可选变体组合，核对切换后的型号、详情链接与图片地址。全部变体按站点和产品 ID 去重后，读取详情页及 Support 入口并检查目标页面可访问性。原始结果和分类页截图保存在 `outputs/europe-category-support-audit-2026-10-15/`。不会提交后台配置，也不执行自动绑定。
