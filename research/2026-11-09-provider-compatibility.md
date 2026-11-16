# RunningHub 与即梦兼容性核查

基线：当前本地 `854bd86d` / v0.20.0。仅只读源码，没有读取配置或凭据，没有运行 CLI、调用生成或移植功能。

## 结论

用户记得没错：原 Python 画布有 RunningHub 专用 OpenAPI 接入及 dreamina 即梦 CLI 后端。当前替换上的 React 项目没有这些专用适配。这不是只缺 API Key，而是两个项目的能力不同，旧适配尚未迁入。

| 当前新版能力 | 核实结果 |
|---|---|
| 内置接口格式 | `ApiCallFormat` 仅 `openai / gemini`；不能将 RunningHub 地址/Key 填进默认 OpenAI 请求后即承诺可用。 |
| 自定义模型调用脚本 | 真实存在并已接入模型行编辑与生成路径；可为非标准 HTTP API 写适配，但没有现成 RunningHub 实现或本次实测。 |
| 浏览器请求扩展 | `request` 可自定义方法、URL、headers、body；注入 http/poll/signal；已有 local proxy 可转发跨域请求。 |
| 本机 CLI | 脚本在浏览器用 new Function 执行，不含 shell/child_process；即梦 CLI 需要本地服务桥接。 |
| Canvas Agent | 连接 Codex / Claude 对话与画布 MCP；启动它不会自动补回即梦 CLI provider 或 RunningHub 专用 API。 |

## 当前新版证据

- [接口类型与渠道模型](<[local path omitted] coding/canvas/web/src/stores/use-config-store.ts:8>)。
- [模型行脚本入口](<[local path omitted] coding/canvas/web/src/components/layout/channel-editor-drawer.tsx:105>)，其 119 行接 ModelScriptEditor 并保存 script。
- [图像脚本执行分支](<[local path omitted] coding/canvas/web/src/services/api/image.ts:694>)。
- [自定义请求](<[local path omitted] coding/canvas/web/src/services/api/model-plugin.ts:68>)、[轮询](<[local path omitted] coding/canvas/web/src/services/api/model-plugin.ts:94>)、[脚本执行与注入变量](<[local path omitted] coding/canvas/web/src/services/api/model-plugin.ts:113>)。
- [本地代理只是请求转发](<[local path omitted] coding/canvas/web/src/stores/use-config-store.ts:500>)。
- [Canvas Agent 用途](<[local path omitted] coding/canvas/canvas-agent/README.md:3>)、[Codex turn 路由](<[local path omitted] coding/canvas/canvas-agent/src/server/http.ts:292>)、[Claude turn 路由](<[local path omitted] coding/canvas/canvas-agent/src/server/http.ts:423>)。
- 对 web/src、canvas-agent/src、docs、README 的 RunningHub / jimeng / dreamina 搜索无匹配。结合接口类型和调用路径，可以判断没有内置专用适配；这不证明任意第三方插件或用户另写脚本不存在。

## 旧版保留的能力

以下由主调查者在完整旧备份核实：

- [run_jimeng_cli](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:6063>)：asyncio.create_subprocess_exec 执行 dreamina。
- [即梦图像](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:6618>)、[即梦视频](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:6689>)。
- [RunningHub 专用路由](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:12621>)：app-info、submit、workflow-submit、workflow-info、query、upload-asset。
- [即梦状态、登录、积分路由](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:13095>)。

旧代码保留不等于当前登录态、依赖和远端接口已验证；本次没有运行生成。

## 迁入新版需要的工作

1. RunningHub：编写 HTTP adapter 或模型脚本，处理素材上传、模型/AI 应用/工作流提交、参数绑定、查询及结果入库。现有 local proxy 可以解决部分跨域问题，但不转换 API 协议。
2. 即梦 CLI：保留或抽取旧 Python 执行层为本地受控桥接，再连接新前端的任务状态和结果。浏览器调用脚本不能直接代替该进程层。
3. 断线恢复、服务端取消和多种参考输入需要单独验收，不能以一次 HTTP 成功代替。

特别限制：当前自定义视频脚本等待最终结果后才返回；结果存内存 Map，后续 poll 对 plugin 只查 Map，不存在则报告过期。因此“自定义脚本可请求 API”不等于“已有专用任务的刷新恢复能力”。见 [video.ts](<[local path omitted] coding/canvas/web/src/services/api/video.ts:82>)。

本次未改产品源码、todo 或 pending-test；功能和待办未变化，无需更新。
