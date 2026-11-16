# 五个平台接入当前画布：可行性与建议

这是公开官方资料和本地源码的可行性研究，不是已完成集成。当前画布基线为 wangxiye111/infinite-canvas v0.20.0，提交 854bd86d。没有登录用户账号、读取密钥、安装平台 CLI、领取福利或发起生成。

## 结论

可灵、即梦、RunningHub、Tripo、Liblib 都存在官方程序化接入路径。应按账号地区、产品与权益选择 API / 官方 CLI；“有会员”不能一律理解为“API 已含在会员内”。

建议采用 **官方会员通道与 API 混合接入**：可灵与即梦优先核查官方 CLI，RunningHub 优先会员 API 工作流，Tripo 使用 API/CLI 的 API 积分，Liblib.art 使用独立 API 服务；若用户指 LibTV，则单独核查 OAuth MCP 路线。整个方案继续使用现有画布，不再次更换底层项目。

## 平台与权益

| 平台 | 官方接入路径 | 可纳入画布的范围 | 会员相关结论 |
|---|---|---|---|
| 可灵 / Kling | 官方 CLI / MCP；另有开放平台 API | 文/图生图、文/图生视频、混合参考、主体与动作控制，模型和参数按实时能力发现 | 官方 MCP/CLI FAQ：当前仅个人空间付费灵感值/paid credits；赠送积分、团队及错峰免费等权益不能泛化为可用。国内/国际使用不同包。API 资源包是另一条路线 |
| 即梦 | 官方画布 CLI dreamina-canvas；旧 dreamina CLI 官方入口仍在线；另有 API | 生成任务和素材结果；新版的画布/工作区命令需要与旧版单独适配 | 新版 CLI 官方文档处于会员内测，并有团队空间/积分说明；旧 CLI 也可查询会员与积分。不能把 API 额度独立计费规则直接套到 CLI |
| RunningHub | 会员 API Key、企业共享 Key；官方 RH_CLI 仍使用 Key | AI 应用、ComfyUI 工作流；模型 API 权限另分 | 会员 Key 可调用应用/工作流、消耗 RH 币，与网页共享并发；直接模型 API/LLM 需企业共享 Key。不是拥有会员就能用所有 API 类型 |
| Tripo | 官方 v3 API 或 Tripo CLI | 文/图/多视图生 3D、模型文件下载；后续可加贴图、转换、绑定/预设动画 | Studio 与 API 积分独立，CLI 也扣 API 积分。国际站存在 1,000 API credits 活动，但用户已确认使用国内 .com，尚无明确证据证明该活动适用其账号 |
| Liblib.art | 官方 API（AK/SK 签名） | 生图、模板及 ComfyUI 工作流 | 官网明确 API 与网页生图/会员积分是两套体系；需单独核查 API 开通和余额 |
| 如果所指为 LibTV | 官方 Remote MCP + OAuth | 可作为另一种内容创作接入，具体工具须授权后读取 | 这是与 Liblib.art API 不同的产品路径；未找到足够证据证明它与 Liblib.art 会员额度互通 |

一手来源：

