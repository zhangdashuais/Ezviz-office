# Ezviz Office

本项目是一个本地办公自动化工具，用于网站资料处理、商城后台配置、Banner / Popup 巡查、Spec 解析等内部工作流。

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
