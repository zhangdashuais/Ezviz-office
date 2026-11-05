# Ezviz Office 本地功能导航

入口：`http://localhost:3217/inline-packager.html`

前端真源：`办公软件/111/inline-packager.html` 与 `办公软件/111/src/`

## 导航与能力

| 分组 | 页面入口 | 主要能力 | 默认风险 |
| --- | --- | --- | --- |
| 基础工具 | 一键内联打包 | 将页面 CSS、图片和 HTML 处理为带 Webflow 页面作用域的上线代码；自动合并编辑器产生的同族数字后缀类（含组合选择器，保留 `w-*` 系统类）；最终 CSS 固定附加 `.page.page-webflow b, .page.page-webflow strong { font-weight: medium; }`，并将每个 `li` 的 `style` 统一为 `list-style: decimal;`，保留原有 class；可选输出 `head`、`body` 标签，最终代码最开头固定添加 `<!-- product detail webflow -->`；打包后下载 `store.html`，同时展示并下载作用域 CSS；不处理语言字段 | 本地生成；图片模式可能上传文件 |
| 基础工具 | 图片 AI 标志 | 图片文件模式用 Canvas 在右下角叠加 `AI GENERATED`，输出超过 512 KB 时保持原分辨率并转为 JPG；网页 HTML 模式可粘贴或上传代码，仅在每个可见 `section` 右下角显示标识，不单独标记 `img`，无背景图的 `section` 也会打标；生成的脚本避免相邻双右花括号，兼容商城 Detail 模板处理 | 本地生成；不上传、不覆盖原文件；网页模式保留原始图片地址和页面结构 |
| 基础工具 | Blog 图片 AI 标志 | Blog HTML 可上传或粘贴，为每个真实 `<img>` 右下角生成缩放至原尺寸 75% 的 `AI GENERATED` 标识；`<picture>` 整体作为一张图片处理，重复处理不叠加；使用内联 HTML/CSS，不依赖运行时脚本 | 本地生成；不上传、不覆盖原文件；保留图片 URL 和原始 `<img>` 标记 |
| 基础工具 | 视频上传-海外 | 选择 MP4，经项目已登录的 UMP“视频上传-海外”页面取得动态 token 并上传至文件服务，回传 MFS 视频地址；限 500 MB | 写入正式文件服务；不创建产品记录；不要重复提交 |
| 基础工具 | PDF / HTML 文字对比 | 先汇总 HTML 全部可见文字，排除 PDF 从 Specification 标题页到文件末尾的全部内容，再逐条检查此前正文；支持 HTML/PDF 拆分的数值与单位反向匹配，仅列出未匹配片段；可将语言字段建议应用到原 HTML 并在页面显示完整源码 | 本地读取；不覆盖原文件 |
| 基础工具 | i18n 语言转换 | 英文文案只按单产品语言包原文复用 Key，未命中归入新字段，不从总包复用；页面转换中 HTML 原有 Key 若不在单产品包，也列为新字段，英文原文留空待补；本地 Datasheet 生成则从既有输出或 HTML 备份恢复英文原文，将未收录的其他产品 Key 改为当前产品新 Key，并同步改写 HTML；当前产品已有 Key 译文保留，其他产品 Key 的旧译文不带入；转换结果最开头固定添加 `<!-- product detail webflow -->`，HTML 片段中的全部原始 `<link>` 标签原样保留；本地 Datasheet 的六项路径可直接编辑，并通过一个“同步所有默认路径”按钮统一保存 | 本地处理 |
| 产品资料处理 | PDF 上传转地址 | 上传 PDF 并返回线上地址 | 写入文件服务 |
| 产品资料处理 | Spec 参数解析 | Excel 转 PC/Mobile Specifications HTML | 本地处理 |
| 产品资料处理 | Datasheet 生成 Spec 表 | 从 PDF/文本生成 Spec Excel | 本地生成 |
| 产品资料处理 | 网站翻译表精简 | 自动识别 Datasheet 与 Specification 的语言列；选择目标语言后分别导出仅含英文和目标语言的工作簿，并保留原模板及字体颜色 | 本地生成 |
| 产品上架与维护 | Specification 翻译上架 | 预览翻译结果或提交后台 | `preview` 只读；`submit` 写后台 |
| 产品上架与维护 | 产品批量上架 | 自动识别产品 Excel；目标站点列表只显示全部所选产品的 Specification 语言列状态均为 `OK` 的站点。首次预览显示已有译文对比后，结果区才出现“强制覆盖已有译文”；切换会自动重新预览，默认关闭。开启后仍只改目标译文列，不改英文源列或 `Sheet1`。没有状态行的普通独立 Specification 文件保持原有兼容行为 | `preview` 只读；`submit` 写后台并回读 |
| 产品上架与维护 | 语言包上传 | 上传 `.xls/.xlsx` 到 Language Management | 写后台 |
| 产品上架与维护 | 单产品 Datasheet 更新语言包 | 识别 Datasheet 语种列，按该语种锁定后台语言行，再逐站按稳定 Key 覆盖译文；允许英文原文内容变化并警告，上传后遇到短暂旧包时只重下验证、不重复上传 | `inspect/preview` 只读；`submit` 写后台并可回滚 |
| 产品上架与维护 | 已上架产品单独更新 Specification | `updateScope=specification-only` 时只保存并回读 Specification；可直接上传欧洲云盘的 Datasheet + Spec/Specification 双工作表 Excel，自动选择规格工作表。操作下拉中的“只改语言包”会跳转至独立的单产品 Datasheet 更新语言包功能，不再读取产品 Detail/Spec | `preview` 只读；`submit` 写后台并回读 |
| 产品上架与维护 | Details 一键同步 | 固定以国际站同名产品为源，只需填写产品名并选择目标站点；仅同步 PC Details Overview，目标站不存在产品时跳过；未识别的规格字段名不会阻止仅同步 Overview，提交后确认全部自定义字段不变；不修改语言包、Product Description 或其他配置 | `preview` 只读；`submit` 写后台并回读 |
| 产品上架与维护 | 产品上线站点搜索（独立 Tab） | 输入产品名称后只读搜索全部启用的 EZVIZ 国家官网；匹配忽略大小写和所有空格，返回命中站点、产品链接及失败站点 | 只读官网搜索 |
| 产品上架与维护 | HG2_400_4 语言包定向修订 | 逐站预览 E 列，删除 `15s / 18s / 20s` 后原生保存、上传并回读；空值不上传 | `preview` 只读；`submit` 写后台并可回滚 |
| 产品上架与维护 | WTB 产品购买链接 | 下拉框单选站点，计划、提交、回读、往返测试和恢复购买链接 | `plan` 只读；其他接口可写后台 |
| 产品上架与维护 | TDK 配置 | 按国家站校验 Excel 并提交 SEO TDK | `plan` 只读；`submit` 写后台 |
| 产品上架与维护 | 后台产品替换 | 批量读取 Overview/Specifications | 当前只读，不保存产品 |
| 临时功能 | Detail 批量替换/删除 | 七列表格逐产品配置 Detail 地址、代码块和 Product Album 本地高清图路径；提交时上传并覆盖 | `preview` 只读；`submit` 每产品保存一次并逐项回读 |
| 资料平台 | 资料上传平台 | 识别资料并按选项上传/创建/归档；扩展语言接口可仅凭产品标题独立访问；SharePoint 素材类目固定为四类 | 依勾选项可能写外部后台 |
| 营销运营 | Banner / Popup / 巡查 | 生成清单、提交活动、发布、巡查、按前台可见顺序修复 UTM；Banner 各站默认第 1 位，图片使用带签名上传 | plan/audit/fix dryRun 只读；submit/fix 写后台 |
| 巡查与质量 | EZVIZ 官网定时巡查 | 产品文案/详情巡查、随机任务、定时执行 | 只读巡查并生成报告 |

