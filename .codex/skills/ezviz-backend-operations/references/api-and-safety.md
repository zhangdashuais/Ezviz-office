# 本地 API 与安全边界

服务基址：`http://localhost:3217`

## 公共与认证

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 服务健康检查 |
| GET | `/api/campaign/sites` | 获取启用站点 |
| POST | `/api/campaign/shop-login-check` | 登录、身份检查和受控诊断 |

账号留空时从项目 `credentials/`、用户桌面或 `EZVIZ_CREDENTIAL_DIR` 指向的账号 Excel 读取。不得把账号值或密码写入 Skill、日志或 Git。

## Banner、Popup 与巡查

| 方法 | 路径 | 状态 |
| --- | --- | --- |
| POST | `/api/campaign/banner-plan` | 只生成清单 |
| POST | `/api/campaign/banner-submit` | 写后台，可能发布 |
| POST | `/api/campaign/banner-fix-utm` | 写后台 |
| POST | `/api/campaign/popup-plan` | 只生成清单 |
| POST | `/api/campaign/popup-submit` | 写后台，可能启用 |
| POST | `/api/campaign/dtc-assets` | 只读检查 DTC 本地素材目录，不上传、不写后台 |
| POST | `/api/campaign/dtc-plan` | 只生成 DTC 德法西意荷选定投放类型的清单 |
| POST | `/api/campaign/dtc-submit` | 写后台，固定处理 DTC 德法西意荷；可用 `includeBanner` / `includePopup` 单独执行，并用 `bannerColor` 选择 Banner 字体颜色 |
| POST | `/api/campaign/popup-delete-existing` | 单站点恰好存在一条 Popup 时删除并回读确认 |
| POST | `/api/campaign/first-link` | 读取首个 Banner/Popup 链接 |
| POST | `/api/campaign/audit` | 同步巡查 |
| POST | `/api/campaign/audit-job` | 创建异步巡查 |
| GET | `/api/campaign/audit-job/:jobId` | 读取巡查进度 |

Popup 为单资源位。提交前先读取列表：无记录时直接新增；唯一记录的 `Period` 已过期时删除并回读确认后新增；未过期、日期无法解析或出现多条记录时停止并汇报。
Popup 新建固定使用 Playwright 操作真实后台页面：填写表单、通过文件控件上传图片、点击 Submit，并在列表页点击 Enable；不调用创建、启用或图片上传接口模拟提交。

内部 EZVIZ Banner UTM：

```text
utm_source={siteCode}_banner
utm_medium=banner{position}
utm_campaign=web_{siteCode}_banner
```

内部 EZVIZ Popup UTM：

```text
utm_source={siteCode}_popup
utm_medium=popup
utm_campaign=web_{siteCode}_popup
```

外部链接不自动添加 UTM。坏链只报告，不自动替换。

DTC 专用入口固定站点为 `de/fr/es/it/nl`，不读取页面勾选站点和普通 Banner/Popup 表单。请求只需 `assetRootPath`、`onlineAtUtc`、`offlineAtUtc`；三项均为必填。`includeBanner=false` 或 `includePopup=false` 可只执行另一类资源，默认两类都执行；`bannerColor` 支持 `White`（默认）或 `Black`。Banner 使用后台当前 WebUploader 上传，标题固定为 `&nbsp;`，链接固定为 `https://www.ezviz.com/{siteCode}/store/topic/hot-sale` 后再添加 Banner UTM，`model` 映射为：`de=Angebote`、`fr=Promotion`、`es=Venta Especial`、`it=Offerte top`、`nl=Mega deal`；固定隐藏 More、新窗口打开并直接发布。Popup Name 使用对应 Model，Brief 为空，Web/Mobile 链接使用同一 Hot Sale 地址并添加 Popup UTM，展示范围为全站、频率为每日一次，创建后直接启用。素材根目录按国家代码、英文名、本地名或中文名分类，素材名或子目录名需包含 `banner-pc`、`banner-mobile`、`popup`。Mobile 缺失时回退 PC 图。单文件默认上限 10 MB，缺失、重复匹配或超限会跳过对应国家并返回原因，其他国家继续。先运行 `/api/campaign/dtc-assets` 或 `/api/campaign/dtc-plan`，确认清单后再运行 `/api/campaign/dtc-submit`。

## TDK

| 方法 | 路径 | 状态 |
| --- | --- | --- |
| POST | `/api/tdk/plan` | 解析并校验 Excel，不提交 |
| POST | `/api/tdk/submit` | 按所选单站点提交并返回结果 |

表头：`Url Path`、`Title`、`Keyword`、`Discription`。提交前检查路径属于目标国家站。

## WTB

| 方法 | 路径 | 状态 |
| --- | --- | --- |
| POST | `/api/campaign/wtb-plan` | 校验产品、渠道和链接，不提交 |
| POST | `/api/campaign/wtb-submit` | 写入并后台回读，再严格检查前台 Buy、零售商弹窗和平台点击跳转 |
| POST | `/api/campaign/wtb-roundtrip-test` | 保存原值、写入测试值、回读、恢复原值 |
| POST | `/api/campaign/wtb-restore` | 将指定渠道恢复为空或指定 URL，并回读 |
| GET | `/api/campaign/wtb-reports/:filename` | 下载执行报告 |

