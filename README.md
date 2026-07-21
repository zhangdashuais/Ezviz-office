# Ezviz Office

本项目是一个本地办公自动化工具，用于网站资料处理、商城后台配置、Banner / Popup 巡查、Spec 解析等内部工作流。

## TDK 配置通道

后台提供独立的 TDK 配置入口，支持下载规范模板、上传 Excel、校验必填字段、预览数据并执行批量配置。提交时会按站点拆分数据，转换成商城后台官方 `url / title / description / keyword` 格式，复用站点账号登录 `TDK / Import`，导入完成后再按 URL Path 在列表中复核。

## 使用

```powershell
npm install
npm start
```

启动后访问：

```text
http://localhost:3217/inline-packager.html
```

## 账号密码表

账号密码 Excel 不放在 Git 仓库里。程序会优先从当前 Windows 用户桌面读取名称包含 `网站账号密码` 或 `账号密码` 的 `.xlsx` 文件。

也可以设置 `EZVIZ_CREDENTIAL_DIR` 环境变量，指定账号密码表所在文件夹。
