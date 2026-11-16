# 画布平台接入方式核查与选择

用途：补充本地 AI 创作画布 PRD 的接入决策，明确平台名称、CLI／MCP／API 的关系、现有代码覆盖和仍需验证的部分。本次只读取官方公开资料与本地代码，未安装工具、读取账号凭据或发起生成。

## 1. 结论

前台显示 **GPT、Gemini、可灵、即梦、RunningHub 工作流**，RunningHub 条目附工作流名称。不要用“个人通道”“共用通道”作为功能分类，也不在模型名称后固定加“我的账号／共用账号”。账号与授权管理放在设置中；需要区分费用来源时展示具体平台和计费方式。

三种接入方式不是同一层的互斥选择：CLI 是程序命令入口，MCP 是工具调用协议，HTTP API 是服务请求接口。一个 CLI 可以在内部调用 MCP 或 API；封装成 MCP 不会改变底层账号权益，也不保证新增生成能力。

| 功能入口 | 本期默认执行路径 | 可选方式及边界 | 当前项目状态 |
| --- | --- | --- | --- |
| GPT 对话 | 画布 → 本机 `canvas-agent` → Codex `app-server` | 复用已有结构化会话；模型与权限逐账号验证；不是接入 ChatGPT 网页 | 已有线程、流式事件、历史与图片输入基础；创作助手的权限收敛仍待实现 |
| GPT 生图 | 画布 → 本机连接服务 → Codex 原生图片调用 | 与聊天模型选择分开；API 备用需主动选择 | 待验收记录记载用户成功生成过图片；参考、多图等仍待验收 |
| Gemini 生图 | 画布 → 本机连接服务 → Antigravity | 当前 Gemini CLI 对话入口不能冒充生图适配；这是现有代码路径，不是对 Google 其他接入方式的排他判断 | 已有真实生图记录，参考与参数仍待验收 |
| 可灵 | 本机连接服务 → 国内官方 `@klingai/cli-cn` → 官方 MCP 服务 | 官方有 CLI／MCP；直接接 MCP 需另做认证与能力适配；开发者 REST API 是另一接入路径，不自动兜底 | 已有 CLI 适配，真实账号完整生成未验收 |
| 即梦 | 优先验证已有官方独立 `dreamina` CLI | `dreamina-canvas` 是另一种官方 CLI，涉及远端画布；不能混用两套命令和任务模型。未核实可替代现有生成链的官方独立 MCP 服务 | 现有代码只覆盖独立 CLI 的四类生成动作，首尾帧命令尚未接入 |
| RunningHub 工作流 | 本机连接服务 → 官方 Workflow API | 官方 RH CLI 存在且使用 Key；公开命令主要覆盖模型与 AI 应用。已核实的 Developer Kit MCP 只读，不提交真实生成 | 已有工作流／应用 API 适配，缺可视化配置、发布同步和真实工作流验收 |

GPT／Google 行为依据本项目 README、代码和待验收记录；不据此推断所有账号当前都有同等权限。可灵、即梦、RunningHub 的官方资料边界如下。

## 2. 可灵：CLI 是当前适合复用的入口