字段：`Product`、`Product Page URL`、`Channel`、`Purchasing Link`。像 TDK 一样，WTB 必须通过下拉框选择且一次只允许一个站点；`Product Page URL` 属于其他站点时停止执行。渠道先精确匹配，再做唯一模糊匹配。

WTB 完整成功标准：后台保存回读通过，前台对应产品出现 `Buy` 按钮，点击后出现零售商弹窗，并且每个已配置平台都能点击且目标地址与期望地址匹配。前台验证优先使用 Excel 的 `Product Page URL`，后台产品列表和编辑模型中的链接仅作为备用候选。四项全部通过时状态为 `completed`；后台已写入但前台验证未通过时为 `configured_unverified`，不得报告为完整成功。

批量错误隔离：完全重复的同产品/平台/URL 行直接跳过；同一产品同一平台存在不同 URL 时跳过该产品并记录冲突。产品未找到或平台不存在记为 `skipped`；保存、会话等执行错误记为 `failed`。每个产品最多检查 3 个前台候选页并受总时限约束，单项异常后继续下一个产品。

临时验证优先使用 `wtb-roundtrip-test`。若接口报告恢复失败，立即调用 `wtb-restore` 恢复保存的原值，并确认 `backendCheck.status === "passed"`。

## 产品与资料

| 方法 | 路径 | 状态 |
| --- | --- | --- |
| POST | `/api/product-revision/preview` | 单产品 Detail 整体替换与 Specification 删除/替换预览 |
| POST | `/api/product-revision/submit` | 携带预览指纹保存单产品修订并回读验证 |
| POST | `/api/product-revision/common-preview` | 多站点 × 多产品的相同 Detail/Specification 片段删除或替换预览；也支持只按站点固定文案预览 Specification 的 Custom Page Name |
| POST | `/api/product-revision/common-submit` | 按逐站点、逐产品预览指纹执行相同片段修订或 Specification 输入框名称修订并分别回读 |
| POST | `/api/detail-address-replacement/preview` | 读取多个产品 PC Details，返回旧地址命中路径和次数 |
| POST | `/api/detail-address-replacement/submit` | 精确替换命中地址，保存后逐产品回读 |
| GET | `/api/detail-address-replacement/template` | 下载“临时功能”七列表格模板 |
| POST | `/api/specification/preview` | 预览，不提交 |
| POST | `/api/specification/submit` | 写产品后台 |
| POST | `/api/product-publishing/preview` | 在目标站读取国际产品复制源并预览上架，不提交 |
| POST | `/api/product-publishing/submit` | 在单个目标站复制产品、更新资料并回读 |
| POST | `/api/product-publishing/batch-preview` | 多产品、逐目标站预览上架；目标站已有同名产品时跳过复制，改为只预览资料/语言包更新，不提交 |
| POST | `/api/product-publishing/batch-submit` | 多产品、逐目标站执行；未存在则复制上架，已存在则只更新资料/语言包并回读 |

`/api/campaign/shop-login-check` 携带 `targetUrl=/goods/int-goods-list` 与 `inspectIntGoodsCopy=true` 时可只读检查国际产品复制列表；快照返回 `goods_id` 等列表字段。响应未包含 `isSearchable` 时，不得据此推断 Detail 开关状态。

产品上架与修订写入 Detail → Specification 时，表格行取目标站对应的工作簿译文列。后台自定义字段名 `vm.pcView.customs[n].name`（Custom Page Name 输入框）使用官网 tab 固定文案，HTML 顶部 Specification 标题使用规格内容标题；未知站点回退到工作簿标题。Custom Page Name 固定映射包括：荷兰/比利时 `Specificaties`，德国 `Technische Daten`，法国 `Spécifications`，西班牙/拉美/阿根廷 `Especificaciones`，意大利 `Specifiche`，捷克 `Technické údaje`，泰国 `รายละเอียด`。
保存产品资料前会自动把空的 Ads Additional Information → Product Title 补为当前产品名称；已有值不覆盖。
| POST | `/api/language-package/upload` | 上传语言包 |
| GET/POST | `/api/language-package/local-i18n-paths` | 读取或保存本机 i18n Datasheet 默认路径 |
| POST | `/api/language-package/local-i18n-path-picker` | 打开本机 HTML、Excel、输出目录或最终 `.xlsx` 保存路径选择器 |
| POST | `/api/language-package/local-i18n-datasheet` | 使用请求路径、已保存默认路径或自动匹配路径生成 Datasheet 并替换 HTML |
| POST | `/api/language-package/datasheet-inspect` | 识别单产品 Datasheet 的语种列和字段，不访问商城后台 |
| POST | `/api/language-package/datasheet-preview` | 逐站下载当前语言包，按 Datasheet 的 Key 和语种列生成覆盖预览；没有 Edit/Download 行的英文站点可使用明确带匹配 `lang_code` 的 Download Language Template；页面默认跳过站点缺失 Key，不上传 |
| POST | `/api/language-package/datasheet-submit` | 单任务运行；只提交预览为 `ready` 的站点，`failed` / `no-change` 站点跳过且不阻塞批次。Global 的 `English (Source)` 同时更新原文列和译文列并双列回读。含待更新 Global 的全站任务先提交 Global，再等待英文源同步并仅对已验证源字段自动刷新其余站点基线；其他变化仍按预览指纹拦截。随后原生修改、上传并重新下载回读，失败时回滚原包 |
| POST | `/api/language-package/hg2-400-4-preview` | 逐站下载语言包并预览 `HG2_400_4` E 列秒数删除，不上传 |
| POST | `/api/language-package/hg2-400-4-submit` | 按预览指纹逐站修改、上传并重新下载回读；失败时回滚原包 |
| POST | `/api/ecadmin/run` | 按所选动作处理/上传资料 |
| POST | `/api/assets/upload-image` | 上传图片 |
| POST | `/api/doc-upload` | 使用文件服务 `service/attach` 动态 token 批量上传 PDF，并为成功文件返回多个独立的 `<li><a target="_blank" ...></a></li>` 标签；链接文字为文件名去掉 `.pdf`，不包含外层 `<ul>` |

