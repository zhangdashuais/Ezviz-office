# Homepage banner 配置记录

## Click URL UTM Rule

This rule applies to the banner `Link` field.

- When opening the banner configuration dialog, review every existing banner slide before saving or publishing.
- New banner slides must be placed in the first carousel position by default. After adding a new slide, move it to position 1 before checking and saving UTM values.
- For each slide, determine its carousel position and check whether its `Link` follows the rule below.
- If a slide points to an internal EZVIZ URL and its UTM is missing, wrong, or out of order, replace the `Link` with the corrected URL.
- External URLs should be reviewed for reachability only; do not add UTM to external URLs.
- If the URL points to an internal EZVIZ domain, add or overwrite these UTM values:
  - `utm_source={siteCode}_banner`
  - `utm_medium=banner{position}`
  - `utm_campaign=web_{siteCode}_banner`
- `position` is the carousel order. The first banner is `banner1`, the second banner is `banner2`, and so on.
- Internal domains include `ezviz.com`, `www.ezviz.com`, `ezvizlife.com`, `www.ezvizlife.com`, and their subdomains.
- If the URL points to an external domain, keep it unchanged and do not add UTM.
- If an existing banner has wrong order UTM or missing UTM, overwrite the URL with the corrected URL before saving.

Use the helper before filling the backend form:

```powershell
node .\campaign-url-tools\scripts\campaign-url.mjs --site de --placement banner --position 1 --url "https://www.ezviz.com/de/product/h8c-pro-4k"
```

When fixing all existing banner slides, apply the helper once per slide using that slide's current `Link` and carousel position. Do not publish until all internal banner links are corrected.

## 入口

- 后台首页列表：`https://shop.ezvizlife.com/pages/index`
- Visual Editor：点击启用状态的 `Homepage` / `web.index.index4`
- 编辑器地址示例：`https://shop.ezvizlife.com/pages/editor?theme_id=107&tpl_id=303`
- Banner 编辑：鼠标悬停 `.home-banner.js-widget-wrapper`，点击出现的 `Edit`

## 操作顺序

1. 打开 banner 的 `Edit` 弹窗。
2. 点击 `Add new slide` 新增 slide。
3. 将新增 slide 移动到第 1 个轮播位。
4. 按新的轮播顺序检查所有站内 banner 链接的 UTM，并修复缺失、错误或顺序不一致的 UTM。
5. 在新增 slide 的表单中填写字段。
6. 上传 PC image 和 Mobile image。
7. 点击弹窗内的 `Save`。
8. 如需正式发布，再由人工确认后点击编辑器外层发布按钮。

## 字段

| 字段 | 页面标签 | 选择器/位置 | 本次测试值 |
| --- | --- | --- | --- |
| 标题 | Headline | `#title` | `FR Banner Test` |
| 链接 | Link | `#url` | `https://www.ezviz.com/fr` |
| 隐藏更多按钮 | No More Button | `#no_more_button` | 未勾选 |
| 副标题 | Slogan | `#sub_title` | `FR homepage banner test` |
| 型号 | Model | `#model` | `FR Banner` |
| 简介 | Introduction | `#info` | `FR test banner` |
| 新窗口打开 | Open Link in New Tab | `#active` | 未勾选 |
| 字体颜色 | Color | `select[name="color"]` | `White` / `#fff` |
| PC 图片 | PC image | 第 1 个 `input[type=file]` | `<项目目录>\assets\campaign\fr.jpg` |
| Mobile 图片 | Mobile image | 第 2 个 `input[type=file]` | `<项目目录>\assets\campaign\fr-mobile.jpg` |
| 上线时间 | Timer (UTC) online | `.timer-online` | `2026/05/20 00:00:00` |
| 下线时间 | Timer (UTC) offline | `.timer-offline` | `2026/06/06 23:59:59` |

## 本次上传结果

- PC 图片上传后地址：`https://mfs.ezvizlife.com/6609f3e087a148d1572a51083f7c39ef.jpg`
- Mobile 图片上传后地址：`https://mfs.ezvizlife.com/6609f3e087a148d1572a51083f7c39ef.jpg`
- 本次按要求点击 `Add new slide` 新增后配置，没有继续在原有 slide 上添加。
- 已点击弹窗内 `Save`。
- 已点击编辑器外层 `Publish`，发布接口 `https://shop.ezvizlife.com/pages/save-all` 返回 200。
