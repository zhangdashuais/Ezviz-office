---
name: ga4-product-outbound-tracking
description: 规范网页商品外链按钮并使用 GA4 outbound_click 制作“页面—商品—跳转次数”报告。适用于检查或修改 HTML 按钮、清理重复 GA4 埋点、配置 GA4 探索报告及排查商品外链点击缺失；不用于站内按钮或成交归因。
---

# GA4 商品外链点击规范

以 GA4 增强型衡量的 `outbound_click` 作为商品外链跳转的唯一统计口径。

处理按钮、报告或排查任务时，完整读取 [references/standard.md](references/standard.md)。用户需要可直接使用的脚本时，复用 [assets/product-outbound-links.js](assets/product-outbound-links.js)。

## 工作原则

1. 先确认页面已有全站 GTM 或 GA4，不为同一 Measurement ID 重复加载 `gtag.js`。
2. 商品跳转必须使用 `<a href>`，并提供稳定、可读且唯一的 `cta-*` ID。
3. 不另外发送 `buy_button_click`；需要成交、站内点击或业务参数时，另行设计事件并明确其不同口径。
4. GA4 报告按 `Page path and screen class`、`Link ID`、`Link URL` 展开，指标使用 `Event count`。
5. 修改现有探索报告前复制页签；保留原页签作为备份。外部写入仍需用户授权。
6. 完成后核对筛选器、日期范围、页面路径和实际出现的 `cta-*`。未出现的商品可能只是没有点击，不能直接判定为埋点失败。

## 验收

- 页面上每个商品外链都有唯一 `cta-*` ID。
- 点击后 GA4 DebugView、Realtime 或探索数据可看到 `outbound_click`、`link_id` 与 `link_url`。
- 同一页面不会同时用直连 GA4 与全站 GTM 向同一数据流重复发送。
- 报告能按页面列出具体商品及 `Event count`。
