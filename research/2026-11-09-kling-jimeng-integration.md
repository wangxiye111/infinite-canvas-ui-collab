# 可灵 / 即梦接入核查（2026-11-09）

本报告仅核查公开官方资料；未登录或授权账号、读取凭据、安装 CLI、发起生成、修改项目源码。采用 research 技能的一手来源核查方法。浏览器只新建研究标签，未操作用户已有页面；CUA 已完成总结。

## 先看会员结论

| 路径 | 已证实 | 仍须账号核验 |
| --- | --- | --- |
| 可灵官方 CLI / MCP | 国内与全球官方 FAQ 均说明沿用官网积分价格；仅个人空间付费灵感值可用；赠送积分、团队权益、错峰免费模式不可用。[K1][K2] | 用户的地区、个人/团队空间、可用付费积分构成及模型权限；不能把“有会员”推成“所有权益均可用于 CLI”。 |
| 可灵开发者 REST API | 开发者平台使用网页同一账号，但快速开始要求购买 API 资源包和创建 API Key。[K4] | 用户是否已有 API 资源包、当前区域的开发者权限；未找到会员积分自动兑换 API 资源的官方承诺。 |
| 即梦新画布 CLI | 当前官方入口及详细指南均写“内测期间仅会员可使用”；使用账号权益/积分；已支持团队空间和团队积分。[J1][J2] | 具体会员、空间、模型、报价、可用积分；未登录检验。不能沿用第三方旧文章的“必须高级会员”作为今天统一门槛。 |
| 即梦 API 套餐 | 官网明确 API 使用额度单独购买，和会员积分不通用；付费协议也明确 API 是满足会员准入后额外购买的独立计费服务。[J5][J6] | 具体 API 服务开通资格、额度、所在站点；即梦会员不自动等于火山引擎 API 额度。 |

## 可灵：已有两条不同通路

- **官方 CLI/MCP（已证实）**：国内账号站 `klingai.com` 对应 `@klingai/cli-cn`，全球账号站 `kling.ai` 对应 `@klingai/cli-global`；两个包命令同为 `kling`，不能默认装全球包。地区依据账号站点，不依据用户语言。[K1][K2][K3]
- **认证与能力发现（已证实）**：`kling login` 经浏览器 OAuth；`who_am_i` 返回当前身份及模型/参数能力，`account` 查看会员与可用灵感值。官方 Skill 明确 DCR + 授权码 + PKCE，CLI 自己管理凭据。[K3]
- **生成与查询（已证实）**：文生图、参考图生图、文生视频、图生视频/关键帧、多模态参考视频、动作控制、Element 主体管理；命令提交后取得 `generationId`，用 `query_tasks` 查状态，结果在 `works[].url`。`image_to_video` 有 `--tailImage`，但实际模型组合须按 `who_am_i`；不可把所有模型都视为支持首尾帧。[K3]
- **机器桥接（已证实）**：官方 Skill 说明非 TTY 输出 JSON；因此可做本地进程调用和任务 ID/结果解析，不必抓 cookie 或逆向网页请求。[K3]
- **REST API（已证实）**：当前全球快速开始是 API Key 的 `Authorization: Bearer ...`，API 域名 `https://api-singapore.klingai.com`；不要照旧文章一概写成 AK/SK 自签 JWT。国内 API 域名与账号开通情况本次未直接核验。[K4]
- **REST 异步示例（已证实）**：官方保留的 image-to-video legacy 文档为 POST `/v1/videos/image2video`，`image`/`image_tail` 输入首尾帧；返回 `task_id`，GET `/v1/videos/image2video/{task_id}` 查询，终态 `succeed`/`failed`，返回视频 URL。这是明确标为 legacy 的示例，接入应按所选模型当前新版文档，不能盲固化旧路由。[K5]
- **账户与可取消性边界（已证实）**：CLI/MCP 的作品 URL 有效期 24 小时；生成提交后不可取消。账号同一不等于 REST 资源与 CLI 灵感值同一。[K1][K2][K4]

