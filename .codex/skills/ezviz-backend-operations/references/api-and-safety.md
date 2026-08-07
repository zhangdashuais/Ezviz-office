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
| POST | `/api/campaign/first-link` | 读取首个 Banner/Popup 链接 |
| POST | `/api/campaign/audit` | 同步巡查 |
| POST | `/api/campaign/audit-job` | 创建异步巡查 |
| GET | `/api/campaign/audit-job/:jobId` | 读取巡查进度 |

Popup 为单资源位。提交前先读取列表：无记录时直接新增；唯一记录的 `Period` 已过期时删除并回读确认后新增；未过期、日期无法解析或出现多条记录时停止并汇报。

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

WTB 完整成功标准：后台保存回读通过，前台对应产品出现 `Buy` 按钮，点击后出现零售商弹窗，并且每个已配置平台都能点击且目标地址与期望地址匹配。四项全部通过时状态为 `completed`；后台已写入但前台验证未通过时为 `configured_unverified`，不得报告为完整成功。

批量错误隔离：完全重复的同产品/平台/URL 行直接跳过；同一产品同一平台存在不同 URL 时跳过该产品并记录冲突。产品未找到或平台不存在记为 `skipped`；保存、会话等执行错误记为 `failed`。每个产品最多检查 3 个前台候选页并受总时限约束，单项异常后继续下一个产品。

临时验证优先使用 `wtb-roundtrip-test`。若接口报告恢复失败，立即调用 `wtb-restore` 恢复保存的原值，并确认 `backendCheck.status === "passed"`。

## 产品与资料

| 方法 | 路径 | 状态 |
| --- | --- | --- |
| POST | `/api/product-replacement/detail` | 单产品 Detail 只读 |
| POST | `/api/product-replacement/details` | 最多 50 个产品批量只读 |
| POST | `/api/detail-address-replacement/preview` | 读取多个产品 PC Details，返回旧地址命中路径和次数 |
| POST | `/api/detail-address-replacement/submit` | 精确替换命中地址，保存后逐产品回读 |
| GET | `/api/detail-address-replacement/template` | 下载“临时功能”六列表格模板 |
| POST | `/api/specification/preview` | 预览，不提交 |
| POST | `/api/specification/submit` | 写产品后台 |
| POST | `/api/product-publishing/preview` | 在目标站读取国际产品复制源并预览上架，不提交 |
| POST | `/api/product-publishing/submit` | 在单个目标站复制产品、更新资料并回读 |
| POST | `/api/product-publishing/batch-preview` | 多产品、逐目标站预览上架，不提交 |
| POST | `/api/product-publishing/batch-submit` | 多产品、逐目标站执行上架并回读 |

产品上架写入 Detail → Specification 时，表格行取目标站对应的工作簿译文列，顶部 Specification 标题按站点代码自动使用本地化译文；未知站点回退到工作簿标题。
| POST | `/api/language-package/upload` | 上传语言包 |
| POST | `/api/ecadmin/run` | 按所选动作处理/上传资料 |
| POST | `/api/assets/upload-image` | 上传图片 |

产品 Detail 读取只返回 PC `Overview` 和名称严格匹配 `Specifications` 的自定义字段。字段不存在时记录单项失败，不回退到其他 Detail 字段。

Detail 内容操作递归处理 `vm.pcView` 的字符串值，适用于 Overview、自定义 Specifications 等 PC Details 内容。`operation: "replace"` 精确替换完整 HTTP/HTTPS 地址；`operation: "delete"` 精确删除 `targetText` 指定的完整代码块（替换为空字符串）。先调用 `preview`；输入未变化且存在命中时才能调用 `submit`。无命中不保存，提交后必须回读并确认目标内容剩余为 0。它不修改 Mobile Details 或其他产品标签。

“临时功能”优先从 `.xlsx/.xls` 导入。读取第一个工作表，表头固定为：`Product_Name`、`Old_Address_1`、`New_Address_1`、`Old_Address_2`、`New_Address_2`、`Delete_Code_Block`。每行对应一个产品，最多两组完整地址替换，并可同时删除一个代码块；空操作跳过，每行至少一项操作，产品名不得重复，一次最多 50 个产品。每个产品按“删除代码块、地址 1、地址 2”的顺序计算，全部操作只保存一次，再逐项回读。优先让用户通过页面的“下载信息模板”取得标准文件。

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