官方 Skill 明确 CLI 经 MCP 服务调用生成、上传和查询；国内与全球有不同包。本项目已有国内包适配，推荐保留该路径，暂不另写直接 MCP 客户端。模型／参数需按账号能力读取。来源：[官方 Skill](https://raw.githubusercontent.com/klingai-tech/skills/main/SKILL.md)。

调用链保存 `generationId`，查询后取得作品文件并归档。当前代码含文生图、参考图生图、文生视频、图生视频及尾帧参数；并不代表所有模型组合或账号已经验收。依据：`canvas-connectors/src/providers/cli.mjs`。

会员积分与 REST API 权益不能混为一谈。第二轮已通过 Craft Anything 重新捕获[官方指南](https://klingai.com/app/mcp/guide)，确认 CLI／MCP 使用个人空间付费灵感值、不支持赠送值与团队权益，提交后不能取消，结果链接有效期 24 小时。证据及本机安装缺口见[第二轮核查](platform-readiness-round2.md)，不能据此宣称实际账号生成已验收。

## 3. 即梦：两种 CLI 分开适配

本次重新读取了旧安装入口所引用的官方静态 Skill，确认仍有 `dreamina` 的 OAuth 登录、图像／视频命令、首尾帧 `frames2video`、任务 `submit_id` 查询，以及结果下载说明。文档在线不等于安装包和用户权益都已验证。来源：[官方静态 Skill](https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/SKILL.md)。

当前本地适配只允许 `text2image`、`image2image`、`text2video`、`image2video`，没有 `frames2video`；PRD 要求首尾帧模式可用，实施时必须明确补此适配或由其他已验证平台覆盖，不宣称即梦已完整支持。

新版 `dreamina-canvas` 的官方安装页和指南在此前调研中由浏览器读取，涉及即梦远端项目、节点、任务和资源。第二轮已在登录浏览器中重新观察到“短剧创作 CLI”“全能画布 CLI”和会员内测提示；尚未重新核验指南最新命令字段。来源：[官方安装入口](https://jimeng.jianying.com/ai-tool/install)、[官方画布 CLI 指南](https://bytedance.larkoffice.com/wiki/QO66wGahSiakEHkJbxIcNBtDnAc)。

接入决策：先验证已实现的独立 CLI；若不可用，再评估画布 CLI 的远端项目映射和结果归档成本。切换需要独立适配和验收，不以改可执行文件名称代替。当前未找到并核实足够的官方 MCP 执行契约，不能把第三方名为“即梦 MCP”的包当作官方会员接入。

## 4. RunningHub：Workflow API、RH CLI 与只读 MCP

### 4.1 工作流 API 是本项目主路径

官方区分 Workflow、AI App、Model 与 LLM API；消费级会员 Key 可用于工作流和应用，模型与 LLM 直接调用要求不同类型的 Key。对本项目，应检查“所选工作流 + Key 类型 + 账号权限”，而非笼统判断“有会员”。来源：[官方 API 入门与 Key 权益表](https://www.runninghub.cn/runninghub-api-doc-cn/)。

本地适配已经处理素材上传、`workflowId`／`webappId`、字段映射、提交后保存任务标识、查询和结果下载。继续沿用它最接近用户想要的“自己选择工作流、在画布中使用”，也不需要额外安装 Python CLI。接口细节必须以对应文档复核。依据：`canvas-connectors/src/providers/runninghub.mjs`。

### 4.2 有官方 RH CLI，但它不绕开 API

官网 API 页列出 RH CLI 入口；同一官方组织维护 `RH_CLI` 仓库。README 提供 `rh` 命令、Key 配置、模型调用、AI 应用调用、JSON 输出与下载，列明 Python 运行依赖。它仍是 API 客户端，不将 API 调用转换为另一套会员网页权益。来源：[官网 API 工具入口](https://www.runninghub.cn/call-api)、[RH CLI 源仓库](https://github.com/HM-RunningHub/RH_CLI)。

本次查看的命令列表有 `rh model`、`rh image`、`rh video`、`rh app`，不足以确认任意 `workflowId` 都能用相同 CLI 命令执行。CLI 适合作为后续可选封装，首期不替换已存在的 Workflow API 适配；也不引入其自动模型选择或重试默认值改变本项目行为。

### 4.3 已核实的官方 MCP 不执行生成

官方 `ComfyUI_RH_OpenAPI/developer-kit/mcp-server` README 明确当前阶段只读，用于检索、参数结构、估价、请求校验和示例构造；不调用真实 API，不实现上传、提交、任务查询或 Key 存储。因此它可帮助开发核对参数，不能作为画布的生成后端。来源：[官方 MCP README](https://raw.githubusercontent.com/HM-RunningHub/ComfyUI_RH_OpenAPI/main/developer-kit/mcp-server/README.md)。

这不是断言所有 RunningHub MCP 都只读。第三方 MCP 封装需要分别核实实现与来源，不能用包名推断官方支持；首期没有必要为手动生成再包一层 MCP。

## 5. 产品执行与助手工具分开

- 点击画布“生成”后，由本地服务按明确参数调用已选的平台适配，不让 LLM 再决定平台、模型和付费任务是否提交。
- 创作助手本期只聊天、分析图片和给出提示词建议，不因平台存在 MCP 就自动接入其生成工具。
- 以后若开放“通过聊天执行生成”，再把统一任务服务暴露为受控工具，共用同一任务身份、状态和归档逻辑；不能另建绕过画布记录的生成链。
- 设置里的接入详情可以展示 CLI、MCP、API 及版本；生成面板仍显示具体平台、模型、工作流名称。

## 6. 接入完成的证据

逐平台记录来源、工具版本与系统架构、登录方式、账号能力、实际测试动作、参数支持、任务标识、查询方式、原始文件下载与重开恢复结果。状态分为：官方文档已核实、代码已有、实账号已验证；不得互相替代。

本次确认的是上述资料和本期默认接入方向，没有证明任何新账号已连接或生成可用。Liblib／Tripo 为后续范围，本次未重新核查，不扩充首期平台。