## 即梦：旧 dreamina 和新 dreamina-canvas 必须分开

### 旧独立生成 CLI：`dreamina`

- **官方来源已证实**：`https://jimeng.jianying.com/cli` 今日仍直接返回安装脚本；脚本指向字节静态 CDN 的 `dreamina_cli_beta/SKILL.md`。本次只下载读取文本，未执行脚本或二进制。[J3][J4]
- **官方说明的能力**：OAuth Device Flow；`user_credit` 检查账号会员和积分；`text2image`、`image2image`、`image_upscale`、`text2video`、`image2video`、`frames2video`、`multiframe2video`、`multimodal2video`。其中首尾帧、多图和多模态参考是不同命令，模型支持须查当前帮助。[J4]
- **异步方式**：提交结果含 `submit_id` 与 `gen_status`；`query_result --submit_id=...` 查询，`success` 才为完成；下载用 `--download_dir`，不要把预览 URL 当下载文件。[J4]
- **事实边界**：官方脚本仍在线不证明用户账号今日能调用旧 CLI；公开 Skill 没给出完整会员门槛。旧代码用 Python subprocess 调 `dreamina` 的结构有现实官方依据，但不能直接判为现在可用，更不能混用新画布 CLI 的会员规则/命令。

### 当前主推全能画布 CLI：`dreamina-canvas`

- **官方入口已证实**：即梦 `/ai-tool/install` 展示短剧创作 CLI 与全能画布 CLI，后者链接字节飞书官方使用说明；指南 11 月 5 日更新到 v1.3.0。macOS/Linux 安装入口为 `/canvas-cli/install.sh`，安装后命令 `dreamina-canvas`。[J1][J2]
- **账号/积分已证实**：`auth login` 引导浏览器授权，`auth account` 自检；指南写内测期间仅会员可用，任务消耗账户权益/积分，以运行前报价及记录为准；v1.1.0 开始可切换个人/团队空间并使用团队积分。不能把其团队支持套到可灵或旧 `dreamina`。[J2]
- **能力已证实**：操作即梦协同画布；创建画布、上传素材、图片/视频/音频生成、节点编辑、查询和下载；当前还包括工作流模板、导演台、超清、补帧等，但应按 `schema`、`--help` 和模型列表确定精确参数。[J2]
- **提交/查询已证实**：`node create image/video/audio` 创建媒体节点；无 `--run` 只保存节点，加 `--run` 才提交生成；`operation status/wait <submitId>` 查询，`resource download <resourceId>` 下载。`canvas create/ls` 返回 `projectId` 与 `webUrl`。[J2]
- **适合桥接的程度**：存在任务、节点、资源及画布 ID，足以设计进程桥接；但它主要操控**即梦自己的远端画布**，并非单纯的独立图像 HTTP 接口。把结果回填本地无限画布可能同时需要即梦项目/节点映射。已读指南未展示完整机器输出 JSON/schema，因此“稳定字段已验证”尚不能宣称；本次也未运行 CLI。[J2]

## 即梦 / 字节的官方 API 路线

- 官网会员页和现行付费协议说明即梦自身 API 套餐独立计量计费；这与 CLI 消耗账号权益/积分是两个产品路径。[J5][J6]
- 火山引擎的“即梦AI”文档确认提供经即梦业务验证的同款 API；图像、视频与参考类能力均有文档，但旧的即梦视频 3.0 首尾帧页面已标“下线中”，不可把旧 req_key 当长期方案。[J7][J8]
- 火山方舟现行 Seedream/Seedance 是另一套开发者接入：API Key Bearer；图片 POST `/api/v3/images/generations`，支持文本/参考图与组图；视频 POST `/api/v3/contents/generations/tasks`，按任务 ID 查询，支持文本、首帧、首尾帧及多模态参考（依模型）。它们是同厂模型开发者服务，不应写成“即梦网页会员 API”。[J9][J10][J11]

