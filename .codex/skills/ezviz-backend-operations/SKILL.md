---
name: ezviz-backend-operations
description: 操作和维护 Ezviz Office 本地后台及 EZVIZ 国际商城后台。用户要求查找后台导航、启动本地工具、登录或切换国家站点、配置或巡查 Banner/Popup/UTM、提交 TDK、配置或恢复 WTB、上传语言包、处理产品资料、批量读取产品 Detail、批量替换 Detail 图片或链接地址、精确删除 Detail 代码块、执行官网巡查，或扩展相关自动化脚本时使用。
---

# EZVIZ 后台运营

在项目根目录执行操作。优先复用现有页面、接口和功能模块，不另写一次性浏览器脚本。

## 开始前

1. 确认根目录存在 `package.json`、`server.js`、`办公软件/111/inline-packager.html`。
2. 需要本地平台时运行 `npm start`，并检查：

   ```text
   GET http://localhost:3217/api/health
   http://localhost:3217/inline-packager.html
   ```

3. 需要登录真实商城后台时，先完整读取并执行：

   ```text
   .codex/skills/ezviz-shop-login/SKILL.md
   ```

   使用 `playwright-cli` 的命名持久会话。不要猜元素引用，不要把密码打印到日志。

4. 从 `GET /api/campaign/sites` 读取启用站点。真实提交一次只选择一个站点，并核对登录后的右上角账号身份。

## 选择工作流

- 查找本地工具入口或判断功能是否会写入：读取 [references/local-console.md](references/local-console.md)。
- 查找商城侧栏菜单、路由或自动化地址：读取 [references/shop-navigation.md](references/shop-navigation.md)。
- 调用接口、编写扩展脚本或执行真实提交：读取 [references/api-and-safety.md](references/api-and-safety.md)。

## 执行原则

1. 先调用 `plan`、`preview`、只读接口或页面上的“生成清单”按钮。
2. 校验站点、产品名、文件、时间、链接和平台名称。
3. 登录并核对目标账号；账号不匹配时先退出再重新登录。
4. 仅在用户要求真实变更时调用 `submit`、`upload`、`restore` 等写接口。
5. 保存后必须回读后台状态；涉及前台展示时再打开目标国家站页面复查。
6. 批量任务逐项记录成功与失败，单项失败不应隐藏或伪装成整体成功。
7. 临时测试必须先记录原值，并在 `finally` 中恢复；恢复失败时重新登录后重试并再次回读。

## 代码扩展约定

- 商城导航的机器可读真源是 `src/server/config/shop-navigation.json`；通过 `src/server/features/shop-navigation.js` 查询，不在脚本中散落硬编码菜单。
- 本地页面入口以 `办公软件/111/inline-packager.html` 为准，行为脚本位于同目录 `src/`。
- 服务端业务放在 `src/server/features/`，路由放在 `src/server/routes/`；`server.js` 只负责组装依赖和注册路由。
- 新增或变更功能后同步更新本 Skill 的相关 reference、`docs/backend-navigation.md` 和 `操作界面功能说明.md`。
- 修改后运行 `npm test`；真实后台写操作还要执行一次受控的写入、回读和恢复验证。

## 禁止事项

- 不把账号密码、Cookie、Storage State 或账号 Excel 加入 Git。
- 不使用示例链接、搜索结果或猜测值覆盖正式数据，除非用户明确授权临时测试且有可靠恢复流程。
- 不因前台缓存未刷新就重复提交；先检查后台回读结果和实际请求响应。
- 不关闭用户的普通 Chrome，只管理项目自己的 Playwright CLI 命名会话。
