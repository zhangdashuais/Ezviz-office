# Ezviz Office 本地功能导航

入口：`http://localhost:3217/inline-packager.html`

前端真源：`办公软件/111/inline-packager.html` 与 `办公软件/111/src/`

## 导航与能力

| 分组 | 页面入口 | 主要能力 | 默认风险 |
| --- | --- | --- | --- |
| 基础工具 | 一键内联打包 | 将页面 CSS、图片和 HTML 处理为上线代码 | 本地生成；图片模式可能上传文件 |
| 基础工具 | i18n 语言转换 | 将 HTML 硬编码文案生成新 Key，用总语言包回查已有 Key；支持导出 i18n HTML 和语言包 Excel，并跳过产品名、角标、AES/TLS、度数、计量值和纯标点 | 本地处理 |
| 产品资料处理 | PDF 上传转地址 | 上传 PDF 并返回线上地址 | 写入文件服务 |
| 产品资料处理 | Spec 参数解析 | Excel 转 PC/Mobile Specifications HTML | 本地处理 |
| 产品资料处理 | Datasheet 生成 Spec 表 | 从 PDF/文本生成 Spec Excel | 本地生成 |
| 产品上架与维护 | Specification 翻译上架 | 预览翻译结果或提交后台 | `preview` 只读；`submit` 写后台 |
| 产品上架与维护 | 语言包上传 | 上传 `.xls/.xlsx` 到 Language Management | 写后台 |
| 产品上架与维护 | WTB 产品购买链接 | 下拉框单选站点，计划、提交、回读、往返测试和恢复购买链接 | `plan` 只读；其他接口可写后台 |
| 产品上架与维护 | TDK 配置 | 按国家站校验 Excel 并提交 SEO TDK | `plan` 只读；`submit` 写后台 |
| 产品上架与维护 | 后台产品替换 | 批量读取 Overview/Specifications | 当前只读，不保存产品 |
| 临时功能 | Detail 批量替换/删除 | 六列表格逐产品配置最多两组地址替换和一个代码块删除 | `preview` 只读；`submit` 每产品保存一次并逐项回读 |
| 资料平台 | 资料上传平台 | 识别资料并按选项上传/创建/归档；扩展语言接口可仅凭产品标题独立访问；SharePoint 素材类目固定为四类 | 依勾选项可能写外部后台 |
| 营销运营 | Banner / Popup / 巡查 | 生成清单、提交活动、发布、巡查、修复 UTM | plan/audit 只读；submit/fix 写后台 |
| 巡查与质量 | EZVIZ 官网定时巡查 | 产品文案/详情巡查、随机任务、定时执行 | 只读巡查并生成报告 |

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
