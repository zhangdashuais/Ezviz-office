# Ezviz Office

本项目是一个本地办公自动化工具，用于网站资料处理、商城后台配置、Banner / Popup 巡查、Spec 解析等内部工作流。

## TDK 配置通道

后台已预留独立的 TDK 配置入口。第一阶段支持下载规范模板、上传 Excel、校验必填字段并预览数据，不会向业务后台提交。正式配置流程将在后台页面或接口规则确认后接入 `办公软件/111/src/module-tdk-config.js`。

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
