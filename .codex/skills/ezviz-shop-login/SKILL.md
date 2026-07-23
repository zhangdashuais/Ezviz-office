---
name: ezviz-shop-login
description: 使用 Playwright CLI 登录并验证 EZVIZ 国际商城后台。用户要求登录、切换站点账号、检查登录态，或任何商城后台自动化任务需要先建立认证会话时使用。
---

# EZVIZ 商城后台登录

只使用 `playwright-cli` 控制浏览器。使用命名的持久会话，让后续 Banner、Popup、TDK、WTB 等任务复用登录态。

## 固定地址

- 登录入口：`https://usauth.ezvizlife.com/signIn?from=ezviz_mall_global_gateway&r=1726447618240890209&returnUrl=www.ezvizlife.com&host=`
- 后台落点：`https://shop.ezvizlife.com/templates/index`
- 会话名：`ezviz-shop`
- 项目内持久配置：`.playwright-cli/ezviz-shop-profile`

## 登录步骤

1. 在项目根目录检查 CLI：

   ```powershell
   playwright-cli --version
   ```

   如果命令不存在，改用 `npx --no-install playwright-cli`，后续命令保持相同参数。

2. 首次登录时打开持久会话。PowerShell 中使用 `--%` 防止登录 URL 的 `&` 被解析：

   ```powershell
   playwright-cli -s=ezviz-shop --% open "https://usauth.ezvizlife.com/signIn?from=ezviz_mall_global_gateway&r=1726447618240890209&returnUrl=www.ezvizlife.com&host=" --browser=chrome --profile=.playwright-cli/ezviz-shop-profile
   ```

   如果会话已经打开，使用：

   ```powershell
   playwright-cli -s=ezviz-shop --% goto "https://usauth.ezvizlife.com/signIn?from=ezviz_mall_global_gateway&r=1726447618240890209&returnUrl=www.ezvizlife.com&host="
   ```

3. 获取当前页面元素引用：

   ```powershell
   playwright-cli -s=ezviz-shop snapshot --depth=6
   ```

4. 如果页面显示账号和密码输入框，用快照中的实际引用填写。不要猜测引用，也不要在日志中打印密码：

   ```powershell
   playwright-cli --raw -s=ezviz-shop fill <账号输入框引用> "<账号>"
   playwright-cli --raw -s=ezviz-shop fill <密码输入框引用> "<密码>"
   ```

   如果页面存在用户协议或隐私政策复选框，先用 `check <引用>` 勾选。然后点击实际的 Login、Sign in 或提交按钮：

   ```powershell
   playwright-cli -s=ezviz-shop click <登录按钮引用>
   ```

   若快照没有明确按钮，聚焦密码框后执行 `press Enter`。

5. 等待登录跳转完成，再明确打开后台落点：

   ```powershell
   playwright-cli -s=ezviz-shop run-code "async page => { await page.waitForTimeout(5000); return page.url(); }"
   playwright-cli -s=ezviz-shop goto https://shop.ezvizlife.com/templates/index
   ```

6. 严格验证登录。必须同时满足：域名为 `shop.ezvizlife.com`、路径为 `/templates/index`、没有可见密码框、右上角账号区域不为空。

   ```powershell
   playwright-cli -s=ezviz-shop run-code "async page => { await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(2500); const u = new URL(page.url()); const hasPassword = await page.locator('input[type=password]').first().isVisible().catch(() => false); const account = await page.locator('.clearfix.login-bar, .login-bar').first().innerText().catch(() => ''); if (u.hostname !== 'shop.ezvizlife.com' || u.pathname !== '/templates/index' || hasPassword || !account.trim()) throw new Error('EZVIZ shop login verification failed: ' + page.url()); return { ok: true, url: page.url(), account: account.replace(/\\s+/g, ' ').trim() }; }"
   ```

只有该命令返回 `ok: true` 才能继续执行后续后台操作。不要把 SSO 页面、公共官网、空白后台壳或其他域名当作登录成功。

## 复用与切换账号

- 后续操作始终添加 `-s=ezviz-shop`，不要另开匿名会话。
- 已有会话时先执行步骤 5 和 6；验证通过就直接复用，不要重复登录。
- 需要切换站点账号时，先访问 `https://sgpwww.ezvizlife.com/login/logout.html`，再从固定登录入口重新执行步骤 2–6。
- 持久配置被占用时，先用 `playwright-cli list` 查找重复 CLI 会话，只关闭项目自己的会话；不要结束用户的其他 Chrome。
- 登录成功后保持会话打开，交给调用该 Skill 的业务流程继续使用。只有任务明确结束时才执行 `playwright-cli -s=ezviz-shop close`。
