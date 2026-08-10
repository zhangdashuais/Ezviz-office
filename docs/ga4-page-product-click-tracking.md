# GA4 页面接入与产品点击监听说明

这份文档记录从页面接入 GA4，到通过产品名称统计点击数的完整流程。适合以后给活动页、产品页、专题页补 GA4 埋点时参考。

## 1. 目标

页面需要做到两件事：

1. 正常接入 GA4，让页面访问能进入 GA4。
2. 点击产品购买按钮时，向 GA4 发送事件，并带上产品标识，例如 `cta-SuperDis-EP4`，以后可以直接按产品名称看点击数，而不是靠跳转链接猜产品。

当前使用的 GA4 Measurement ID：

```text
G-GFXNRVT2BW
```

## 2. 页面需要先接入 GA4

在页面 HTML 中加入 GA4 基础代码。

推荐放在页面 `<head>` 里；如果系统限制不能放到 `<head>`，也可以放到页面主体区域，例如 `.page-container-v3` 下，但要保证它出现在点击监听代码之前。

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-GFXNRVT2BW"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-GFXNRVT2BW');
</script>
```

这段代码的作用：

- 加载 GA4 的 `gtag.js`
- 创建 `dataLayer`
- 定义 `gtag()` 方法
- 初始化 GA4
- 发送默认页面访问数据

如果页面里没有这段基础代码，后面的产品点击事件即使写了，也不会真正发到 GA4。

## 3. 给产品按钮设置可识别的 class 和 id

每个需要监听的购买按钮，需要有统一 class，例如：

```html
<a
  class="click_buy"
  id="cta-SuperDis-EP4"
  href="https://www.ezviz.com/de/store/product/ep4/385809"
>
  Buy Now
