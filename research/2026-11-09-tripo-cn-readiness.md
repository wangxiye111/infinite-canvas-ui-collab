# Tripo 国内站接入就绪核查

核查日期：2026-11-09。用户现状：国内站 `.com` 网页/App 会员，API 未开通。本次仅查公开官方页面；未安装、登录、读取凭证或调用 API。

## 已确认

- 国内开发者平台为 [developers.tripo3d.com](https://developers.tripo3d.com/zh)，国内 API 基址是 `https://openapi.tripo3d.com/v3`，使用 Bearer API Key。[国内 API 介绍](https://developers.tripo3d.com/zh/docs/introduction)
- 国内 API 密钥入口是 [控制台 API 密钥页](https://developers.tripo3d.com/zh/keys)，官方流程是登录开发者控制台→API 密钥→创建密钥。[国内认证说明](https://developers.tripo3d.com/zh/docs/authentication)
- **国内 CLI 支持已确认**：国内官方 CLI 文档直接写 `tripo login --region cn`，不是 `ov`。浏览器打开所选站点设备授权页面，用户核对一次性验证码并确认后，CLI 自动接收 Key；没有 API 账户则先在授权页面注册。[国内 CLI 文档](https://developers.tripo3d.com/zh/docs/cli)
- 国内 CLI 文档说明 `tripo doctor` 检查 API 连接和积分余额，余额为零只是警告；提交计费任务前需足够积分，`tripo topup` 打开充值页。由此可确认安装/登录 CLI 与有可用 API 额度是两回事。[同一国内 CLI 文档](https://developers.tripo3d.com/zh/docs/cli)
- 国内 API 有独立的余额、冻结积分与用量接口，成功任务扣费，失败或取消退回冻结积分。[国内计费说明](https://developers.tripo3d.com/zh/docs/billing)

## 未确认，必须保留边界

- **没有取得国内 Studio 会员同样可领 1,000 API 积分的官方证据。** 本次查到的 `.com` CLI、计费、首页都不足以证明此福利适用于国内账户；国际站活动不得直接套用。
- `https://studio.tripo3d.com/cli` 在检索工具中无法访问；按 `site:studio.tripo3d.com`、`site:developers.tripo3d.com` 检索会员/API 赠额也未得到对应活动规则。这意味着“未确认”，不等于“国内没有活动”。
- 国内 [首页 FAQ](https://developers.tripo3d.com/zh) 列出“订阅了 Tripo Studio，能直接使用 API 服务吗？”问题，但当前可读取内容未展开答案；不能用该标题单独证明积分互通或福利存在。
- 未验证用户的会员级别、国内 API 是否已存在同身份账户、余额、试用额度、福利领取状态或充值要求；也未验证国际站赠额能否跨区使用。

## 对当前方案的影响

可以确定国内站有正规 API/CLI 路径；**不能把现有网页/App 会员视为自动化 API 已就绪**，也不能承诺可用 1,000 赠额启动。若先利用已购会员，优先保持“国内 Studio 生成/导出模型→本地画布导入/预览”路径；自动生成集成应等国内 API 身份与实际额度明确后再开展。

后续只需用户在国内开发者控制台查看账户/额度或向 [国内官方支持](https://developers.tripo3d.com/zh/support) 核实会员福利，无需发送 API Key。本文不代替用户执行注册、授权、领取或充值。