产品修订分为两种：同一产品跨国家修订继续使用 Specifications 与 Datasheet 同步；多个不同产品的相同部分修订可同时选择多个站点，对 Detail 或 Specification 执行同一条精确删除/替换，或只把 Specification 的 Custom Page Name 输入框修成站点固定文案。后者按国家 × 产品逐项预览、保存和回读，单项失败不影响其他任务，一次最多 50 个产品。产品修订和产品上架保存成功后，Detail、Specification 与 Product Description 回读最多重试 6 次、每次间隔 3 秒，以避开商城后台的短暂旧缓存；重试只重新读取，绝不重复提交保存。最终仍不一致时才报告失败。

Detail 内容操作递归处理 `vm.pcView` 的字符串值，适用于 Overview、自定义 Specifications 等 PC Details 内容。`operation: "replace"` 精确替换用户填写的文本，可为完整 URL、相对路径或地址片段，不要求 HTTP/HTTPS 协议；`operation: "delete"` 精确删除 `targetText` 指定的完整代码块（替换为空字符串）。直接修订接口也允许只提交 `productDescription` 更新 Basic Information 的 Product Description，或只提交 `specificationFieldName` 更新 Custom Page Name 输入框，同时保留 Overview 与 Specification 内容。先调用 `preview`；输入未变化且存在命中、字段名或 Product Description 发生变化时才能调用 `submit`。无命中且无字段名/描述变化不保存，提交后必须回读并确认目标内容剩余为 0、字段名和描述值一致。它不修改 Mobile Details 或其他产品标签。

“临时功能”默认操作类型为“全选”，同一次预览可包含地址替换、代码块删除和 Product Album 高清图覆盖；单项模式仍可单独选择。Excel 读取第一个工作表，表头固定为：`Product_Name`、`Old_Address_1`、`New_Address_1`、`Old_Address_2`、`New_Address_2`、`Delete_Code_Block`、`Product_Album_Image`。高清图列可填写本机 `jpg/jpeg/png/webp` 绝对路径或 HTTPS 图片地址。现成 `mfs.ezvizlife.com` 地址直接使用；其他 HTTPS 地址在 `submit` 时安全下载并上传到文件服务。`preview` 只校验输入和产品当前 Product Album 字段，不下载、不上传。高清图字段优先从编辑页 “Product Album” 行的 Angular 绑定精确定位，兼容字段名不含 `album/gallery` 的后台模型。提交后以最终 MFS URL 覆盖当前高清图，并重新打开产品编辑页回读。Product Album 字段缺失或候选不唯一时单项失败，不猜测覆盖。空操作跳过，每行至少一项操作，产品名不得重复，一次最多 50 个产品。全部操作只保存一次，再逐项回读。优先让用户通过页面的“下载信息模板”取得标准文件。

删除请求示例：

```json
{
  "operation": "delete",
  "sites": ["hq"],
  "productNames": "CP8\nH8c",
  "targetText": "<script>需要完整精确匹配的代码块</script>"
}
```

## 官网巡查

| 方法 | 路径 |
| --- | --- |
| POST | `/api/ezviz-site-audit/product-taglines` |
| POST | `/api/ezviz-site-audit/product-detail` |
| POST | `/api/ezviz-site-audit/jobs` |
| GET | `/api/ezviz-site-audit/jobs/:jobId` |
| GET | `/api/ezviz-site-audit/schedule` |
| POST | `/api/ezviz-site-audit/schedule/run` |

## 写操作检查表

1. 确认用户要求真实变更。
2. 只选择一个国家站点。
3. 校验登录身份与目标站点匹配。
4. 先运行 plan/preview。
5. 保存前记录原值或后台对象编号。
6. 检查 HTTP 状态和业务状态。
7. 重新打开编辑页回读。
8. 检查前台；区分后台成功与前台缓存/候选 URL 问题。
9. 临时测试恢复原值并再次回读。
