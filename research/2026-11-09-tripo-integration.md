# Tripo 接入本地无限画布研究

核查日期：2026-11-09。仅查阅官方公开文档、官方 GitHub 与本地少量接口定义；未安装、登录、读取账号/密钥、调用生成或修改项目源码。

## 会员权益：先检查可领福利

- **Studio 月度积分与 API 积分独立**，Studio 订阅不能直接用来调用 API。[官方帮助中心](https://www.tripo3d.ai/help/api-plugins/tripo-studiotripo-api)
- **目前有会员 API 赠送活动**：官方 CLI 页面称个人 Pro/Max 付费订阅每账号一次领取 **1,000 API credits**，进入与 Studio 同邮箱的 API 账户；团队为 1,000×领取时有效席位，进入 owner 的 API 账户，成员不分别领取。赠送积分不随订阅结束过期，续费/升级不再重复发放。用户具体档位、是否已领取及地区适用性未验证。[活动原页](https://studio.tripo3d.ai/cli)
- **CLI 本身仍扣 API credits，绝不扣 Studio credits**；不能把会员福利理解为会员月度积分可互通。优先查看活动资格，再决定是否需要额外充值。[同一官方活动页](https://studio.tripo3d.ai/cli)
- CLI 通过 `tripo login --region ov/cn` 打开浏览器设备授权，用户核对一次性码并授权后，CLI 自动取得凭证；不是把 key 发到聊天里，也没有证据证明必须扫码。国际/中国站需要按实际账户选择。[CLI 官方说明](https://developers.tripo3d.ai/en/docs/cli)
- CLI 能在本地执行生成、等待、下载和 GLB/自包含 GLTF 预览；浏览器画布本身不能直接执行本机 CLI，接入需要另有明确的本地桥接，不能假定项目已经有它。[CLI 说明](https://developers.tripo3d.ai/en/docs/cli)

## API 与 SDK 已确认的能力

当前官方文档主线是 **v3**：国际站 `https://openapi.tripo3d.ai/v3`，中国站为 `.com/v3`；以下不混用旧 `/v2/openapi/task` 请求格式。[API 介绍](https://developers.tripo3d.ai/en/docs/introduction)

| 能力 | 已确认的 API / 边界 |
| --- | --- |
| 文生 3D | `POST /v3/generation/text-to-model`；需要 `prompt` 和明确的 `model`。[快速开始](https://developers.tripo3d.ai/en/docs/quick-start) |
| 图生 3D | `POST /v3/generation/image-to-model`；单图输入。[官方介绍](https://developers.tripo3d.ai/en/docs/introduction) |
| 多视图生 3D | `POST /v3/generation/multiview-to-model`；同一物体的 front/left/back/right，前视必需、至少两张；并非任意多张拼成场景。[H 系列端点](https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/standard) |
| 重新贴图/PBR | `POST /v3/models/texture`；既有模型可用文字、单图或多角度参考指导纹理，参考模式互斥。[贴图端点](https://developers.tripo3d.ai/en/docs/models-texture) |
| 格式转换 | `POST /v3/models/convert`；目标列出 GLTF、FBX、USDZ、OBJ、STL、3MF；不能把全部格式都说成浏览器可直接预览。四边面输出会强制 FBX。[转换端点](https://developers.tripo3d.ai/en/docs/models-convert) |
| 自动绑定 | `POST /v3/animations/rig`；先 `rig-check` 检查兼容，骨架类别/模型版本有约束；可输出 GLB/FBX。[绑定端点](https://developers.tripo3d.ai/en/docs/animations-rig) |
| 预设动画 | `POST /v3/animations/retarget`；输入绑定后的 task_id，使用匹配骨架的预设动画；不是已证实任意文字生动画。[动画端点](https://developers.tripo3d.ai/en/docs/animations-retarget) |

官方 JS/TS SDK 为 [`@vastai/tripo-sdk`](https://github.com/Tripo-Developer/tripo-js-sdk/blob/main/README.md)，声明支持现代浏览器、Node.js 18+、ESM、TypeScript，内部使用平台 fetch，并提供 `waitForTask`、`downloadModel`。它包含自动重试/超时默认值；若实施接入，需要先按本项目规则说明这些行为，不能原样无说明引入。官方 Python SDK 为 [Tripo-Developer/tripo-python-sdk](https://github.com/Tripo-Developer/tripo-python-sdk)。

## 调用与文件链路

1. **认证**：请求头 `Authorization: Bearer {api_key}`；账号的 API Key 与 Client ID 不同。官方认证页建议不要在前端直接使用 API Key，而应通过后端代理。这与本项目现有浏览器直连原则存在架构选择，研究不能擅自增加后端。[认证文档](https://developers.tripo3d.ai/en/docs/authentication)
2. **上传**：`POST /v3/files`，`multipart/form-data` 文件，取得 `file_token`；文档写图片 JPEG/PNG 上限 20 MB、模型 GLB/GLTF/FBX/OBJ/STL 上限 150 MB。这是供应商限制，尚未设为项目本地校验规则。[文件文档](https://developers.tripo3d.ai/en/docs/files)
3. **提交**：选择文/单图/多视图端点；图片可用上传 token 或可公开读取的直链，本地 `blob:` URL 不能当远端可读取 URL。返回 `task_id`。[多视图输入规则](https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/standard)
4. **查询**：`GET /v3/tasks/{task_id}` 返回状态、进度，成功后有 `output.model_url`、可能有 `rendered_image_url`，并有 `credits_consumed` 实际花费字段。[任务查询](https://developers.tripo3d.ai/en/docs/task-query)
5. **下载**：v3 Quick Start 指导从 `model_url` 下载 GLB；当前明确写结果链接 **5 分钟失效**，应成功后立即下载本地，而非只持久化临时 URL。[v3 快速开始](https://developers.tripo3d.ai/en/docs/quick-start)
6. **旧文档冲突**：旧 [platform FAQ](https://platform.tripo3d.ai/docs/faq) 写 60 秒；新 v3 Quick Start 与 [官方 JS SDK](https://github.com/Tripo-Developer/tripo-js-sdk/blob/main/README.md) 写约 5 分钟。本报告按 v3 口径，未通过实请求验证生命周期或过期后刷新行为。
7. **计费状态**：任务创建冻结额度，成功扣费，失败/取消释放；本地等候超时不等于服务端任务取消，不应直接再次生成导致重复计费。[任务生命周期](https://developers.tripo3d.ai/en/docs/task-lifecycle)、[CLI 错误处理说明](https://developers.tripo3d.ai/en/docs/cli)

## 本地画布适配判断（源码只读，以下为推断）

- `web/src/types/canvas-plugin.ts` 已有开放节点类型、自定义 React `Content`/`Panel`、`toolbar`、`interactionToggle`、图关系访问与 `applyOps`。因此适合做独立 `tripo:model` 节点，在同一节点内承载旋转/缩放预览、生成状态、下载、当前视角转图片；无需先扩成完整 3D 场景编辑器。
- `CanvasPluginAi` 当前只有图片/视频/文本生成，`PluginModelCapability` 也无 3D。Tripo 需要独立任务适配和配置入口，不能假定 `ctx.ai` 已可调用；项目外部请求应仍集中在 `web/src/services/api/`。
- `web/src/lib/canvas/canvas-resource-references.ts` 的 `CanvasResourceKind` 仅 image/video/audio/text。3D 若要成为可连接的正式上游资源，需新增语义与消费者适配；仅输出截图则可沿用 image 资源通道。
- `web/src/lib/canvas/canvas-event-bus.ts` 的 `createPluginStorage` 已按插件命名空间封装 localforage，可作为下载模型二进制的本地持久化基础；节点记录 storage key、task id、格式/文件大小及预览信息，不能只存短时下载 URL。GLB 并非现有 `image-storage` 的图片对象，不能混用图片读取/缩略图逻辑。
- `web/src/services/image-storage.ts` 已有 `uploadImage(string | Blob)` 和图片持久化；但此方法未注入 `CanvasNodeContext`。将 3D 当前视角渲染结果可靠加入普通图片节点，需要接通宿主图片存储能力，而不只是添加一个 `blob:` 地址。
- 目前只是读取 SDK 与局部资源链路，未审计项目导出、恢复、垃圾清理或 WebDAV 对插件私有文件的覆盖。不能承诺保存工程/同步已经能携带 GLB。
- SDK 的“支持浏览器”不等于本项目跨域已通过：API 上传、轮询、模型下载 CORS、下载链接刷新、贴图外部依赖、实际预览/截图仍须实现阶段验证。

## 可落地顺序与边界

先核查会员赠送 API 积分资格；先允许 Studio/CLI 下载的 GLB 手动导入画布，可以利用已有会员产出的文件。随后做 3D 预览和当前视角转图片，再接 API 自动生成闭环；贴图、四边面、绑定与动画属于后续独立能力，未必要一次加入。

以上顺序是基于现有 SDK 的建议，不是已经实现或完成视觉验收。所有模型质量、生成费用、账号权益、CORS、持久化完整性均未在本机实测。项目源码、待办和版本记录未改变，因此无需记录为已完成产品功能。

主调查补充：已进一步读取 canvas-export.ts 与 file-storage.ts。首版宜用共享媒体 Blob 库保存 GLB，让节点通过 storageKey 引用，以进入项目 ZIP 的递归收集；插件私有库不会自动纳入导出。当前 fileExtension 未覆盖 3D MIME，会回退 .bin，实施时需补模型扩展名与导入恢复。见 [总报告](2026-11-09-five-platform-integration.md)。
