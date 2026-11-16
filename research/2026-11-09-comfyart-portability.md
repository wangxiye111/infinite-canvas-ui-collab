# ComfyArt → infinite-canvas 技术可移植性核对

核对日期：2026-11-09。仅静态阅读公开源码，没有安装、启动、调用生成、修改现有项目或读取用户私有数据。工作量“小 / 中 / 大”是相对范围判断，不是工期承诺。

固定基线：

- 来源：`jtydhr88/ComfyArt`，提交 [`406ae8624e8a2babccb35a7006af021b15b33837`](https://github.com/jtydhr88/ComfyArt/commit/406ae8624e8a2babccb35a7006af021b15b33837)，该提交包版本 1.2.1。
- 目标：`wangxiye111/infinite-canvas`，提交 [`854bd86dbfabb72711368c8de7ca16ab39aa9019`](https://github.com/wangxiye111/infinite-canvas/commit/854bd86dbfabb72711368c8de7ca16ab39aa9019)。目标产品版本 v0.20.0 由主调研核对；其 `web/package.json` 的 npm 包版本仍为 0.1.0，两者不要混用。

## 结论

适合移植的是 **工作流参数绑定、ComfyUI 任务协议、部分浏览器图像算法和参考资产数据模型**。ComfyArt 的 React 组件不等于可直接插到目标的组件：它的交互、文档、资产、任务和撤销机制大量依赖 tldraw Editor。目标已有自定义节点 SDK、模型调用脚本、节点操作指令和本地资产存储，应继续以这些接口为骨架。

首批建议三个交付单元：**单实例 ComfyUI + 自定义工作流闭环**、**保留原图的本地调色**、**轻量品牌/角色/产品参考套件**。画板/图层完整体系、ControlNet、视频时间线、多实例调度放到后续。该排序是工程判断，需与功能价值调研一起取舍。

## 1. 技术栈与边界

| 方面 | ComfyArt 源码事实 | 目标源码事实 | 对移植的影响 |
|---|---|---|---|
| 前端 | React 19.3.1、TypeScript 7、Vite 8；tldraw 5.5.2；还用 Three.js、Paper.js、ag-psd、Tiptap | React 19.2.5、TypeScript 5、Vite 7、Zustand 5、Ant Design 6 | 不能整份照搬依赖清单。纯 TS 算法可抽取，组件主题/状态/事件须按目标改写 |
| 画布 | `<Tldraw>` + 自定义 ShapeUtil；`Editor` 管理 shape、asset、selection、history | 自定义 DOM 容器通过 `translate + scale` 实现视口；节点是 `CanvasNodeData`，连接单独保存 | `TLShape/Editor` 不能直接成为目标节点；图层排序、旋转、透明度、父子框架须明确映射 |
| 服务端 | 作为 ComfyUI Python 自定义节点加载，注册 `PromptServer.instance.routes`；后端有 aiohttp、SQLAlchemy/SQLite | 此次目标以浏览器 localForage + Zustand 存储为基础，并已有模型服务/代理接入面 | 不能把 `/comfyart/*` 相对地址照搬到目标域名；不需要为了少量功能引入整套 ComfyArt 后端 |
| 数据 | 项目保存 tldraw snapshot 到 ComfyArt SQLite；部分配置/套件保存 ComfyUI 用户文件 | 项目节点/连接持久化到 localForage；图片 Blob 和媒体 Blob 各有存储；项目导出 ZIP v3 | 不能直接互导项目 JSON。需要明确的资产落地和任务记录，不应依赖原服务的临时 URL |

来源：[ComfyArt package](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/package.json)、[ComfyArt App](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/App.tsx#L90-L131)、[Python 入口](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/__init__.py)、[数据库](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/api/db.py)、[项目 snapshot](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/projects.ts#L1-L26)；[目标 package](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/package.json)、[目标视口](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/infinite-canvas.tsx#L216-L230)、[目标节点类型](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas.ts)、[目标持久化](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/localforage-storage.ts)、[目标导出](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-export.ts)。

### 许可证核对

两库根许可证均为 MIT；复制 ComfyArt 自有代码时应保留其版权和许可声明。**这不代表其整个依赖树都按 MIT 授权。** ComfyArt 仓库附带的 tldraw 许可证区分开发和生产使用，明确限制默认授权下的 Production Environment，并提供商业/其他许可路径。因此本方案不搬 tldraw 引擎，而将算法和功能重接到目标现有画布；若将来决定引入 tldraw，应另核对适用授权。这里是固定源码中的许可证事实，不是对具体业务部署的法律意见。[ComfyArt MIT](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/LICENSE)、[目标 MIT](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/LICENSE)、[仓库附带 tldraw 条款](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/licenses/tldraw-LICENSE.md)。

## 2. 五个可移植模块

### A. ComfyUI 连接与任务生命周期：中；多实例/云调度为大

**源实现。** `src/comfy.ts` 提供 `uploadImage`、`queuePrompt`、`cancelPrompt`、`promptHistory`、`waitForImages`、`waitForText`。本地链路为上传图片 → `/prompt` 提交 API graph → `/ws?clientId=…` 接收事件 → `/history/{id}` 获取输出 → `/view?...` 取媒体。等待同时使用 WebSocket 唤醒与 1500ms 轮询；取消区分等待队列删除和执行中 interrupt。`src/jobs.ts` 将 `prompt_id/output node/kind` 放进 `shape.meta.job`，恢复时扫描 shape，结果通过 placer 落到画布。[协议封装](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/comfy.ts)、[WebSocket](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ws.ts)、[任务与恢复](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/jobs.ts#L156-L260)。

**可抽取。** Graph/ImageRef 类型、API 错误格式化、历史输出解析、按 prompt_id 匹配任务、队列取消策略。

**必须适配。** `api()` 写死 `/api`，WebSocket 写死当前 origin，`Comfy-User` 取 ComfyUI 浏览器配置；目标部署地址不同，必须建立显式 `baseUrl/http/ws` transport。所有 `Editor`、`TLShape`、`atom`、相对 `/api/view` URL 改为目标 job store、节点 metadata 与本地资产。浏览器停止轮询并不等于服务端取消，需要单独调用取消接口；断线后查 history，不能重复提交。

**建议接口（拟议，目标尚不存在）：** `submit(graph, outputNode) -> {jobId}`，`watch(jobId,onEvent,signal)`，`cancel(jobId)`，`outputs(jobId) -> Blob[]`；`JobRecord` 至少保存 endpoint ID、prompt ID、output node ID、源节点 ID、状态和已导入结果标识。输出经目标 `uploadImage` / `uploadMediaFile` 保存，再用 `applyOps(add_node/update_node/connect_nodes)` 落位。前端任务状态可细分 queued/running/cancelling，但再映射到目标现有 idle/loading/success/error，避免修改既有节点状态语义。[目标节点指令](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-agent-ops.ts#L7-L23)、[图片存储](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/services/image-storage.ts#L37-L67)、[媒体存储](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/services/file-storage.ts#L1-L31)。

**不能把多实例看成多填一个 URL。** ComfyArt `api/remote.py` 还负责节点/模型适配、输入文件上传、负载挑选、WebSocket 转发、结果下载；这些依赖 Python 后端，首批只做一个明确选择的 ComfyUI 实例。[remote 实现](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/api/remote.py)。

### B. 自定义工作流标记、校验和参数绑定：核心小；完整接入中

**源实现。** `customMarkers.ts` 是最适合抽取的模块。`parseApiWorkflow/asApiWorkflow` 区分 API graph 与 UI 格式；`findMarkers/checkWorkflow` 识别 `_meta.title` 上的 `@prompt/@image/@mask/@size/@save`，校验重复、缺失、字段类型及输出；`fillWorkflow` 注入参数。`customWorkflows.ts` 将 action 与文件关联，并提供 crop paste-back、outpaint pad、resize 等图适配。[标记和校验](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customMarkers.ts)、[持久化及图适配](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customWorkflows.ts)。

**可近原样抽取。** API JSON parser、marker finder、验证规则、字段填充和纯图重连函数；去掉 ComfyArt i18n 依赖，向调用方返回结构化错误更适合目标 UI。

**必须适配。** 工作流库的 tldraw atom 与 ComfyUI userdata 存储改为目标 store；选择的图片先解析目标 storageKey，再上传到 ComfyUI。源 `fillWorkflow` 每次会随机化全部 `seed/noise_seed`，不能照搬为“可复现”功能；目标应明确保存实际提交 seed，允许固定或随机。标记校验不证明服务器节点/模型齐全：例如擦除工作流还要求 `INPAINT_LoadInpaintModel` 与 `big-lama.pt`。[工作流实例](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/workflows/erase-lama.api.json)。

**建议接口：** `validate(graph, action) -> {markers,errors,warnings}`、`build(graph, markers, values, seedPolicy) -> {graph,outputNode,actualSeed}`。先实现一个生成/编辑工作流节点的 `Content + Panel`，通过目标 SDK 的 `getUpstream/updateMetadata/applyOps` 接入。目标自定义模型脚本已有 `request/poll/signal`，适合验证一次生成链路；若需要可恢复任务、进度和服务端取消，应形成专用 adapter/store，不能只靠一次脚本 Promise。[目标插件契约](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas-plugin.ts#L41-L87)、[模型脚本运行器](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/services/api/model-plugin.ts#L68-L163)。

### C. 保留原图的本地调色：算法小；完整体验中

**源实现。** `adjust.ts` 用浏览器 Canvas2D 实现曝光、对比度、高光/阴影、饱和度、色温、锐化等；`autoAdjust` 在缩小图上估算参数。计算本身基本独立，只需替换 `loadImage` 里的 ComfyArt `imageUrl`。`imageOps.ts` 另保存原 asset ID 和参数，重开继续从原图渲染；UI 有预览、按住对比、重置、应用。[调色核心](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/adjust.ts)、[原图和参数](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/imageOps.ts#L7-L56)、[交互面板](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/AdjustPanel.tsx)。

**可复制范围。** `Adjust` 参数、Canvas2D 处理、自动估参算法。**需重做：** Antd 面板、选择/缩放坐标、撤销边界、保存原图与参数、输出 Blob 入目标图库；不是复制 `AdjustPanel`。

**建议接口：** `renderAdjust(sourceBlob,params,maxSide?) -> Blob`；节点保存 `adjustment: {source: {storageKey}, params}`，显示图保存另一 storageKey。这里采用嵌套 `storageKey` 是有意的：目标的资产回收和 ZIP 收集递归识别名为 `storageKey` 的字段，仅加 `sourceStorageKey` 字符串会漏入导出/回收规则。若数据放插件私有库，也需要补齐项目导出接入。[资产回收规则](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/services/image-storage.ts#L243-L269)、[项目收集规则](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-export.ts)。

这不应宣称专业色彩管理或照片质量已验证；源码使用 RGB 像素运算，真实大图性能和视觉质量尚未运行评估。

### D. 品牌/角色/产品套件 + 参考角色：轻量版中；ControlNet 为大

**源实现。** `library.ts` 有 brand/character/product/custom 数据模型、图片/Logo、颜色角色、字体、描述，`describeItem` 组装提示词。`refModes.ts` 把参考图分成内容、风格、构图及结构控制等模式；内容/风格/构图部分可用文字提示，Canny/Depth/Pose 等会插入 ComfyUI 预处理/控制节点。[套件模型](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/library.ts)、[参考角色与控制](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/refModes.ts)。

**可抽取。** 套件 schema、角色字典、提示词组装和参考排序规则。**需重做：** 套件编辑器、Zustand/localForage 持久化、目标资产 ID/storageKey 关联、模型支持能力检查、应用到生成节点的 UI。目标 SDK 有 `getUpstream/resource/ai.generateImage` 和私有 storage，但并无自动把插件私有库打包进项目的契约；共享套件导入导出需要显式设计。[插件资源与 AI 契约](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas-plugin.ts)、[插件私有存储](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-event-bus.ts#L30-L50)。

**建议接口：** `ReferenceKit {id,kind,name,description,assets:[{role,storageKey}],colors,fonts}`，`resolveKit(kitId,modelCapabilities) -> {promptParts,references,warnings}`。首批做内容/风格/构图语义标签与明确的参考顺序；模型实际遵从程度需视觉验收，不能把提示词中的“构图参考”称为硬约束。ControlNet 强度/start/end 与预处理图待 A/B 闭环稳定后再加。

### E. 分层 PSD 导出：中；完整可编辑设计还原为大

**源实现。** `psd.ts` 用 `ag-psd` 写出图层名、偏移、栅格 Canvas 与合成图；对文字/矢量等 shape 先 `editor.toImage()` 栅格化。因此是“保留分层位置的栅格 PSD”，不是可编辑文字/矢量 PSD。[PSD 实现](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/psd.ts#L29-L68)。

**可抽取。** ag-psd 写出、边界/缩放/图层偏移和下载算法。**需重做：** 目标选择集读取、每类节点导出为图片、叠放顺序、组选区边界和透明度；目前目标有项目 ZIP/素材 ZIP，不能把它们当成节点可视化渲染器。建议先限选中的图片节点，明确导出范围；任意插件节点转图需新增 `rasterize(node)` 契约。[目标当前导出](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-export.ts)。

## 3. 首批最小验收

以下是后续实现的验收建议，本次未实现、未运行。

| 交付单元 | 最小边界 | 最小验收 |
|---|---|---|
| A+B：单实例 ComfyUI 自定义工作流 | 一个明确 endpoint，API 格式工作流，图片输入/提示词/尺寸/seed，图片输出，任务状态与取消 | 正常生成结果旁置且原图不改；错误/重复 marker 在提交前指出；缺模型/节点返回可读错误；队列取消与执行中取消区别可见；页面刷新后按同一 prompt_id 恢复，不重复提交/导入；关闭 ComfyUI 后已导入结果仍可查看；项目 ZIP 往返保留输入、输出和实际 seed |
| C：本地调色 | 图像节点，曝光/对比度/饱和度/色温为第一组；原图对比、重置、应用 | 同一源图反复调参不发生累计烘焙；取消不写入；重置恢复原图；一次应用可撤销；透明图 alpha 保留；刷新和项目导出/导入后可继续调；用真实大图确认预览可操作性和视觉质量 |
| D：轻量参考套件 | 品牌/角色/产品、命名描述、图片关联、颜色、参考角色；暂不引入 ControlNet | 同套件可应用到两个生成节点；参考图顺序与角色对应；删除/重排不串位；模型不支持时明确提示；导出/导入不丢原图引用；用户以固定测试提示确认“帮助保持一致性”是否达到预期 |

建议验收顺序：先看 A+B 是否能复用用户已有 ComfyUI 工作流，再看 C 的原图/参数保存是否可靠，最后评估 D 的实际生成一致性。API 通、JSON 可解析、构建成功分别只能证明各自层面的结果，不能替代图像和交互验收。

## 4. 暂缓直接移植的内容

- **tldraw 画布、ShapeUtil、完整图层/画板/矢量编辑器**：渲染和文档模型不同，整体迁入会形成两套画布语义，且需处理 tldraw 授权。
- **ComfyArt 全套 Agent、MCP、CLI 会话栈**：目标已有 Canvas Agent 和节点指令；先把新增功能暴露给现有 Agent，避免双任务/双会话存储。目标可通过 `applyOps` 和节点插件接入。[目标插件 host](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/hooks/use-plugin-host.tsx)。
- **视频时间线、3D、自动多实例路由**：不是一个 UI 插件的工作量；应各自形成能力范围和输出格式后独立评估。
- **内置工作流“一键全支持”承诺**：JSON 只是流程定义，实际还依赖用户的模型、节点包和算力环境；本次没有检查或变更这些环境。

