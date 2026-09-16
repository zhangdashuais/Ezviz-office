# 商品外链按钮与 GA4 报告标准

## 1. 统计口径

商品跳转次数统一使用 GA4 增强型衡量事件：

```text
Event name = outbound_click
```

核心字段：

| 用途 | GA4 维度 | 约定 |
|---|---|---|
| 所在页面 | Page path and screen class | 不使用 Page path + query string，避免 `fbclid`、UTM 等参数拆行 |
| 产品名称/型号 | Link ID | 使用 `cta-产品型号`，例如 `cta-C6N-G1-5MP` |
| 最终跳转地址 | Link URL | 用于检查链接和渠道 |
| 跳转次数 | Event count | 点击事件总数 |
| 点击人数（可选） | Total users | 去重用户，不等于点击次数 |

`ProductName` 不是 `outbound_click` 的自动字段，不要用它识别商品，否则通常显示 `(not set)`。

## 2. GA4 探索报告筛选方案

新建“自由形式”探索，或先复制现有页签并命名为 `Outbound Click`。

### Variables

导入维度：

- `Event name`
- `Page path and screen class`
- `Link ID`
- `Link URL`

导入指标：

- `Event count`
- `Total users`（可选）

### Settings

行维度顺序：

1. `Page path and screen class`
2. `Link ID`
3. `Link URL`

值：`Event count`。

筛选器：

```text
Event name exactly matches outbound_click
Link ID begins with cta-
```

查看所有页面时不要添加页面筛选器，直接在第一列按页面查看。

只看一个页面：

```text
Page path and screen class exactly matches /br/page/example
```

同时查看多个指定页面：

```text
Page path and screen class matches regex ^/(br/page/example-a|br/page/example-b)$
```

查看所有活动页和产品页：

```text
Page path and screen class matches regex ^/(?:[^/]+/)?(?:page|product)/
```

日期范围在探索报告右上角设置。`Event count` 是点击次数；不要用 `Total users` 替代点击次数。

## 3. 按钮 HTML 标准

优先直接在 HTML 中写入稳定 ID：

```html
<a
  id="cta-C6N-G1-5MP"
  class="product-card__cta"
  data-product-id="C6N-G1-5MP"
  href="https://example-retailer.com/product/c6n-g1-5mp"
  target="_blank"
  rel="noopener noreferrer"
>
  Buy now
</a>
```

规则：

- ID 格式：`cta-<canonical-product-id>`。
- 产品 ID 只使用 ASCII 字母、数字和连字符，保持大小写及型号写法稳定。
- 不使用翻译后的按钮文案或价格作为 ID。
- 同一页面 ID 必须唯一。
- 同一产品有多个位置时追加位置，例如 `cta-C6N-G1-5MP-hero`、`cta-C6N-G1-5MP-card`。
- `href` 必须是真实外部地址。站内链接不会被 GA4 自动识别为 outbound。
- 新窗口链接必须保留 `rel="noopener noreferrer"`。

## 4. JS 标准

静态 ID 是首选。模板无法直接写 ID 时，使用 Skill 的 JS 资产，从 `data-product-id` 补齐 ID。脚本只设置和检查 ID，不发送 GA4 事件：

```html
<script src="/path/product-outbound-links.js" defer></script>
```

禁止在页面中再写：

```js
gtag('event', 'buy_button_click', ...);
```

如果全站 GTM 已配置同一 GA4 数据流，也不要在页面里再次加载：

```html
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
```

## 5. 验证步骤

1. 检查页面上商品外链数量与唯一 `cta-*` ID 数量是否一致。
2. 点击一个测试按钮，在 GA4 DebugView 或 Realtime 中确认：
   - `event_name = outbound_click`
   - `link_id = cta-具体产品`
   - `link_url = 实际外部地址`
3. 等待标准报表处理后，在探索报告用相同日期和页面路径核对。
4. 没有数据时依次检查：是否为外部链接、增强型衡量是否启用、日期是否覆盖点击时间、页面路径是否写错、Link ID 是否以 `cta-` 开头。

## 6. 边界

- 本规范统计“离开 EZVIZ 页面并跳向外部商城”的点击，不代表订单或成交。
- 历史上未发送的自定义事件无法补录。
- 若必须统计站内跳转、按钮位置汇总或订单归因，应另建明确事件/参数，不改变 `outbound_click` 的基础报表。
