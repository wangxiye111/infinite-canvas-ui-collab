> 历史调研记录：下文“当前项目”指升级前的 Python 画布。该目录已完整移入备份，本文件中的旧源码链接已更新；当前部署与建议以 [升级及 ComfyArt 报告](2026-11-09-upgrade-and-comfyart-plan.md) 为准。

# 开源无限画布与 AI 媒体创作画布：一手来源调研

采集日期：2026-11-09；元数据主要于 **08:15–08:18 UTC（America/Los_Angeles 00:15–00:18 PST）** 读取。下表提交与发布的日期、时间均采用 GitHub API 的 **UTC**。星数是该采集窗口的快照，会继续变化。

## 方法与边界

- 优先使用已连接的 GitHub 工具，读取 GitHub 官方 REST API 元数据、默认分支提交列表、提交的实际变更文件、README、LICENSE 与 Releases。另做互联网新鲜检索用于发现候选；最终事实以一手来源为准。
- 热度使用 `stargazers_count` 表示**累计关注**，不等同于活跃用户、质量、最近增长或“今日最火”。本次未取得可靠的 GitHub 官方每日/每周趋势数据；官方 Trending 页面本次访问失败，因此不作趋势第一的断言。
- 维护使用**默认分支实际代码变更**作为证据，跳过仅 README、版本号和发布合并的最新提交；检查了相关提交的 files 列表。表中的“最近代码”是本次在默认分支近期提交中核实到的最新应用/运行时代码，不把 `pushed_at`、更新文案或自动打包单独当作产品开发证明。
- 最新 release 指 GitHub 发布记录，尽量同时区分稳定版与预发布。未安装、运行或付费调用任何候选；README 中的能力属于作者声明，功能可用性与视觉质量尚未验收。
- “允许开放使用”是对本次读取到的许可文本进行的工程选型分类；依赖、素材、模型服务、商标仍有各自条款。MIT / Apache-2.0 可用于改造和商用，但须履行保留声明等条件；不能将源码公开直接等同于允许自由改造和部署。

## 结论

