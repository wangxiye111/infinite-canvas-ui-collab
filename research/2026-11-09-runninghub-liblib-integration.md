# RunningHub / Liblib 接入本地无限画布调研

核查日期：2026-11-09。仅使用官方公开网页、官方文档和官网链接的仓库；未登录、读取私人配置、调用生成任务、付费或修改项目源码。下文“已验证”指文档事实，不代表已验证该用户账号权限或浏览器实调。

## 先给结论

- **RunningHub 最适合先接现有会员权益**：官方现行文档允许“消费级-会员 Key”调用 AI 应用和 ComfyUI 工作流；官方会员 API 页说明从账户 RH 币扣费，网页与 API 共用并发。直接模型 API / LLM API 仅允许“企业级-共享 Key”，不能把网页会员理解为全平台 API 通行证。[Key 类型](https://www.runninghub.cn/runninghub-api-doc-cn/) · [会员 API 权益页](https://www.runninghub.ai/enterprise-api/consumerApi)
- **Liblib.art API 技术上可接，但网页会员积分不能直接抵 API 消耗**：官网明确是两套会员和积分体系。开放平台需单独领取试用积分或购买 API 积分并取得 AK/SK；是否仍有试用资格、具体资源包和余额须看账号。[官网 FAQ](https://www.liblib.art/apis) · [官方接入文档 §2.4](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d#ECMtd7rd7okpRMxzXLuc2SgYnZd)
- 两者都能覆盖“输入素材→提交云端任务→轮询→把结果放回画布”。**纯浏览器直连可行性仍需验证 CORS（提交、上传和结果文件各自验证），不能仅凭有 REST API 就承诺当前前端能直连。** 此为本项目接入判断；本次未进行账号实调。

## RunningHub：已验证的接口与范围

| 项目 | 官方事实与接入含义 |
| --- | --- |
| 能力 | 分模型 API、AI 应用 API、工作流 API 和 LLM；前三者为异步任务。消费级会员/企业共享/企业独占 Key 可调应用与工作流；模型和 LLM 仅企业共享。[开始](https://www.runninghub.cn/runninghub-api-doc-cn/) |
| 凭据 | 创建 API Key；现行接口示例使用 `Authorization: Bearer …`，部分旧风格工作流/应用接口还在 body 要求 `apiKey`，应逐接口按文档实现，不能全套套 OpenAI 请求格式。[工作流](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013) · [应用](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749010) |
| 上传 | `POST /openapi/v2/media/upload/binary`，multipart 文件 + Bearer。`download_url` 给模型 API，`fileName` 给 ComfyUI 节点；上传 URL 有效期为一天，不能把相对 `fileName` 拼成外链。[上传文档](https://rhtv.runninghub.cn/runninghub-api-doc-cn/api-425749007) |
| 工作流提交 | `POST /task/openapi/create`：`workflowId` + `nodeInfoList`；替换字段使用 `nodeId / fieldName / fieldValue`，支持 `accessPassword`。[高级工作流接口](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013) |
| AI 应用提交 | `POST /task/openapi/ai-app/run`：`webappId` + `nodeInfoList`；应用详情页提供可修改参数，返回 `taskId`。[应用接口](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749010) |
| 查询与输出 | `POST /openapi/v2/query` + `taskId`，返回 `status / errorCode / errorMessage / results[].url / outputType`。旧 `/task/openapi/status` 标记将废弃，官方接入示例说已停止维护，不宜照搬旧 Python 适配。[V2 查询](https://www.runninghub.cn/runninghub-api-doc-cn/api-425767306) · [旧状态接口](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749003) |
| 真正取消 | 文档明确提供 `POST /task/openapi/cancel`，body 为 `apiKey / taskId`，标题是“取消 ComfyUI 任务”。**只确认工作流取消接口存在**；文档未证明所有标准模型/应用任务都可取消，也未完整说明排队/运行阶段及扣费规则。[取消接口](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749015) |
| 自己的工作流 | 官方完整示例明确面向有自定义 `workflowId` 的用户，可以不打开网页执行；工作流必须已存在于 RunningHub，JSON 用于映射参数，并非任意本地 JSON 上传即可运行。[工作流完整示例](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287342) |
| 公开/私有边界 | 已发布且加密访问的应用/工作流明确可传 `accessPassword`。此次未找到足以确认“所有未发布、私有草稿均可直接 API 执行”的现行公开说明，须账号核验，不应把加密发布等同私有草稿。[更新日志](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287335) |
| 原生 ComfyUI | 官方另有云端 ComfyUI 兼容接入说明，并允许上传、收藏私有模型；这证明私有模型路径，不证明任意私有工作流状态都可执行。[官方说明](https://rhtv.runninghub.cn/runninghub-api-doc-cn/doc-8287337) |

会员具体档位、赠送币/充值币扣减优先级、企业共享钱包和会员 RH 币之间是否互转、当前个人账号并发/机器权限：**待账号核验**。现行文档让用户在 Key 页面查看调用权益对比；本次未读取该账号页面。[官方入口](https://www.runninghub.cn/runninghub-api-doc-cn/)

## Liblib.art：已验证的接口与范围

- 官方 API 文档支持平台图像/视频模型、自定义 checkpoint/LoRA/ControlNet，以及 ComfyUI 工作流。模型页面文案明确可用全站可商用模型和私有模型；可调用范围最终看版本/接口支持，不能视为网页所有按钮都有 API。[产品页](https://www.liblib.art/apis) · [官方完整文档](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d)
- **鉴权**：`AccessKey` 识别账户，`SecretKey` 用于签名；每次请求 query 含 `AccessKey / Signature / Timestamp / SignatureNonce`。签名原文是 `URI&毫秒时间戳&随机串`，HMAC-SHA1 后 Base64URL、去末尾 `=`。官方 Java/Python/Node 示例已读取；不把它误写为 Bearer。[鉴权与签名 §2.4](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d#ECMtd7rd7okpRMxzXLuc2SgYnZd)
- **上传**：先 `POST /api/generate/upload/signature`（同 AK 签名），传文件名和扩展名，取 `postUrl / key / policy / xOss…`，再向返回的 OSS 地址上传文件，并将可用图片地址传入生成参数。现行公开上传子文档写 jpg/png/jpeg、图片不超过 10M；其他格式/视频上传不能据此猜测支持。[官方文件上传文档](https://liblibai.feishu.cn/wiki/A9M2whHxsiKtu8kpIn3cZp0PnVw)
- **模型提交**：不同模型/操作使用各自 endpoint；自定义模型示例包括 `/api/generate/webui/text2img`。参数模板 `templateUuid` 与模型版本/参数需要分别保存，不能用同一个“model 名称”覆盖。[模型与参数文档](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d)
- **工作流提交**：`POST /api/generate/comfyui/app`，使用 `templateUuid` 与 `generateParams`，后者按该工作流版本详情页自动生成的 API 参数填写；不使用 RunningHub 的 `nodeInfoList` 格式。[官方 §8.1](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d#F4ZRdCTZnoB9ptxYTixcjYijnOb)
- **查询/输出**：`POST /api/generate/comfy/status` + `generateUuid`；状态包括等待、执行、已生图、审核、成功、失败；返回进度及审核通过的图片/视频。图片 URL 官方页面标注有效期 7 天，不能当永久素材地址。[官方工作流 API 页](https://www.liblib.art/apis/workflow)
- **自己的公开或私有工作流：支持，但必须先发布为可调用应用**。官方 §8.4 明确个人本地工作流需发布到平台，可选“自见”，需允许生成图片商业用途；编辑后须出现“运行应用”，平台自动试跑后详情页出现 API 参数才可调用。不是只限他人公共模板，也不是提交任意未适配 JSON 即可执行。[官方个人工作流方法](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d#G2rrdhCIHovK8VxJPhQc3E1ZnVg)
- 社区工作流需可商用、可在线运行且详情页出现 API 服务/参数；没有 API 参数的工作流暂不能调用。[官方 §8.1](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d#F4ZRdCTZnoB9ptxYTixcjYijnOb)
- **取消：未验证**。本次官方目录与所读接口没有找到服务端取消端点；应只提供“停止等待/停止轮询”，不能称“已取消云端任务”或承诺停止扣费。要真取消，需官方进一步确认。
- 文档 §2.3 写默认生成并发 5、提交 QPS 为每秒 1 次；这是平台公开默认值，实际套餐权限待查，项目不应静默另设一套超时/并发边界。[官方使用说明](https://liblibai.feishu.cn/wiki/UAMVw67NcifQHukf8fpccgS5n6d#XaF6dBdAjoeKQDxDDHXcSbcJnHf)

## 官方 CLI / MCP 补充路径

- **RunningHub RH_CLI 已存在**，官网公开 HTML 的 GitHub 入口指向 `HM-RunningHub`，该账号发布 `RH_CLI`。CLI 用 API Key，支持模型与 AI 应用，自动上传、提交、轮询、下载，输出 JSON；它并非通过网页登录把会员权益扩大到所有模型。[官网](https://www.runninghub.cn/) · [官方仓库](https://github.com/HM-RunningHub/RH_CLI)
- 对当前纯前端画布，CLI 不能直接在普通浏览器中运行；只有后续明确引入本地伴随进程时才有意义。现阶段优先适配公开 HTTP API（接入建议）。
- **LibTV 有官方 Remote MCP**：LibTV 官网公开 HTML 直接链接 `liblib-ai/marketplace.git`；仓库公布 `https://mcp.liblib.tv/mcp`，采用每位用户自己的 LibTV OAuth 登录，提供 Codex 插件。它是 LibTV 产品入口，不能与 Liblib.art 图像/工作流 API 混为一套协议。[LibTV 官网](https://www.liblib.tv/) · [官方插件仓库](https://github.com/liblib-ai/marketplace)
- **未知**：Liblib.art 会员是否覆盖 LibTV，LibTV MCP 消耗哪类积分、是否继承网页无限用权益、能否把结果直接写回本地画布。仓库 README 未给出这些计费/外部画布契约，需产品说明或账号授权后核验；不能从“Liblib API 积分独立”推出所有程序化路径都不能用会员。

## 适合当前画布的接入建议（设计判断，未实施）

1. 首期先做 RunningHub 的“AI 应用预设 + 工作流预设”，优先使用已存在会员 Key 权益；用户只选择任务并填业务参数，平台节点映射藏在预设内。直接模型 API 作为独立 Key 权限入口。
2. Liblib.art 作为第二个供应商，明确标注 API 独立计费，先选已提供 API 参数的 1–2 个工作流；“自见”发布可解决自有私有工作流接入需求。
3. 分开保存“平台连接”和“运行预设”：连接保存平台/站点/凭据类型；预设保存 `kind=model|app|workflow`、远程 ID、版本、输入字段、节点参数映射和输出类型。两家协议不强塞成一个 `model` 字符串。
4. 每个任务保存 `provider / presetId / remoteTaskId / status / outputs / error`，适配器各自处理签名、上传、提交、查询和输出。接口放 `web/src/services/api/`；跨页面任务状态放 store，业务记录和媒体沿现有 localForage 持久化。
5. 项目若保持浏览器直连，RH Key / Liblib SecretKey 都在浏览器可见；不得在共享预设、导出画布或日志中携带凭据。结果应及时下载为本地素材，避免短效 URL 失效。
6. 上线接入前的最小核验：用户实际站点/会员档位/Key 类型、目标工作流 ID 与参数、上传/提交/query/output 的 CORS、输出媒体跨域下载、工作流取消的状态与扣费语义。任何新增超时、重试和并发值按项目规则先说明并确认。

## 证据限制

- RunningHub 会员消耗/共用并发说明来自官方会员 API URL 的搜索索引正文；该 URL 当前会跳到 Key 控制台，未读登录态具体权益表。核心“会员 Key 可调应用/工作流”有现行官方开始文档直接确认。
- Liblib 官网“接口文档”链接已从官方页面公开资源核对，浏览器正常展示时由 `liblibai.feishu.cn` 跳转到 `resonate.feishu.cn`；本文仍保留官网发布的原始入口。全程只读官方公开文档。
- 没有生成/账单/CORS实测；未确定的账号权益、私有草稿权限和取消语义均未补猜。
