# Banner / Popup 首个跳转链接巡查

该功能以只读方式打开当前所选站点首页，返回第一个 Banner、Popup 或两者的跳转地址，同时检查 HTTP 可用性和 UTM 配置，不会修改线上后台。

## UTM 规则

EZVIZ 内部链接（`ezviz.com` 及其子域名）必须配置以下三项。国际站配置代码 `inter` 在活动 UTM 中映射为 `hq`，其他站点使用各自站点代码。

Banner 第 N 位：

```text
utm_source={campaignCode}_banner
utm_medium=banner{N}
utm_campaign=web_{campaignCode}_banner
```

Popup：

```text
utm_source={campaignCode}_popup
utm_medium=popup
utm_campaign=web_{campaignCode}_popup
```

例如国际站第一个 Banner：

```text
utm_source=hq_banner
utm_medium=banner1
utm_campaign=web_hq_banner
```

法国站 Popup：

```text
utm_source=fr_popup
utm_medium=popup
utm_campaign=web_fr_popup
```

外部链接不强制添加 EZVIZ UTM。已有的其他查询参数和 URL hash 会保留。

## 使用方式

后台管理页面进入“Banner / Popup / 巡查”，只勾选一个站点，选择 `banner`、`popup` 或 `banner + popup`，然后点击“读取首个跳转链接”。结果区会显示：

- 页面实际渲染的跳转地址
- 活动位置和文案
- HTTP 状态及最终重定向地址
- UTM 是否正确
- 有问题时的建议修正地址

命令行也可以直接运行：

```powershell
npm run inspect:campaign-link -- --site inter --placement banner
npm run inspect:campaign-link -- --site fr --placement popup --popup-wait-ms 5000
```

对应 API：

```text
POST /api/campaign/first-link
```

请求示例：

```json
{
  "sites": ["inter"],
  "placement": "banner",
  "popupWaitMs": 5000
}
```

Banner 使用 `.swiper-container-home`，优先读取 `data-swiper-slide-index="0"`。Popup 优先读取 `.J_DialogGo.pc-show`，其次读取移动端链接；没有正在展示的 Popup 时返回 `found: false`。