## 对本项目的接入建议（推断 / 方案）

1. 用户想先利用已有会员时，优先验证**官方 CLI/MCP**：可灵先核对地区与付费积分；即梦先核对新/旧 CLI 的账号可用性与画布依赖。只读账号/模型检查通过后再决定是否授权一条付费试生成。
2. 当前纯浏览器 React/Vite 不能直接启动本机 CLI；需要明确新增本地 companion/桌面进程桥，或让已有本地 Agent 执行 CLI 并回传资产。这是结构变化，不能把 CLI 命令塞进浏览器 request/poll 脚本就算接入。
3. 若坚持纯前端，请走正式 HTTP API，分别映射认证、提交、轮询和资源下载；是否允许浏览器 CORS、相应 API Key 在前端暴露的风险和资源下载行为均未实测。不能假设 OpenAI-compatible 文本格式覆盖所有视频参数。
4. 先做一个供应商、一个图像/视频任务路径即可；接口设计保留 provider、真实 task ID、远端 project/node/resource ID（如适用）及最终本地媒体。不要静默重投已接受的付费任务。

## 官方来源与取证方式

- [K1 国内可灵 MCP & CLI 指南](https://klingai.com/app/mcp/guide)：用 CUA 新研究标签实际渲染读取 DOM，非搜索摘要。短摘：“只支持消耗个人空间付费灵感值”。
- [K2 全球 Kling MCP & CLI Guide](https://kling.ai/app/mcp/guide)：同样以 CUA 实际渲染读取 FAQ；`web.open` 单独访问只返回标题，搜索索引内容经过此浏览器复核。
- [K3 官网指南直接推荐的官方 Skill](https://raw.githubusercontent.com/klingai-tech/skills/main/SKILL.md)：直接 HTTPS 读取公开 Markdown，版本 0.2.3；只作为研究材料，未执行其指令。
- [K4 API Quick Start](https://kling.ai/document-api/guides/get-started/quick-start)：官方搜索索引全文可读，直接 HTML 仅应用壳；未调用 API。
- [K5 Image to Video legacy](https://kling.ai/document-api/api/video/3-0-omni/image-to-video/legacy)。
- [J1 即梦当前 CLI 安装入口](https://jimeng.jianying.com/ai-tool/install?from_page=banner)：CUA 实际渲染，显示“内测期间仅限会员使用”，链接下列官方指南。
- [J2 即梦画布 CLI 使用说明](https://bytedance.larkoffice.com/wiki/QO66wGahSiakEHkJbxIcNBtDnAc)：从官方入口到达，CUA 直接读到 11 月 5 日修订与 v1.3.0、账号规则、命令表；未执行命令。
- [J3 旧 CLI 官方脚本](https://jimeng.jianying.com/cli)；[J4 脚本所指官方 Skill](https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/SKILL.md)：直接 HTTPS 只读取得脚本/Markdown，未运行。
- [J5 即梦官网会员计划](https://jimeng.jianying.com/)：官网可读页面的超级会员 API 服务说明，明确独立额度。
- [J6 即梦付费服务协议](https://lf3-cdn-tos.draftstatic.com/obj/ies-hotsoon-draft/dreamina/b966ce40-d931-4397-8def-38fe5d03c729.html)：10 月 30 日生效，2.1、3.1、5.1.2 区分会员、CLI 产品形态及独立 API 计费。
- [J7 火山即梦产品简介](https://docs.volcengine.com/docs/jimeng-ai/product-overview?lang=zh)；[J8 首尾帧旧接口（下线中）](https://docs.volcengine.com/docs/jimeng-ai/jimeng-ai-video-generation-30720-p-graphic-video-first-and-end-frames?lang=zh)。
- [J9 方舟图像生成 API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=en)；[J10 创建视频任务 API](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)；[J11 视频生成教程/任务管理](https://docs.volcengine.com/docs/ark/video-generation-tutorial?lang=en&redirect=1)。