</a>
```

规则建议：

- `class="click_buy"`：用于告诉脚本“这个按钮需要监听”。
- `id="cta-SuperDis-EP4"`：用于告诉 GA4 “这是哪个产品”。
- `href`：用于记录跳转地址，可选但推荐保留。

`id` 最好稳定、可读、唯一，例如：

```text
cta-SuperDis-EP4
cta-SuperDis-HP7Pro
cta-SuperDis-EP8Ultra
cta-SuperDis-TP9-Pro
```

## 4. 加入产品点击监听代码

把下面代码放在 GA4 基础代码之后。

```html
<script>
function bindGa4BuyButtonTracking() {
  const buyButtons = document.querySelectorAll('.click_buy');

  buyButtons.forEach(function(button) {
    if (button.dataset.ga4Bound === '1') return;
    button.dataset.ga4Bound = '1';

    button.addEventListener('click', function() {
      const ctaId = this.id || 'unknown';
      const destinationUrl = this.getAttribute('href') || '';

      if (typeof gtag === 'function') {
        gtag('event', 'buy_button_click', {
          product_name: ctaId,
          link_url: destinationUrl
        });
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindGa4BuyButtonTracking);
} else {
  bindGa4BuyButtonTracking();
}
</script>
```

事件说明：

- 事件名：`buy_button_click`
- 产品参数：`product_name`
- 链接参数：`link_url`

GA4 里后续重点看：

```text
eventName = buy_button_click
product_name = cta-SuperDis-EP4
```

## 5. 测试时建议临时打开 debug_mode

如果要在 GA4 的 DebugView 里实时看参数，可以临时加上 `debug_mode: true`：

```js
gtag('event', 'buy_button_click', {
  product_name: ctaId,
  link_url: destinationUrl,
  debug_mode: true
});
```

确认没问题后，可以去掉 `debug_mode`，避免正式数据里长期带调试标记。

## 6. GA4 后台需要注册 Custom dimension

GA4 默认会收到事件参数，但如果想在报表或 API 里按 `product_name` 查询，需要注册自定义维度。

进入路径：

```text
GA4 后台
→ Admin
→ Data display
→ Custom definitions
→ Create custom dimension
```

填写方式：

| 字段 | 填写 |
| --- | --- |
| Dimension name | Product_name 或 Product name |
| Scope | Event |
| Event parameter | product_name |
| Description | Product name clicked on campaign/product cards |

注意：

- `Event parameter` 必须精确写成 `product_name`。
- 大小写、下划线都要一致。
- 如果也想按跳转链接分析，还需要再建一个 Custom dimension，参数名填 `link_url`。
- Custom dimension 创建后通常不会立刻补全历史数据，主要用于创建之后的新数据。

## 7. 在 GA4 里怎么验证

### Realtime

适合确认有没有收到事件。

路径：

```text
Reports
→ Realtime
```

点击页面上的产品按钮后，看是否出现：

```text
buy_button_click
```

### DebugView

适合确认事件参数有没有正确传入。

路径：

```text
Admin
→ Data display
→ DebugView
```

如果代码里带了 `debug_mode: true`，点击按钮后可以在 DebugView 里查看事件，并展开参数确认：

```text
product_name: cta-SuperDis-EP4
link_url: https://...
```

## 8. 常见问题

### 页面里只有点击监听代码，但没有 GA4 基础代码，可以监听吗？

不可以。

点击监听代码依赖 `gtag()`。如果页面没有加载 GA4 基础代码，`typeof gtag` 会是 `undefined`，事件不会发送。

### GA4 基础代码只能放在 `.page-container-v3` 下，可以吗？

可以，但要满足两个条件：

1. GA4 基础代码要放在点击监听代码之前。
2. 页面加载后实际源码里能看到 `gtag/js?id=G-GFXNRVT2BW`。

### 有 GTM 代码，还需要手写 gtag 吗？

如果没有 GTM 权限，或者不确定 GTM 里是否配置了 GA4，建议先用手写 gtag。

如果以后拿到 GTM 权限，推荐二选一：

- 方案 A：GTM 里统一配置 GA4，页面只放 GTM 代码。
- 方案 B：页面继续手写 gtag，不通过 GTM 发 GA4。

不要同时让 GTM 和手写 gtag 都发送同一个 GA4 page_view，否则容易重复统计。

### 能不能不靠链接判断产品？

可以，这正是 `product_name` 的作用。

每个按钮用稳定的 `id` 标识产品，然后点击时把这个 `id` 作为 `product_name` 发给 GA4。后续报表/API 直接按 `product_name` 聚合即可。

## 9. 当前已测试页面示例

页面：

```text
https://www.ezviz.com/de/page/smarte-premium-zutrittsloesungen
```

页面上检测到的按钮：

| product_name | link_url |
| --- | --- |
| cta-SuperDis-EP4 | https://www.ezviz.com/de/store/product/ep4/385809 |
| cta-SuperDis-HP7Pro | https://www.ezviz.com/de/store/product/hp7-pro/187453 |
| cta-SuperDis-EP8Ultra | Amazon 跳转链接 |
| cta-SuperDis-TP9-Pro | https://www.ezviz.com/de/store/product/tp9-pro/283777 |

测试结论：

- 页面已有 `.click_buy` 按钮。
- 页面已有产品点击监听逻辑。
- 自定义维度 `product_name` 设置正确。
- 但测试时页面没有检测到 `gtag()`，也没有检测到 GA4/GTM 请求，所以需要先把 GA4 基础代码真正加到页面里。

## 10. 最小可复制版本

如果只想复制一段最小可用代码，可以用下面这一整段：

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-GFXNRVT2BW"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-GFXNRVT2BW');

function bindGa4BuyButtonTracking() {
  document.querySelectorAll('.click_buy').forEach(function(button) {
    if (button.dataset.ga4Bound === '1') return;
    button.dataset.ga4Bound = '1';

    button.addEventListener('click', function() {
      gtag('event', 'buy_button_click', {
        product_name: this.id || 'unknown',
        link_url: this.getAttribute('href') || ''
      });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindGa4BuyButtonTracking);
} else {
  bindGa4BuyButtonTracking();
}
</script>
```