离线分享包：`outputs/i18n-converter-sheet1-20261028.zip`。解压后双击 `index.html`；总语言包只读取 Sheet1（Category + Single word），不读取 Sheet2；保留 HTML 转换、单产品包对齐和结果下载，不包含依赖服务端路径的 Datasheet 生成。

## 关键文件

- 本地服务入口：`server.js`
- 站点与活动配置：`config/banner-check.json`
- 商城账号读取：`src/server/features/shop-credentials.js`
- 登录与浏览器会话：`src/server/features/browser-auth.js`
- Banner：`src/server/features/banner-management.js`
- Popup：`src/server/features/popup-management.js`
- TDK：`src/server/features/tdk-management.js`
- WTB：`src/server/features/wtb.js`
- 产品 Detail 批量读取：`src/server/features/product-replacement.js`
- Detail 内容替换/删除：`src/server/features/detail-address-replacement.js`
- 语言包：`src/server/features/language-package.js`
- Specification 上架：`src/server/features/specification-translation.js`
- 官网巡查：`src/server/features/ezviz-site-audit/`

## 启动与诊断

```powershell
npm install
npm start
Invoke-RestMethod http://localhost:3217/api/health
npm test
```

端口默认是 `3217`。启动前先检查端口是否已有本项目的 Node 进程；不要误停其他服务。
# 欧洲分类页与 Support 巡查

命令入口：`node scripts/audit-europe-category-support.js`。默认读取配置中的 12 个欧洲站点，覆盖两个分类页、分类导航以及产品卡片的全部变体标签组合；逐产品检查详情页和 Support 入口。可通过 `CATEGORY_AUDIT_SITES` 缩小站点范围。只读，不保存绑定。报告及页面截图位于 `outputs/europe-category-support-audit-2026-10-15/`。
