# Ezviz Office

本项目是一个本地办公自动化工具，用于网站资料处理、商城后台配置、Banner / Popup 巡查、Spec 解析等内部工作流。

## TDK 配置通道

后台已集成国际站 TDK 批量配置。Excel 使用 `Url Path`、`Title`、`Keyword`、`Discription` 四个字段；本地服务负责解析和校验，确认后复用国际站后台登录态，直接调用 `/seo-tdk/create` 逐行提交并返回每行结果。浏览器页面只在用户二次确认后才会发起生产提交。

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
