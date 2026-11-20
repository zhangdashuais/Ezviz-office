---
name: topic-page-ga4-report
description: 输入 EZVIZ 专题页 URL，读取该页 GA4 访问量、Popup/Banner UTM 来源、各商品外链点击及点击转化率。适用于活动页、专题页的数据复盘；只读，不修改页面或 GA4 配置。
---

# EZVIZ 专题页 GA4 读取

用户只需提供专题页 URL。默认读取该页面在当年首次出现 `page_view` 至昨天的完整日期；用户指定日期时以用户日期为准。日期和 GA4 属性时区必须写进报告。

## 执行

1. 在 `E:\Ezviz-office` 运行 [scripts/report.mjs](scripts/report.mjs)：

   ```powershell
   node .codex/skills/topic-page-ga4-report/scripts/report.mjs "https://www.ezviz.com/br/page/example"
   ```

   可选参数：`--start YYYY-MM-DD --end YYYY-MM-DD`。脚本读取本地 GA4 OAuth 和 Property ID，输出 JSON 到标准输出；不要打印或提交凭据。缺少授权时按 `ezviz-backend-operations` 的 Google 连接流程处理。
2. 根据脚本输出及在线页面核对 `cta-*` 与产品名称。`cta-all-products`、通用商城入口和无产品身份的链接不算单品点击。页面没有可靠产品 ID 时，说明无法可靠拆分商品，不猜测。
3. 用表格列出每个产品的“未带 Popup/Banner UTM、Popup、Banner、总点击数”，最右列放合计。Popup/Banner 来源按**点击时的 `pageLocation` URL**分类，而不是 `sessionSource`。同时列出对应 UTM 落地地址与 `page_view` 次数。
4. 报告正式域名的页面浏览量、访问会话、去重访客、产品总点击、发生产品点击的会话，以及“访问到产品点击转化率 = 点击会话 ÷ 访问会话”。可补充“点击人数 ÷ 页面访客”。明确这代表跳转点击，不是商城订单。

## 口径与检查

- 先看页面和 GA4 中实际存在的事件。Google 默认增强型衡量的外链事件名为 `click`；此项目也可能使用自定义 `outbound_click`。脚本只选一种有产品 `linkId` 的事件，不把多个事件相加。
- 页面浏览量用 `page_view`，单品点击用所选事件的 `eventCount`，访问会话用 `sessions`，去重人数用 `totalUsers`。这些指标不能互相替代。
- 无 Popup/Banner UTM 只表示点击时页面 URL 没有这两类参数，不等于自然流量或真正的跨会话归因。
- 检查输出的 GA4 `metadata` 是否提示抽样、阈值或 `(other)` 行。若有，缩短日期范围分段查事件次数，并明确去重人数或会话转化率可能受限；不能把不稳定数字当精确值。
- 仅对用户提供的 URL 所在域名统计正式页面；同路径的测试域名访问不混入结果。脚本结果与页面 ID 对不上时，先检查历史版页面、埋点和 GA4 链接维度，不虚构缺失产品数据。
