# 从 Git 获取 Ezviz Office 源码

本项目的 Git 远端为 `https://github.com/zhangdashuais/Ezviz-office.git`，日常部署使用 `main` 分支。以下命令用于 Windows PowerShell；示例安装位置为 `E:\Ezviz-office`。

## 首次获取源码

先安装 Git 和 Node.js 24.x，确认 `git --version`、`node --version`、`npm --version` 均可运行。然后在**尚不存在** `E:\Ezviz-office` 的电脑上执行：

```powershell
Set-Location 'E:\'
git clone --branch main https://github.com/zhangdashuais/Ezviz-office.git
Set-Location 'E:\Ezviz-office'
git status -sb
npm ci
npx playwright install chromium
npm start
```

浏览器打开 `http://localhost:3217/inline-packager.html`；另开 PowerShell 窗口运行 `Invoke-RestMethod 'http://localhost:3217/api/health'`，应返回 `ok: true`。后续配置和安全要求见 [项目部署说明](../项目部署说明.md)。

若 GitHub 要求身份验证，请使用**有仓库读取权限**的 GitHub 账号，按 Git 凭据管理器提示登录。没有权限时联系仓库管理员；不要把个人访问令牌拼进克隆 URL、命令、`.env` 或文档。

## 已安装项目时更新

先停止运行中的 `npm start`，再执行：

```powershell
Set-Location 'E:\Ezviz-office'
git status --short
git fetch origin
git pull --ff-only origin main
npm ci
npm test
```

如果 `git status --short` 有输出，先确认并保存本地修改；不要强行清空。`git pull --ff-only` 若因分支分叉而失败，应先核对本地提交和团队合并方案，不要使用 `git reset --hard`。Playwright 版本变化时，再运行 `npx playwright install chromium`。更新完成后重新 `npm start` 并检查健康接口。

## Git 不会带来的本机数据

源码仓库不包含 `.env`、商城账号 Excel、OAuth 凭据、`runtime/`、`runtime_uploads/`、`outputs/` 和浏览器登录 profile。需要这些功能时，按 [项目部署说明](../项目部署说明.md) 单独配置或通过安全渠道迁移。不要将账号、令牌或登录态提交到 Git。
