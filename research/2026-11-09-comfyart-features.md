# ComfyArt 功能与体验借鉴核查（2026-11-09）

调研对象：[jtydhr88/ComfyArt](https://github.com/jtydhr88/ComfyArt)。固定源码版本为 [406ae8624e8a2babccb35a7006af021b15b33837](https://github.com/jtydhr88/ComfyArt/commit/406ae8624e8a2babccb35a7006af021b15b33837)，提交时间 2026-11-09 02:21:08 UTC，内容为增加 Krea 2 Turbo。ComfyArt 源码链接均固定到此版本；工具栏与遮罩增量另对照目标 wangxiye111/infinite-canvas 的当前提交 `854bd86dbfabb72711368c8de7ca16ab39aa9019`，避免把已有能力当成待移植功能。

**证据等级：本报告确认“文档有说明、源码有接线与实现”，没有安装、启动或运行 ComfyArt，没有实际生成图像/视频/3D，也没有完成性能、视觉保真、交互手感的验收。** 截图、宣传片及模型效果描述均不作为效果验证。八项候选不是八项均需新增：当前 infinite-canvas 已有的同类功能，应按主报告差异表只补其具体缺口。

## 核心结论

最值得参考的是“选中对象后就地操作、变化有来源、产物留在上下文里”的交互组织，以及把普通设计动作映射为可替换 ComfyUI 工作流的接口。不是必须更换当前画布引擎才能获得这些体验。

优先级建议：

| 次序 | 可借鉴内容 | 对用户的价值 | 迁移方式与边界 |
|---|---|---|---|
| 1 | 本地无损调色；沿用现有可定制工具栏 | 改色可回退，比较版本更直接 | 工具显隐、标签开关及本地保存目标已具备；新增重点是原图与调色参数保存、像素处理 |
| 2 | 图层树与画板整理 | 多图、多版本更容易管理 | 补当前树的拖入/拖出、隐藏锁定、范围选择等明确缺口 |
| 3 | 套索/矩形/SAM、反选/羽化、评论绑定选区 | “改这里”比文字描述坐标更自然 | 目标已有画笔、橡皮、遮罩撤销/重做；只扩新的选择方式与区域语义 |
| 4 | 成图拆成可编辑元素 | 海报/概念图改字、挪主体更方便 | 成本高于普通抠图；OCR/分割/补背景有误差，适合第二阶段 |
| 5 | 参考板与品牌/角色/产品资产 | 跨项目保持视觉语言，少重复上传和描述 | 第一版可先做轻量结构化资产与引用，分析能力后接 |
| 6 | 可替换工作流 + 任务生命周期 | 保持画布操作简单，同时可接本地 ComfyUI | 是最清晰的技术复用方向；需为当前应用重写 transport/store |
| 7 | 3D 模型卡片与截帧 | 模型和二维参考放在同一设计上下文 | 可先只做上传预览/截帧；生成另接 GPU 工作流 |
| 8 | 视频分镜与轻剪辑 | 图片→片段→简单成片在一处完成 | 独立中大功能；不要为当前画布体验优化先搬整套视频编辑器 |

以下“已实现”都指代码级确认，不代表已通过运行验收。

## 1. 对象工具栏已可定制；新增价值是无损调色

**已实现：**

- 图片选中时才出现工具栏；进入专用编辑模式时隐藏通用栏。工具分成固定与更多菜单，用户可固定/取消固定工具、显示/隐藏名称、恢复默认配置。设置持久化到本地。Tab 进入快捷编辑，Shift+Enter 进入选区对话。[ImageToolbar.tsx L36–54、L129–143、L175–258](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/ImageToolbar.tsx#L36)
- 调整面板把曝光/对比、高光阴影、色温饱和、清晰锐化、颗粒/晕影等分组，带自动、重置、按住对比、应用交互。[AdjustPanel.tsx L20–24、L96–159](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/AdjustPanel.tsx#L20)
- 应用调整时记录原始 asset ID 和参数；再次进入调色从原 asset 重新渲染，重置可还原该来源，而不是连续烘焙累积损失。[imageOps.ts L7–23、L47–56](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/imageOps.ts#L47)

**目标已具备：** 当前 infinite-canvas 已有图片工具的 `ids`、`showLabels` 配置及 `canvas-image-quick-tools-v7` 本地配置键；不是只有类型定义，实际浮层组件会读取配置、按 ids 过滤显示工具、切换名称、打开设置弹窗并保存回 localStorage。因此“固定/取消固定常用工具”“工具名称开关”“定制配置持久化”均不应再列为迁移增量。实际调用文件是 `canvas-node-hover-toolbar.tsx`。[目标配置定义 L34–39、L154–161](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-image-toolbar-tools.tsx#L34)、[目标浮层 L90–101、L160–181、L198–212](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-node-hover-toolbar.tsx#L90)

**可借鉴的真正增量：** 在现有工具栏里新增本地调色入口，把“原始图像 + 调色参数”跟随对象保存，支持重开继续调整、重置、预览对比；无需再造工具栏定制系统。本地调色比接一个生成模型更轻，能改善画布日常操作。

**边界：** 面板手感、调色质量与“按住对比”在多次调整后的实际显示未验证。算法是浏览器像素处理，不等同于专业色彩管理或 RAW 工作流。可复用算法文件为 [adjust.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/adjust.ts)，保存及面板需适配当前节点数据。

## 2. 画板与图层树：对象组织、自动整理、历史与导出

**已实现：**

- 图层拖动存在上方、下方、移入三种落位；禁止移入自身后代；支持画板/组折叠、双击改名、隐藏、锁定、Ctrl/Command 加选、Shift 连续选择，选择屏外对象时自动移入视野。[LayersPanel.tsx L40–59、L87–152、L186–200](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/LayersPanel.tsx#L40)
- 画板可用固定或 hug 尺寸；子元素改变时重新排版。**这里的自动布局是按位置排序、固定间距、宽度限制换行或近似平方列数的算法**，不是 Figma 完整 Auto Layout。[FrameToolbar.tsx L48–124](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/FrameToolbar.tsx#L48)
- 自动保存有 pending/saving/saved/error 状态、800ms debounce；快照按约 5 分钟间隔保存。[autosave.ts L7–48](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/autosave.ts#L7)、[history.ts L5–29](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/history.ts#L5)
- 导出入口支持 PNG/JPG/SVG/PDF/PPTX。PPTX 对文字、图片以及符合条件的矩形/椭圆输出可编辑对象，其他复杂对象回退栅格图；PDF 路径是将导出 JPEG 封装为单页 PDF，不是保留全部矢量结构。[ExportDialog.tsx L14–42、L57–67](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/ExportDialog.tsx#L14)、[pptx.ts L83–139](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/pptx.ts#L83)

**可借鉴：** 多图参考/版本方案场景优先补清晰的层级与选中联动、拖动落位提示、保存反馈。自动整理可作为轻量按钮；无需先实现完整约束布局。

**边界：** PSD 导出将每个选中形状画到 canvas 后写为一层，因此是**分层栅格 PSD**，不能承诺文字/矢量仍可编辑。[psd.ts L33–69](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/psd.ts#L33)

## 3. 局部选区与评论驱动编辑

**已实现：**

- 局部编辑工具有画笔、橡皮、套索、矩形、智能选择；支持遮罩反选、20 步遮罩撤销、羽化，以及对象移动的偏移预览。智能选择实际调用 SAM 图并把返回遮罩合入当前遮罩。[InpaintPanel.tsx L17–31、L122–155、L158–218](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/InpaintPanel.tsx#L17)
- 图片上的评论可以直接执行 touchEdit，或发到对话；空文字时禁用，图片区分于普通画布评论。[CommentPanel.tsx L68–108](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/CommentPanel.tsx#L68)
- 自定义局部编辑适配器将选区裁出、送工作流，再把结果按遮罩合成回原图；不是让模型任意重画全幅。[customWorkflows.ts L133–141](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customWorkflows.ts#L133)

**目标已具备：** 当前 mask dialog 的绘制模式已有 `paint` / `erase`，保留笔画 history 和 redo 栈；已实现撤销、重做、清空、快捷键、笔刷大小和缩放交互。因此“画笔”“橡皮”“遮罩可回退”都不算新增，ComfyArt 的 20 步撤销也不能直接视为更强。[目标遮罩状态 L16–40](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-node-mask-edit-dialog.tsx#L16)、[撤销/重做/快捷键 L156–204](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-node-mask-edit-dialog.tsx#L156)、[实际按钮 L272–306](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-node-mask-edit-dialog.tsx#L272)

**可借鉴的真正增量：** 目标当前遮罩实现仅有画笔/橡皮两种绘制模式；可增补套索、矩形框选、SAM 智能对象选择，以及反选、羽化和对象位移预览。另一个独立增量是把圈定区域与评论/修改说明绑定，能在画布上持续看清“要改哪里”。这些应接入现有 mask edit 和历史机制，不重复实现撤销/重做。

**边界：** 遮罩编辑分辨率会限制最长边至 1536；智能选择、补背景与生成效果仍依赖模型。评论是项目画布内反馈对象，未发现本次所读实现能证明多人实时协作、账号权限或远端审阅流程。

## 4. 从图片重建可编辑元素，再按版式重新渲染

**已实现：**

- OCR 请求 /comfyart/ocr，过滤低置信结果；根据文字框估算位置、字号、旋转、颜色与对齐。可选 Agent 仅将字体归为 serif/sans/display/mono/script，并映射到有限的替代字体；默认 Arial。[elements.ts L13–36、L65–99](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/elements.ts#L13)
- SAM 以 product、logo 提示分割对象；合并文字与物体遮罩，经 eraseGraph 补背景；最终创建一个画板，内部是背景图片、主体图片和实际 TextShape。[elements.ts L113–186](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/elements.ts#L113)
- 排版画板支持带描述的 AI 内容块，生成提示包含块的相对百分比位置；可比较上次渲染后的新增/修改/删除，可导入导出 .layout.json；实际重渲染仍是导出画板图片并调用图像编辑模型。[compose.ts L28–70、L95–103](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/compose.ts#L28)

**可借鉴：** 用户做 HMI 概念/海报参考时，可把“改某行文案、移动产品”变成真实图层编辑，明显强于反复写 prompt。最小版本可先做 OCR 文字层重建，后续加主体分割与背景修补。

**边界：** 这是近似重建，不是恢复源文件：原字体、复杂字效、UI 图标、布局约束与精确层级不能靠这段实现还原；再次生成也没有“像素不变”的保证。README 示例图证明作者展示过某种结果，不证明我们的素材能达到同样效果。独立的图层拆分还有自动 Qwen Image Layered 和自定义区域 SAM 模式，拆分区域可再拆为图层。[layers.ts L178–274](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/layers.ts#L178)

## 5. 参考板、角色/产品资产与品牌套件

**已实现：**

- 素材网格区分生成/上传，支持搜索、滚动分页、缩略图懒加载与坏图占位。[AssetPicker.tsx L9–56](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/AssetPicker.tsx#L9)
- 我的素材中有文件、品牌、角色、产品、自定义分类；套件可用于新项目、设默认、复制、加入对话。[LibraryPanel.tsx L16–44、L55–75](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/LibraryPanel.tsx#L16)
- 品牌套件含文字规范、Logo、颜色及角色、字体/上传字体、参考图；可从图片/PDF 让 Agent 提取品牌字段，并自动保存。[KitEditor.tsx L27–38、L94–138、L184–238](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/KitEditor.tsx#L27)
- 参考图按上传/画布/素材库来源和时间/名称过滤排序，可自动排成情绪板、发起变体、分析风格与构图并附到聊天。[ReferencePanel.tsx L19–22、L46–78、L83–117、L146–189](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/ReferencePanel.tsx#L19)

**可借鉴：** 对 HMI 用户可以命名为“项目视觉规范/车型/角色/参考组”，保存字体、颜色、界面截图、车型素材等；选图和生成时直接引用，减少重复上传。先做数据和引用，再加 Agent 提取，收益更直接。

**边界：** 品牌规范附入 prompt 不等于保证生成符合规范；参考分析依赖 Agent。缩略图懒加载不是证明大规模画布渲染流畅，素材库分页也不是画布虚拟化。

## 6. 可替换 ComfyUI 工作流与完整任务反馈

**已实现：**

- 按功能保存工作流与选用配置；customGraph 校验 API 图和标记，将图片/提示词/尺寸等填入对应节点；“有输入却没对应标记”或“需要输入却没提供”会报错；支持 list/check/install/assign。[customWorkflows.ts L17–64、L206–241](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customWorkflows.ts#L17)
- 节点标题标记包括 @image、@prompt、@mask、@size、@front 等；源码将规则、输入填充、输出节点识别分在相对纯数据模块 [customMarkers.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customMarkers.ts)。对应官方使用说明明确要求 API 格式，普通 nodes 列表格式会拒绝。[自定义工作流文档](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/docs-site/zh/guides/custom-workflows.mdx)
- 任务开始后记录 prompt ID/结果节点等到 shape.meta.job；支持取消、错误反馈、恢复未完成任务；一些分镜任务失败或取消时保留已完成片段；创建临时结果卡时按原图旁边寻找空位。[jobs.ts L143–228、L231–260](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/jobs.ts#L143)

**可借鉴：** 用户只选“去背景/改这里/扩图”，高级用户可替换背后工作流。第一条移植闭环建议是一台 ComfyUI 的连接、上传、标记验证、排队、进度、取消、结果回画布；成功后再扩模型与操作。

**边界：** 这些是工作流接入协议，不是内嵌完整 ComfyUI 节点编辑器。React/tldraw 任务存储和落位强耦合，不能将 jobs.ts 原封搬进当前项目。支持本地、局域网及 Cloud 不意味着所有功能都免费离线；源码包含实际 Comfy Cloud API 分支。[cloud.py L14、L32–34、L119–130](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/api/cloud.py#L119)

## 7. 混合媒体画布：3D 卡片、交互查看与截帧

**已实现：**

- 3D 卡片以 Three.js 加载 GLB/GLTF/OBJ/FBX/STL/PLY；OrbitControls 用于交互模式，支持自动旋转，注册 canvas 截帧函数。[EmbedShapes.tsx L58–137](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/shapes/EmbedShapes.tsx#L58)
- 图生 3D 可选择 TRELLIS.2/Pixal3D，对应实际 JSON 工作流；多视图按 front/left/back/right 接入，返回结果创建 GLB 模型卡。[assetGen.ts L104–164、L180–192](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/assetGen.ts#L104)
- 音频也有独立可播放卡片；产物以专用 shape 落到画布上，而不是只提供文件链接。[assetGen.ts L167–177](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/assetGen.ts#L167)

**可借鉴：** 车型、虚拟助手或展台素材可直接在画布上看角度、截当前视图，再作为二维设计参考。可拆成“先支持已有模型预览/截帧，后支持模型生成”两个独立阶段。

**边界：** 已读实现是查看器，不是网格、骨骼、材质或动画编辑器；多模型卡片资源占用、OBJ/GLTF外部纹理依赖、实际生成网格质量未验收。不要把“生成 GLB”说成能直接交付生产汽车/角色资产。

## 8. 视频分镜与轻量时间线

**已实现：**

- 自定义分镜逐镜头实例化工作流，可把上一镜最后一帧接给下一镜、去掉重复首帧再串接，同时保存各镜部分输出。[customWorkflows.ts L67–111](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customWorkflows.ts#L67)
- 视频编辑器支持拖动首尾裁剪、播放头切分、片段排序、0.5/1/1.5/2 倍速、音量、淡入淡出/黑白场、单条配乐、字幕、节拍吸附、撤销重做。[VideoEditor.tsx L20–23、L153–198、L245–317](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/VideoEditor.tsx#L153)
- 数据模型是顺序 clips + transitions + subtitles + music；导出图构建为 ComfyArtTimeline，自带渲染节点，固定 24fps，输出 MP4，并在本地队列执行。[videoEdit.ts L2–15](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/videoEdit.ts#L2)、[videoRender.ts L6、L46–60](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/videoRender.ts#L46)

**可借鉴：** 如果后续画布要承载 HMI 交互短片，可先支持视频卡片抽帧、首尾帧连接与分镜板。简单修剪可独立增加。

**边界：** 这是轻剪辑，不是专业多轨非线性编辑；当前 UI 的 music 是单对象而非任意多音轨。分镜串联不保证人物一致或真正无缝。官方视频文档列出 H3 多种模式、时长分辨率，源码有相应流程文件；本报告不背书模型可用性、推理速度和视觉质量。[视频文档](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/docs-site/zh/guides/video.mdx)

## 维护、许可与证据限制

- GitHub 当前读取得到仓库创建于 2026-10-13，最新 push 为 2026-11-09，482 stars、83 forks；近期提交包括扩图滑块跳动修复、Agent backend 重构、模型增加。说明有近期维护，也说明项目很年轻，不能用星数或提交频率替代稳定性验证。[仓库](https://github.com/jtydhr88/ComfyArt)、[扩图交互修复提交](https://github.com/jtydhr88/ComfyArt/commit/98786f6ede2f8a49abec9905bfd20256b0c8a1b1)
- 当前最新 Release 是 [v1.2.1，2026-11-05](https://github.com/jtydhr88/ComfyArt/releases/tag/v1.2.1)，本报告看的是其后的 main 最新提交，不应把两者混称同一个固定版本。
- 仓库有 Python tests 目录，但本次没有运行；前端 package.json 的脚本为 dev/build/typecheck，没有列出 UI/E2E 测试命令。本报告不宣称已有完整测试保障。[tests](https://github.com/jtydhr88/ComfyArt/tree/406ae8624e8a2babccb35a7006af021b15b33837/tests)、[package.json](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/package.json)
- ComfyArt 主体代码为 MIT，要求保留版权与许可通知；**tldraw SDK 采用独立许可**，仓库所附文本将生产环境排除在默认授权之外，并规定不得绕过密钥限制；生产使用需满足其另行授权条件。因此可按来源许可评估具体业务代码，但不能把“ComfyArt MIT”推成“tldraw 整套也 MIT”。[MIT LICENSE](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/LICENSE)、[tldraw LICENSE](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/licenses/tldraw-LICENSE.md)
- README 开头的“完全本地/不用账号/不上云”只能理解为某种本地配置能力；同一 README 已有 Cloud 和外部 Agent 选项。实际使用哪个服务由配置与 workflow 决定；模型权重、插件、字体、素材的许可应分别核对，MIT 不覆盖它们。[README.zh.md](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/README.zh.md)
- 本次选中的八项均找到实际实现，不归为“仅计划”。未做运行验证的能力应标为“代码已实现、待集成验证”，不写“已实测可用”。宣传截图的用途仅为理解作者预期界面，不承担产品验收证据。

研究完成时未修改现有工作区，未安装/启动 ComfyArt，未调用生成模型、付费服务或发送外部消息。唯一文件产物为本 Markdown。

