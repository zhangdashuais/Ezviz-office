# EZVIZ 官网巡查

此目录用于集中存放 EZVIZ 官网巡查相关功能。

计划包含：

- 站点与巡查规则配置
- Banner / Popup 页面巡查
- 链接可达性与 HTTP 状态检查
- 内部链接 UTM 校验
- 巡查结果与问题报告处理
- 后续定时巡查入口

当前已加入产品标语语种巡查：

- 标语选择器：`.site-product-desc.J_SiteProductDesc`
- 站点地区入口：`.yf.yf-shop-region`
- 优先使用页面 `<html lang>` 判断站点语种，缺失时使用 URL 国家/地区段
- 短文本证据不足时标记为 `unknown`，不直接报错
- 仅将高置信度、明显与站点语种不一致的标语加入问题清单

产品详情页巡查（当前随机/定时巡查范围）：

- 从 `.site-product-btns-link.J_SiteProductDetailLink` 进入详情页
- 检查产品详情页能否打开、Detail 正文是否存在
- 检查产品标语是否存在
- 检查产品标语语言是否与站点一致
- 检查 Detail 正文语言是否与站点一致
- 不检查 Support、Datasheet、图片、导航菜单或页面内链接

随机多站点任务：

- 从 `/choose-country-region` 动态发现站点
- 从每个站点导航读取 Security Cameras 与 Smart Home 分类
- 每个站点从两个分类中随机抽取 5 个不重复产品
- 对每个产品只执行标语与 Detail 存在性、语种一致性巡查
- 通过后台异步任务持续返回进度和问题清单

现有巡查逻辑暂未迁移，仍由 `server.js` 中的 Campaign Audit 流程调用外部 `Website-backend/website-audit` 脚本。