**对白板类的累计热度，Excalidraw 是本次主表最高的候选；对用户的 AI 图片/视频工作流，优先看 Toonflow 与 basketikun/infinite-canvas 的产品组织方式，再看 BeatDesign 的资产、版本和时间线架构。** 这是按类别和当前项目适配作出的推断，不是将总星数直接用作升级方案。三者分别有现行 MIT、MIT、Apache-2.0 许可。[Excalidraw 元数据](https://api.github.com/repos/excalidraw/excalidraw) · [Toonflow README](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/README.md) · [basketikun README](https://github.com/basketikun/infinite-canvas/blob/main/README.md) · [BeatDesign 架构](https://github.com/BeatAPI/BeatDesign/blob/main/docs/ARCHITECTURE.md)

**若要更换节点交互底层，xyflow 是明确的开放许可 SDK 候选；这涉及 React / Svelte 前端改造。** 用户现有 vanilla JS 不能直接通过替换一个脚本就获得它的全部能力。**tldraw 当前 SDK 生产使用有许可要求，不能当作无条件免费开源替代品。** [xyflow README](https://github.com/xyflow/xyflow/blob/main/README.md) · [xyflow MIT](https://github.com/xyflow/xyflow/blob/main/LICENSE) · [tldraw README](https://github.com/tldraw/tldraw/blob/main/README.md) · [tldraw 许可](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)

## 八项主选：累计关注、实际维护与许可

| 项目 / 类别 | 本次 stars | 默认分支最近核实代码（UTC） | GitHub 最新 release | 开放使用边界与适配 |
| --- | ---: | --- | --- | --- |
| **[Excalidraw](https://github.com/excalidraw/excalidraw)**：白板产品 + React 编辑器组件 | **135,369**；[API](https://api.github.com/repos/excalidraw/excalidraw) | `master`，**2026-11-04 19:53**；[Mermaid 3.6 接入与解析改进](https://github.com/excalidraw/excalidraw/commit/7ded689cad49331167e29fd88b38f38d3736d576)。11-05 两次更新仅涉及文档站重定向。 | [v0.18.1](https://github.com/excalidraw/excalidraw/releases/tag/v0.18.1)，**2026-04-21 08:43**，稳定版。 | [MIT](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)。适合学框选、分组、连接、撤销、导出等白板体验；不是现成的图片/视频生成与任务编排后端。[README](https://github.com/excalidraw/excalidraw/blob/master/README.md) |
| **[AFFiNE](https://github.com/toeverything/AFFiNE)**：知识工作台，文档 + 白板 | **74,365**；[API](https://api.github.com/repos/toeverything/AFFiNE) | `canary`，**2026-11-08 17:08**；[CalDAV 发现逻辑修复](https://github.com/toeverything/AFFiNE/commit/9c316636e0cb8f1b7f180306c5934e8ec81c71b7)，包含 backend 源码。 | 最近预发布 [v2026.11.8-canary.830](https://github.com/toeverything/AFFiNE/releases/tag/v2026.11.8-canary.830)，**2026-11-08 09:02**；`releases/latest` 稳定版 [v0.27.4](https://github.com/toeverything/AFFiNE/releases/tag/v0.27.4)，**2026-08-18 16:51**。 | **混合许可**：大部分 MIT；backend / common-native 受单独条款约束，CE 部分 MPL2.0，EE 生产需要订阅。不能将整个仓库写成纯 MIT。[根许可](https://github.com/toeverything/AFFiNE/blob/canary/LICENSE) · [后端许可](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/LICENSE)。可参考文档/画布切换、内容块、工作区信息组织。[README](https://github.com/toeverything/AFFiNE/blob/canary/README.md) |
| **[tldraw](https://github.com/tldraw/tldraw)**：React 无限画布 SDK | **51,429**；[API](https://api.github.com/repos/tldraw/tldraw) | `main`，**2026-11-07 15:23**；[清理编辑工具栏状态逻辑](https://github.com/tldraw/tldraw/commit/9cc8223e2a945ea4e22868536c70f19c8d40516d)。其后当天两次提交为交互回归测试。 | [v5.6.0](https://github.com/tldraw/tldraw/releases/tag/v5.6.0)，**2026-10-28 15:01**，稳定版。 | **源码可见、SDK 为自定义许可**。许可默认仅供开发环境，生产须有效许可；不能绕过 license key。README 提到 starter kits 为 MIT，不代表它们依赖的 SDK 也为 MIT。[许可](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) · [README](https://github.com/tldraw/tldraw/blob/main/README.md)。可研究 Agent / Workflow / Chat starter 的交互思路。 |
| **[xyflow](https://github.com/xyflow/xyflow)**：React Flow / Svelte Flow 节点 SDK | **38,943**；[API](https://api.github.com/repos/xyflow/xyflow) | `main`，**2026-11-02 09:21**；[XYPanZoom 修复](https://github.com/xyflow/xyflow/commit/90a4a6d0517631e9ddb9ba12339b39df0892a9db)。之后主要为说明、合并和版本发布。 | [React 12.12.1](https://github.com/xyflow/xyflow/releases/tag/%40xyflow/react%4012.12.1)、[Svelte 1.7.1](https://github.com/xyflow/xyflow/releases/tag/%40xyflow/svelte%401.7.1)、[system 0.0.84](https://github.com/xyflow/xyflow/releases/tag/%40xyflow/system%400.0.84)，均 **2026-11-02 09:53**。 | [MIT](https://github.com/xyflow/xyflow/blob/main/LICENSE)。最接近节点/端口/连线交互的基础库；它不替用户实现任务队列、模型供应商、资产管理或 ComfyUI 后端。[README](https://github.com/xyflow/xyflow/blob/main/README.md) |
| **[Toonflow](https://github.com/HBAI-Ltd/Toonflow-app)**：AI 剧本/分镜/图片/视频创作画布 | **21,157**；[API](https://api.github.com/repos/HBAI-Ltd/Toonflow-app) | `master`，**2026-11-05 07:46**；[Windows 安装归档格式修复](https://github.com/HBAI-Ltd/Toonflow-app/commit/04fad94ed98f86c0668f47a6bd81e5d45f4774b2)，属桌面打包运行代码维护；同日最新 head 是其合并。 | [v2.0.10](https://github.com/HBAI-Ltd/Toonflow-app/releases/tag/v2.0.10)，**2026-11-05 03:20**，稳定版。 | [MIT](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/LICENSE)。主表中最贴近“持续维护 + 有关注规模 + 图片视频工作流”的成品。README 明示自选模型、本地 ComfyUI / LLM、MCP、插件；重点看文本/角色/场景/镜头节点与资产组织。运行模型需自行配置，不等于安装即可免费生成。[README](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/README.md) |
| **[basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)**：AI 图片为主的媒体创作工作台 | **10,093**；[API](https://api.github.com/repos/basketikun/infinite-canvas) | `main`，**2026-10-10 08:14**；[Gemini imageSize 参数修复](https://github.com/basketikun/infinite-canvas/commit/edbf9ec2a3aad86d207feb3bf685a5317158e665)。10-20 / 10-25 更新分别为 CHANGELOG / README，不能算持续代码更新到10月底。 | [v0.20.0](https://github.com/basketikun/infinite-canvas/releases/tag/v0.20.0)，**2026-10-10 08:47**，稳定版。 | [MIT](https://github.com/basketikun/infinite-canvas/blob/main/LICENSE)。适合看选中/上游节点上下文助手、参考图编辑、提示词库、本地 Canvas Agent/MCP、节点插件与生成记录；维护证据为约一月内代码，弱于近一周更新的候选。[README](https://github.com/basketikun/infinite-canvas/blob/main/README.md) |
| **[OpenPencil（open-pencil）](https://github.com/open-pencil/open-pencil)**：Figma 类 AI 设计编辑器 | **9,710**；[API](https://api.github.com/repos/open-pencil/open-pencil) | `master`，**2026-11-09 00:59**；[凭据存储错误提示与设置处理修复](https://github.com/open-pencil/open-pencil/commit/256ed8a66ca19b606ad2ba3550ea53d189417049)，含运行时代码；前一日还有图标导入和吸附改进。 | 预发布 [v0.17.0-beta.2](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0-beta.2)，**2026-11-04 19:49**；稳定版 [v0.16.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.16.0)，**2026-10-14 12:37**。 | [MIT](https://github.com/open-pencil/open-pencil/blob/master/LICENSE)。Figma 文件、自动布局、可编辑矢量图层、CLI / MCP / Vue SDK；适合用户 HMI/UI 设计与 Agent 共用设计模型的参考，不是主要面向视频生成的工作流成品。[README](https://github.com/open-pencil/open-pencil/blob/master/README.md) |
| **[BeatDesign](https://github.com/BeatAPI/BeatDesign)**：AI 媒体画布 + 本地剪辑时间线 + MCP | **338**；[API](https://api.github.com/repos/BeatAPI/BeatDesign) | `main`，**2026-11-04 09:14**；[语言持久化与画布/编辑工作区修复](https://github.com/BeatAPI/BeatDesign/commit/174e652451a3533c20462acb7380008428670ff6)，含画布、时间线、SQLite 源码。 | [v0.2.5](https://github.com/BeatAPI/BeatDesign/releases/tag/v0.2.5)，**2026-10-21 18:13**，稳定版。README 明确当前源码含尚未进入该包的新功能。 | [Apache-2.0](https://github.com/BeatAPI/BeatDesign/blob/main/LICENSE)。热度较小但技术参考贴合：资产与画布节点分离、Take 版本、画布转时间线、UI/MCP 共用 command kernel。默认仅内置 BeatAPI；换其他生成接口需实现 provider adapter，不能称为现成任意 OpenAI/ComfyUI 兼容。[架构](https://github.com/BeatAPI/BeatDesign/blob/main/docs/ARCHITECTURE.md) · [供应商边界](https://github.com/BeatAPI/BeatDesign/blob/main/docs/PROVIDERS.md) |

## 与用户升级有关的具体观察

1. **产品参考优先级：Toonflow → basketikun → BeatDesign。** Toonflow 的创作域模型最完整；basketikun 的图片连续迭代与上下文助手更直接；BeatDesign 展示“生成资产进入时间线”所需的数据边界。排序是依据用户当前图片/视频/LLM + ComfyUI/API 场景作出的适配推断，并非产品实测排名。用户后续已明确本次优先“界面与画布操作体验”，因此这些产品应优先用作画布交互和界面组织的参考。basketikun README 明确处于开发阶段且不保证历史数据兼容，适合借鉴，不能直接覆盖用户当前工程或据此承诺数据迁移。[Toonflow](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/README.md) · [basketikun](https://github.com/basketikun/infinite-canvas/blob/main/README.md) · [BeatDesign](https://github.com/BeatAPI/BeatDesign/blob/main/docs/ARCHITECTURE.md)
2. **画布视图与真实生成血缘应分离。** BeatDesign 说明画布连线是视觉组织，生成 lineage 单独记录；时间线片段固定引用具体 Asset，避免后续重生成把已选镜头静默替换。此模式值得用于用户的“结果多版本/比较/回溯”，无需预先决定整体迁移。[BeatDesign 架构](https://github.com/BeatAPI/BeatDesign/blob/main/docs/ARCHITECTURE.md)
3. **UI 与 Agent 应走同一组操作接口。** BeatDesign 的 UI / MCP 共用 Command Kernel；OpenPencil 把编辑器、CLI、MCP 建立在相同设计操作上；basketikun 提供本地 Canvas Agent / MCP。它们可作为命令、撤销、持久化与 Agent 变更一致性的参考，但不能仅因 README 有 MCP 就判断可靠性已获验证。[BeatDesign](https://github.com/BeatAPI/BeatDesign/blob/main/docs/ARCHITECTURE.md) · [OpenPencil](https://github.com/open-pencil/open-pencil/blob/master/README.md) · [basketikun](https://github.com/basketikun/infinite-canvas/blob/main/README.md)
4. **底层替换与功能借鉴应分别估算。** xyflow 是 React / Svelte 库；basketikun 前端使用 React，Toonflow monorepo 使用 Bun 并带 Vue Flow 补丁，OpenPencil 使用 Vue / Skia / Tauri。因此这些项目并非与 vanilla JS 前端直接互换的插件。优先借鉴数据结构/交互，再决定是否重写前端，是本次研究的工程推断。[xyflow](https://github.com/xyflow/xyflow/blob/main/README.md) · [basketikun package](https://github.com/basketikun/infinite-canvas/blob/main/web/package.json) · [Toonflow package](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/package.json) · [OpenPencil 技术栈](https://github.com/open-pencil/open-pencil/blob/master/README.md)

## 容易误判的候选与边界

| 候选 | 同窗口核实结果 | 本次处理 |
| --- | --- | --- |
| **[Jaaz](https://github.com/11cafe/jaaz)** | **6,730★**；[API](https://api.github.com/repos/11cafe/jaaz)。默认 `main` 最新提交 **2026-03-02** 仅 README；最新核实应用代码为 **2025-11-10 04:50** 的[暗色样式修复](https://github.com/11cafe/jaaz/commit/48f4b6e94e1466149f8ca5aa626d7742b4316789)。最新 [v1.0.30](https://github.com/11cafe/jaaz/releases/tag/v1.0.30) 发布于 **2025-08-09 13:58 UTC**。 | **不符合此次“持续更新的开放改造底座”目标**。现行双重许可要求改源/衍生开发、团队部署和再分发另获商业许可；个人用其生成内容可商用，不等于允许自由改其源码。[LICENSE](https://github.com/11cafe/jaaz/blob/main/LICENSE)。可了解历史产品方向，不能因名字/README 的 open-source 声明便推荐移植。 |
| **[DramaClaw](https://github.com/dramaclaw/dramaclaw)** | **7,566★**；[API](https://api.github.com/repos/dramaclaw/dramaclaw)。`main` 近代码 **2026-11-09 08:06**，[节点显示名维护](https://github.com/dramaclaw/dramaclaw/commit/2b012bab32762b63ed3ba5a85c363b7ac9d5bfa9)；最新 [v2.1.3](https://github.com/dramaclaw/dramaclaw/releases/tag/v2.1.3) **2026-10-29 14:09 UTC**。 | 活跃、与视频制作很贴近，但 **Elastic License 2.0** 限制向第三方提供托管/受管理服务，不能列为无此限制的开放许可底座。可研究任务中心、失败恢复、镜头/素材/画布双向组织。其 README 还有部分闭测能力，不能全部算作可用开源交付。[许可](https://github.com/dramaclaw/dramaclaw/blob/main/LICENSES/Elastic-2.0.txt) · [README](https://github.com/dramaclaw/dramaclaw/blob/main/README.md) |
| **[OpenPencil（ZSeven-W）](https://github.com/ZSeven-W/openpencil)** | **7,165★**；[API](https://api.github.com/repos/ZSeven-W/openpencil)。`main` **2026-11-05 03:29** 有[iOS 账户删除等实际实现](https://github.com/ZSeven-W/openpencil/commit/be4cf9c87f91094da13b9ca33ab3e80f99c0b936)；最新 [v0.8.5](https://github.com/ZSeven-W/openpencil/releases/tag/v0.8.5) 为 **2026-10-27 11:27 UTC 的预发布**。 | [MIT](https://github.com/ZSeven-W/openpencil/blob/main/LICENSE)，与 open-pencil/open-pencil **是两个不同项目**。Rust 核心、JSON `.op`、并发 Agent Teams、设计到代码；主要是 AI 矢量/UI 设计，不是现成图片视频生成工作流。[README](https://github.com/ZSeven-W/openpencil/blob/main/README.md) |
| **[ComfyUI](https://github.com/Comfy-Org/ComfyUI)** | **145,865★**；[API](https://api.github.com/repos/Comfy-Org/ComfyUI)。`master` **2026-11-09 01:56** 有[推理代码修复](https://github.com/Comfy-Org/ComfyUI/commit/fca60fe70e5b84c5c6b058263653d15cb3401e44)；最新 [v0.44.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.44.0) **2026-11-04 01:12 UTC**。 | [GPL-3.0](https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE)，属于生成引擎/API/模型节点图，不是通用白板 SDK。若把所有节点式 AI 画布也纳入，则它比本次主表 Excalidraw 的累计星数更多；用户已经对接它，更适合继续将它作为执行引擎单独看待。[README](https://github.com/Comfy-Org/ComfyUI/blob/master/README.md) |

另筛查 [sjolt-ai/open-canvas-tv](https://github.com/sjolt-ai/open-canvas-tv)：只有 **8★**，近代码 **2026-07-18**，无 GitHub release；虽然其 3D Director → 图像 → 视频复用链路贴近需求，但未达到本次“关注度 + 持续维护”的优先级，因此未放入主选。[元数据](https://api.github.com/repos/sjolt-ai/open-canvas-tv) · [提交](https://github.com/sjolt-ai/open-canvas-tv/commit/4512733fcc3d32f96b4ac202cd6104ff5cb81c01) · [发布列表 API](https://api.github.com/repos/sjolt-ai/open-canvas-tv/releases)

## 复核入口与尚未证明的事项

- 每个项目的统计可从 `https://api.github.com/repos/{owner}/{repo}` 重取；默认分支历史来自 `.../commits?per_page=5`，xyflow 为排除发布提交加读前15条。提交本体以表中永久 SHA 链接核实。不同分支的 push 不代表默认分支有新代码，本报告不使用 `pushed_at` 作为维护日期。
- 发布使用 `.../releases?per_page=5`；AFFiNE 另读 `.../releases/latest` 取得稳定版。Releases API 列表的顺序不能简单当作 `published_at` 大小，xyflow 的多包需分开标识。没有 release 也不自动等于没有维护。
- 本次未取得一致口径的周/月新增星数，未核实真实使用人数、维护团队规模、Issue 响应速度、已发布安装包的代码对应关系及安全性、付费模型实际可用性、视频质量、性能或现有项目 JSON/素材导入兼容。不得据本报告声称“可以无损一键迁移”。
- 用户当前 `hero8152/Infinite-Canvas` 的上游停更公告、当前本地改动与升级差异由同次任务的另一条调查处理；这里不重复从缓存页推断状态。DX-OS 只是公告所指新版本的名称/去向，本报告未验证其源码开放性、许可和数据兼容，不据此推荐直接迁移。


## 本地画布比较与本次升级建议（界面与画布操作体验优先）

### 检查范围与结论

当前项目目录为 `[local path omitted] coding/canvas`，Git origin 为 `hero8152/Infinite-Canvas`。GitHub 连接器已经验证可用。本地存在大量未提交定制；本轮仅读取源码及公开 GitHub 来源，新增本报告，未执行升级、回滚、迁移、生成任务或代码修改。未启动应用，也未做浏览器视觉走查、交互回归或性能实测。

用户明确选择本次优先方向为“界面与画布操作体验”。建议保留现有 AI 接入与业务数据，先做画布体验升级，再按实测结果决定是否替换视图层。

### 当前版本与上游的关系

- 本地 Git HEAD 为 `96c0085`，本地 VERSION 为 `2026.08.04`，上游固定版本 `67f49e4b9a0ac090bad1f5bd62ae385f8fb5394e` 的 VERSION 为 `2026.08.28`。[上游 VERSION](https://github.com/hero8152/Infinite-Canvas/blob/67f49e4b9a0ac090bad1f5bd62ae385f8fb5394e/VERSION)
- 不能仅据 Git HEAD 或版本号判断功能落后：本地实际工作树已包含绝大多数上游改动，并另有 Codex 模型与视觉能力、界面和 API 配置定制。逐行比较忽略换行后，两个画布 CSS、三个 i18n 文件与上述固定上游一致；主要 JS/Python 的差异集中在局部定制。
- 上游更新说明明确写着“此项目已停更”，并引导用户下载 DX-OS。它不满足本次“持续更新”要求。DX-OS 的开放源码、许可证和旧数据兼容性本轮未验证，不能把该导流公告当作已验证的迁移路径。[固定上游更新说明](https://github.com/hero8152/Infinite-Canvas/blob/67f49e4b9a0ac090bad1f5bd62ae385f8fb5394e/static/update-notes.json)
- 现有更新器会先建立恢复点，然后整体替换 static 和若干根文件；备份回滚不等于保留定制的合并升级。[备份逻辑](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:2415>)、[替换逻辑](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:2552>)
- 当前来源许可证写有商业使用限制，以及二次开发需保持开源并注明作者的要求，不能将其视作 MIT 项目。[本地 LICENSE](<[local path omitted] coding/canvas-backup-20261109-013025/LICENSE:1>)、[上游 LICENSE](https://github.com/hero8152/Infinite-Canvas/blob/67f49e4b9a0ac090bad1f5bd62ae385f8fb5394e/LICENSE)

### 现有能力应当保留

当前已有分组、图片/视频/音频节点、小地图、全局总览、指针锚定滚轮缩放、Alt 拖动复制、复制时保留输入连线、工作流 JSON/含资源 ZIP 导入导出、提示词库与资产库。也已有自动保存、WebSocket 与轮询、任务续查、串并行级联、缩略图和部分 DOM/媒体复用。上述项目不应作为“从零新增”的升级成果。

证据：[智能画布快捷键与入口](<[local path omitted] coding/canvas-backup-20261109-013025/static/smart-canvas.html:233>)、[小地图与工作流入口](<[local path omitted] coding/canvas-backup-20261109-013025/static/smart-canvas.html:142>)、[工作流资源打包](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:16351>)、[普通画布局部刷新](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:5996>)。

### 推荐的体验升级范围

以下是候选设计和建议验收标准，尚未实施。涉及视觉位置和交互手感的细节，应在运行界面及真实素材样本中确认。

| 顺序 | 当前状态或证据 | 推荐改进 | 建议验收 |
|---|---|---|---|
| 1 | 已有图级撤销，但未见对应重做栈；说明写 Ctrl+Shift+Z 为重做，处理器却仍调用 performUndo | 完整的画布 Undo/Redo；区分文字编辑历史、图编辑历史与异步生成状态；可见的撤销/重做按钮和禁用状态 | 拖动、分组、删除、连线可以连续撤销与重做；快捷键说明与行为一致；撤销布局不会删除刚返回的生成结果 |
| 2 | 已有滚轮缩放、小地图、Z 总览；主要功能依赖快捷键和手势 | 常驻缩放百分比、100%、适应全部、定位选中；增加节点搜索定位；统一触控板与鼠标平移规则，并评估 Space 临时抓手 | 不看帮助也能回到节点、恢复合适视图；同一套手势在两种画布一致；文字输入和视频播放时不误触画布命令 |
| 3 | 已有分组、智能整理与多种媒体组语义 | 统一选择/框选/多选规则；明确“普通分组”和“合并图片”的区别；补齐对齐/等距分布、吸附参考线和批量操作反馈 | 同一批节点选择后，批量操作目标清晰；进出分组不意外合并或丢失引用；相同手势在两种画布结果一致 |
| 4 | 普通画布已有端口吸附、类型与部分环路检查，智能画布已有连线；未见已有边的端点拖动重连 | 连线悬停高亮、放大命中区域、可兼容端口提示、端点重连；失败时定位到节点并说明原因 | 更换上游引用不必删线重建；非法或不支持的输入在提交前被说明；可快速找到失败节点 |
| 5 | 普通画布参数在节点内，智能画布 composer 位于可缩放 world 中；未见固定视口的属性栏 | 复用现有参数编辑器，增加可固定/收起的上下文属性栏；常用动作就近展示，高级参数渐进展开；多选显示共有属性和混合值 | 25% 缩放时参数控件仍按屏幕字号显示；切换节点不丢草稿；多选参数归属明确；打开资产/参数区域后仍能看见当前工作目标 |
| 6 | 已有缩略图、lazy/async 解码、媒体播放状态恢复和局部刷新，但完整 render 仍遍历全部节点 | 节点视口裁剪、稳定 DOM 更新、节点 ID 索引、小地图节流；节点运行时减少无关重绘 | 在固定设备上建立 100/500/1000 节点样本，比较帧耗时、内存和打开速度；建议把 1000 节点交互 p95 帧耗时 ≤33ms 作为待验证目标 |

直接源码证据：

- 重做说明：[smart-canvas.html:238](<[local path omitted] coding/canvas-backup-20261109-013025/static/smart-canvas.html:238>)；实际快捷键处理：[smart-canvas.js:18135](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:18135>)、[canvas.js:16049](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:16049>)。
- 整份历史快照：[smart-canvas.js:201](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:201>)、[canvas.js:14794](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:14794>)。
- 普通画布已有连线吸附与校验：[canvas.js:15242](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:15242>)、[canvas.js:15299](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:15299>)；智能画布连接交互：[smart-canvas.js:8591](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:8591>)。
- 参数编辑结构：[canvas.js:6192](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:6192>)、[smart-canvas.js:12931](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:12931>)。
- 完整渲染与已有媒体复用：[smart-canvas.js:8389](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:8389>)、[canvas.js:5959](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:5959>)。性能瓶颈比例尚未实测，不能承诺换库后必然变快。

### 应随体验升级处理的可靠性问题

这些问题直接影响“操作是否可预期”，但不是本轮已经复现的故障：

1. 普通画布收到其他页面更新通知后，会清除待保存计时器并清空 dirty 标记，存在未保存草稿被远端替换的窗口；409 分支也未真正合并双方改动。[canvas.js:2251](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:2251>)、[canvas.js:1505](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/canvas.js:1505>)
2. 智能画布同步对节点和连线取并集，代码明确保留另一端已删除的本地节点，可能出现删除复活。应增加删除记录或明确的冲突处理。[smart-canvas.js:5379](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:5379>)
3. 画布 JSON 直接覆盖写入，应使用原子替换并展示保存失败/重试状态；后台画布任务主要在进程内保存，刷新续查与服务重启恢复应区分。[main.py:3598](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:3598>)、[main.py:14535](<[local path omitted] coding/canvas-backup-20261109-013025/main.py:14535>)。

### 推荐路线

近期：在当前代码上完成体验升级，优先做 Undo/Redo、统一导航与选择、连线编辑、参数呈现及性能基线。保留已接好的 AI 提供方、工作流与资产能力。

中期：若双画布重复维护和自研渲染的成本仍高，再用一个包含图片、视频、分组、连线及历史操作的完整样本验证 React Flow 视图层。它是候选底座；数据迁移、任务执行、历史与资产管理仍需自行设计。

参考分工：Excalidraw 用于观察交互一致性；basketikun/infinite-canvas 用于对照 AI 画布的工具组织和节点操作；React Flow 用于评估节点交互架构；Toonflow 用于后续分镜/视频流程。basketikun README 明确提示开发阶段不保证历史数据兼容，因此也不宜直接替换现有项目数据。[basketikun README](https://github.com/basketikun/infinite-canvas/blob/main/README.md)、[xyflow README](https://github.com/xyflow/xyflow/blob/main/README.md)

### 可选择性回补的上游小修复

这两项独立于界面改版，尚未回补或运行验证：

- 引用上传后再识别即梦图片/视频类型：[本地 smart-canvas.js:2549](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:2549>)、[固定上游](https://github.com/hero8152/Infinite-Canvas/blob/67f49e4b9a0ac090bad1f5bd62ae385f8fb5394e/static/js/smart-canvas.js#L2549)。
- 视频请求只收集视频类型引用，避免把所有手动媒体链接都放进 videos：[本地 smart-canvas.js:16392](<[local path omitted] coding/canvas-backup-20261109-013025/static/js/smart-canvas.js:16392>)、[固定上游](https://github.com/hero8152/Infinite-Canvas/blob/67f49e4b9a0ac090bad1f5bd62ae385f8fb5394e/static/js/smart-canvas.js#L16393)。

