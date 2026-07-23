# Ezviz Office

本项目是一个本地办公自动化工具，用于网站资料处理、商城后台配置、Banner / Popup 巡查、Spec 解析等内部工作流。

## TDK 配置通道

后台已集成国家站点 TDK 批量配置。页面先选择一个目标国家站，Excel 使用 `Url Path`、`Title`、`Keyword`、`Discription` 四个字段；本地服务负责解析、校验路径是否属于所选站点，确认后复用对应商城后台登录态，直接调用 `/seo-tdk/create` 逐行提交并返回结果。

WTB 页面提供可下载的信息模板，字段为 `Product`、`Product Page URL`、`Channel`、`Purchasing Link`。

## 使用

```powershell
npm install
npm start
```

启动后访问：

```text
http://localhost:3217/inline-packager.html
```

## 项目内配置

Banner / Popup 的站点清单与 UTM 规则位于 `config/banner-check.json`，巡查脚本位于 `scripts/check-homepage-campaign-rendered.mjs`。项目运行不再依赖外部 `Website-backend` 文件夹。

如需临时使用另一份站点配置，可以设置 `EZVIZ_CAMPAIGN_CONFIG` 环境变量覆盖默认文件。

## 账号密码表

账号密码 Excel 不放在 Git 仓库里。可以把名称包含 `网站账号密码` 或 `账号密码` 的 `.xlsx` 文件放入项目内 `credentials/` 目录；该目录下的 Excel 已被 Git 忽略。程序也兼容从当前 Windows 用户桌面读取。

也可以设置 `EZVIZ_CREDENTIAL_DIR` 环境变量，指定账号密码表所在文件夹。