- 可灵：[国内 MCP/CLI 指南](https://klingai.com/app/mcp/guide)、[国际指南](https://kling.ai/app/mcp/guide)、[官方 CLI 技能文档](https://github.com/klingai-tech/skills/blob/main/SKILL.md)。指南动态内容通过独立浏览器渲染核实；仅研究其官方能力说明，未安装或调用。
- 即梦：[旧官方 CLI 入口](https://jimeng.jianying.com/cli)、[官方画布 CLI 说明](https://bytedance.larkoffice.com/wiki/QO66wGahSiakEHkJbxIcNBtDnAc)。新旧 CLI 的命令、认证与任务格式不得混用。dreamina-canvas 主要操作即梦自己的云端画布：需映射 projectId、node、submitId、resourceId，再下载结果回到本地画布；完整机器输出仍待运行核验，详细证据见分报告。
- RunningHub：[API 文档](https://www.runninghub.cn/runninghub-api-doc-cn/)、[会员 API 页](https://www.runninghub.ai/enterprise-api/consumerApi)、[官方 RH_CLI](https://github.com/HM-RunningHub/RH_CLI)。官网公开 HTML 链接 HM-RunningHub 组织，可核查来源关系。
- Tripo：[Studio/API 权益说明](https://www.tripo3d.ai/help/api-plugins/tripo-studiotripo-api)、[会员 API 积分活动](https://studio.tripo3d.ai/cli)、[CLI 文档](https://developers.tripo3d.ai/en/docs/cli)、[v3 快速开始](https://developers.tripo3d.ai/en/docs/quick-start)。
- Liblib：[官方 API 页](https://www.liblib.art/apis)；[LibTV 官方插件目录](https://github.com/liblib-ai/marketplace)，由 liblib.tv 官网链接，采用原生 HTTP Remote MCP 与用户 OAuth。

这张表描述官方公开条件；尚未验证本用户的账号站点、会员档位、灰度资格、实际余额和授权范围。优惠会变化，不能将调研时活动视为长期套餐。

## 画布中建议怎样使用

1. **平台连接**：每个平台保存一个明确的账号连接，显示所属站点、接入方式、授权状态和已知的额度来源；API Key 由用户在本地设置，CLI 走官方账号授权。余额仅在平台有相应接口时展示。
2. **项目预设**：把常用模型、AI 应用或工作流保存为可命名的预设，例如“产品参考图”“镜头视频”“去背景”“图生 3D”。预设保存平台连接、模型/应用/工作流 ID、参数与输入槽位，不保存明文密钥。
3. **节点调用**：选中图片/文字/视频 → 选择平台与预设 → 填该能力需要的参数 → 提交。切平台后按新模型支持范围展示字段，不能把一个平台的视频参数原样发给另一个。
4. **任务与结果**：节点显示排队/运行/失败/成功；任务中心保留平台任务 ID 和来源，刷新后继续查询；新即梦 CLI 还需保存远端画布/节点/资源映射。生成结果加入当前画布并连回输入，保留提示词、模型、参数和实际返回的用量信息。
5. **3D 节点**：Tripo 输出保存为模型资产，在画布里旋转查看、下载 GLB、截当前视角为图片；截图可以继续接图片/视频平台。完整 GLB 上游语义、骨骼/动画处理另分能力，不能当作已有功能。

“调用不同项目”在这里先按 **切换保存的生成预设/应用/工作流** 理解。远端平台网页中的全部历史项目、草稿和资产自动同步尚未核实，不能承诺登录后自动导入所有内容。

## 接入方式的取舍

| 方式 | 适合情况 | 本项目判断 |
|---|---|---|
| 全部用 API | 已分别开通 API，希望统一服务端调用 | 能实现，但可能额外购买额度，且无法直接利用一些会员 CLI 通道 |
| 官方 CLI + API 混合 | 用户已经持有多个会员，希望复用现有权益 | 推荐。需要一个明确的本地连接服务，让浏览器调用 CLI、做签名和长期任务管理 |
| 通过同一聚合平台调用所有模型 | 接入数量少，统一扣费来源 | 可作为某些任务的备选；不会消耗用户在其他平台的会员余额，不宜冒充这些平台的账号直连 |

图像/视频的前端请求仍可集中放在现有 web/src/services/api/。新增本地连接服务是此建议中明确的架构变化：当前前端并没有这样的通用平台后端。它可以复用仓库现有本地服务的连接与授权设计，但平台任务不应被绑定为必须启动一次 Codex/Claude 对话。具体复用或独立进程应在实施设计中决定。

本地连接层负责官方 CLI 子进程、API 签名、账号连接、任务记录及结果下载。CLI 应使用固定命令与参数数组，不把用户 prompt 拼成任意 shell。密钥和登录态不进入画布项目 ZIP。当前旧 Python 备份可复用 RunningHub 与 dreamina 的业务经验，但需对照现行官方协议；不会直接将整份旧后端挂回新项目就宣称兼容。

## 当前源码已有的基础与缺口

| 已有基础 | 仍需补齐 |
|---|---|
| [渠道配置与模型脚本](../web/src/stores/use-config-store.ts)、[request/poll 脚本执行](../web/src/services/api/model-plugin.ts) | 渠道目前仅 openai/gemini 格式；需要五平台的明确适配、账号站点和能力发现 |
| [图像/视频/音频/文本节点](../web/src/types/canvas.ts) | 任务 ID 与平台元数据统一记录；现有视频自定义脚本结果在内存 Map，不能满足可靠刷新恢复 |
| [节点插件 Content/Panel/toolbar](../web/src/types/canvas-plugin.ts) | Tripo 3D 预览及模型任务；现有 ai 注入没有 generate3D |
| [媒体 Blob 存储](../web/src/services/file-storage.ts) | 可优先复用共享媒体库保存 GLB；补 MIME/扩展名、加载、下载、引用和清理 |
| [项目 ZIP 导出](../web/src/lib/canvas/canvas-export.ts) | 递归识别 storageKey；模型文件必须纳入同一资源收集链路。任意插件私有库不会自动打入 ZIP，目前未知 MIME 会回退 .bin |
| [上游资源类型](../web/src/lib/canvas/canvas-resource-references.ts) | 只有 image/video/audio/text；3D 本体成为上游资源需扩展类型与消费者。第一步可以输出普通图片截图 |

可灵 CLI 的模型与参数由服务端动态声明，应读取实际能力而不是永久硬编码名单。Tripo v3 当前文档写模型 URL 约 5 分钟失效，应及时保存文件，不能只保存临时链接。其他平台也应按各自资产保留规则处理。

## 交付顺序和验收建议

建议分成三个可独立验证的部分：

1. **平台连接与任务基础**：账号来源/连接状态、预设、任务记录、结果入库；先恢复 RunningHub/即梦已有常用场景，再接可灵和 Liblib。
2. **3D 能力**：先导入与预览 GLB、截图回画布，再接 Tripo 文/图生 3D；贴图、绑定和动画作为独立动作，展示其计费来源。
3. **真实账号验收**：每个平台使用用户确认的最小任务验证，不以 mock 或页面出现图标宣称集成成功。账户/余额查询成功也不等于生成成功。

最低验收：

- 连接正确站点与账号；未授权、余额不足、权限不支持有明确反馈。
- 提交后保存真实任务 ID；断线或刷新可恢复同一任务，不重复提交产生额外计费。
- 仅在官方提供取消能力时显示服务端取消；停止本地等待与远端取消分开。可灵 CLI 指南明确提交后不可取消；RunningHub 仅已确认 ComfyUI 任务取消；Liblib.art 取消接口尚未确认。
- 输入文件以平台支持的上传/token/URL方式传递，不能向远端发送本地 blob: 地址。
- 结果真正落地为可导出的资产；平台短链过期后仍可打开。
- 平台切换保留明确来源；“可灵直连”与“RunningHub 内的可灵模型”分开显示额度来源。
- 3D 的 GLB、缩略图和截图经导出/导入后不丢失；用户最终确认预览及生成质量。

实施中需要采用的平台限流、等待和重试策略应在设计中明确，不能把某个平台或 SDK 默认值不加说明地推广到全部平台。

## 已确认的账号范围与已批准首版范围

用户已确认：

- 主要为网页/App 会员，API 服务尚未开通。
- 可灵使用国内可灵，对应国内 CLI 包，不使用全球包。
- Tripo 使用国内 .com，CLI 登录应选择 cn，API 采用国内站。
- Liblib 指 liblib.art 的生图和视频会员；不按 LibTV 账号处理。
- 本机已找到 Node/npm；当前 PATH 未找到 kling、dreamina、dreamina-canvas、tripo。这不排除它们安装在其他未配置路径。

Tripo 国内赠额尚未确认，不能把国际站活动代入用户账户。见 [国内站核查](2026-11-09-tripo-cn-readiness.md)。Liblib.art 会员仍不能直接视为 API 余额。RunningHub 需要在现有账号中启用/取得相应会员 Key，不能把 API 未开通表述为当前已连接。

用户已批准并实施的首版范围（真实账号生成待验收）：

1. 五平台连接页：国内账号来源、官方登录或 API 配置、连接状态、额度来源、可用能力；不自动充值。
2. 独立本地连接服务：承载可灵/即梦官方 CLI、API 签名、任务查询和结果落地。浏览器仍经 services/api 调用，不依赖 Codex/Claude 对话才能生成。
3. 模型/AI应用/工作流预设和统一任务记录：保存真实远端任务 ID，结果回当前画布，避免刷新后重复提交。
4. 五个平台分别实现适配；优先联调国内可灵、即梦和 RunningHub。Tripo/Liblib 在未授权或无 API 额度时保持明确待连接，不冒充可用。
5. Tripo 3D 节点先支持导入 GLB、旋转预览、下载和截图回画布；API 开通后使用同一节点接自动生成。
6. 新增功能在 codex/ 前缀开发分支准备，保持当前主版本可回退；账号授权由用户完成，付费生成验证另以明确任务执行。

这是一项包含本地服务和 3D 节点的架构改动，当前设计尚待用户确认。尚未安装客户端、修改产品源码或接通真实账号，也未提交付费任务。产品 TODO/pending-test 的实现状态未变化，无需将研究建议记录为已完成。

## 分平台证据报告

- [可灵与即梦](2026-11-09-kling-jimeng-integration.md)
- [RunningHub 与 Liblib](2026-11-09-runninghub-liblib-integration.md)
- [Tripo](2026-11-09-tripo-integration.md)

- [Tripo 国内站补充核查](2026-11-09-tripo-cn-readiness.md)
