# 当前升级结果与 ComfyArt 借鉴建议

## 升级结果

已将当前 canvas 目录切换为用户指定的 wangxiye111/infinite-canvas 最新 main：

- 产品版本：v0.20.0；提交：854bd86dbfabb72711368c8de7ca16ab39aa9019。
- 本地入口：[打开新版画布](http://127.0.0.1:3000/canvas)。
- 原目录：[local path omitted] coding/canvas。
- 完整旧版备份：[local path omitted] coding/canvas-backup-20261109-013025。
- 当前服务 PID：84398；日志：logs/canvas-service-20261109.log。
- 新源码保持原提交；新增文件只有运行日志、研究报告与部署记录。没有推送 GitHub、创建发布或移植 ComfyArt 功能。

旧版是 hero8152/Infinite-Canvas 的 Python 服务，新版是 basketikun 系的 React 前端。这是用户确认后的整套替换；旧代码、本地修改、素材、数据和配置随原目录完整保留。旧项目、旧接口配置和凭据没有自动导入，新页面显示空画布库属于预期。新项目和素材主要保存在浏览器本地，使用时应固定同一浏览器和访问地址；localhost 与 127.0.0.1 是不同的浏览器存储来源。

### 已验证与边界

- 按仓库 Bun 锁文件安装依赖；Bun 1.3.13，Node 24.20.0。
- Vite 构建成功；上游有大 chunk 和混合动态/静态 import 提示，未因此失败。
- 隔离的 3001 测试页完成：新建画布、添加文本节点、撤销、重做。
- 切换后 3000 的首页、画布页、配置页、JS 和 CSS 均 HTTP 200；独立浏览器页面显示 v0.20.0 与画布库，视觉加载正常。
- 未调用图像/视频模型，没有验证 AI 生成、ComfyUI、Agent 或旧数据迁移；新页面 Agent 为未连接。
- 当前为 npm start 对应的本地 Vite preview 服务，没有设置开机自动运行。
- 检查了项目 todo/pending-test：本次部署既有源码，没有新增功能或关闭已有待测项，因此无需改动产品进度文档。

后续手动启动（当前服务已经运行，无需重复启动）：

```sh
cd '[local path omitted] coding/canvas/web'
npm run start
```

回退原则：先停止经核对确属本项目的 3000 服务，保留整个新版目录，再把备份目录恢复到原来的 canvas 路径，然后运行旧版 .venv/bin/python -u main.py。旧虚拟环境含原路径引用，不能把“在备份目录直接启动”当作可靠回退办法。回退前也应导出新版浏览器中的项目；目录备份不等于浏览器数据备份。

## ComfyArt 值得借鉴的实际差异

调研固定在 ComfyArt main 提交 406ae8624e8a2babccb35a7006af021b15b33837；其最近 Release 为 v1.2.1，main 已有之后的提交。下表是源码对比与实施建议，未安装运行 ComfyArt，也未验证其生成质量。

| 顺序 | 建议增加的能力 | 当前新版已有能力 | 真正可补的体验 | 相对工作量 |
|---|---|---|---|---|
| 1 | 图层隐藏、锁定与层级整理 | 元素树、搜索、缩略图、分组、拖入拖出组、点击定位 | 在树里隐藏/锁定对象、明确拖动落位和层级顺序；辅助增加多选对齐/等距分布 | 中；需贯穿选择、拖动、存储与撤销 |
| 2 | 无损本地调色 | 裁剪、缩放、图片操作工具栏及工具定制 | 曝光、对比、饱和度、色温；按住看原图；重开继续调、重置恢复原图 | 算法小，完整体验中 |
| 3 | 更好用的局部选择 | 画笔、橡皮、遮罩撤销/重做、编辑指令 | 矩形、套索、羽化/反选；后续加入 SAM 智能选区和绑定区域的评论 | 基础选区中；SAM 需后端模型 |
| 4 | 项目参考套件 | 我的资产、提示词、节点/组引用 | 品牌/车型/角色/产品套件，关联颜色、字体、参考图片及“风格/构图/内容”角色 | 中 |
| 5 | ComfyUI 自定义工作流 | OpenAI/Gemini 等接入及自定义调用脚本、节点插件 SDK | 导入 API 格式工作流、绑定图片/提示词/遮罩、排队/进度/取消、刷新恢复、结果回画布 | 中，依赖真实 ComfyUI 验证 |
| 6 | 分层导出或成图元素重建 | 项目 ZIP、素材与网格切图 | 图片层 PSD；后续 OCR 文字层、主体分割与背景修补 | 图片 PSD 中；元素重建大 |

第 1 项的图层交互可参考 [ComfyArt LayersPanel](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/LayersPanel.tsx)，但不能直接照搬 tldraw 的 Editor 操作。多选对齐/分布是针对本项目的补充建议，不宣称 ComfyArt 已具备完整 Figma 排版系统。目标证据：[元素侧栏](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-side-panel.tsx)、[节点类型](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas.ts)、[多选工具栏](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-selection-toolbar.tsx)。

第 2 项可抽取 [adjust.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/adjust.ts) 的像素处理，参考 [imageOps.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/imageOps.ts) 的原图和参数保存，面板接入现有 Ant Design/主题。当前目标已具备 [图片工具定制数据](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-image-toolbar-tools.tsx)，不能再把“选中后浮现工具栏/显示常用工具”整体列为缺失功能。

第 3 项参考 [InpaintPanel](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/InpaintPanel.tsx) 和 [CommentPanel](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/CommentPanel.tsx)。目标已有 [mask dialog](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-node-mask-edit-dialog.tsx) 的画笔、橡皮、历史，应该扩展其选择方式。评论驱动编辑是画布内区域反馈，不等于多人实时协作。

第 4 项参考 [library.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/library.ts)、[KitEditor](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/ui/KitEditor.tsx) 和 [refModes.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/refModes.ts)。针对本用户，可以把车型图片、虚拟助手、字体、配色和界面参考组成一套。角色提示是软约束；是否提高生成一致性需要真实素材验收。

第 5 项最适合复用 [customMarkers.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/customMarkers.ts)、[comfy.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/comfy.ts) 的解析和协议逻辑；[jobs.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/jobs.ts) 大量依赖 tldraw，任务存储及结果落位必须按目标重写。普通 UI 工作流 JSON 与 API graph 不同，不能承诺任意 JSON 都可直接导入。

第 6 项参考 [psd.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/psd.ts) 与 [elements.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/elements.ts)。PSD 是栅格分层；OCR 和分割只是近似重建，不能恢复源设计文件的原字体、矢量、约束和精确图层。

## 建议的升级顺序

按用户“界面与画布操作体验”优先：

1. **先做整理与操作反馈。** 图层隐藏/锁定、拖动落位、多选对齐分布；补保存中/成功/失败提示。另根据既有审查优化 Mac 触控板平移与捏合缩放。保存反馈可参考 ComfyArt [autosave.ts](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/src/autosave.ts)；触控板行为是目标自身问题。
2. **再做轻量图像编辑。** 保留原图的调色、矩形/套索选区、羽化与反选。保留当前工具栏定制，新增工具嵌入已有入口。
3. **再做工作流能力。** 先接一台 ComfyUI、一个用户常用的图片编辑 API 工作流，跑通上传、提交、进度、取消、恢复、结果回画布；然后加入参考套件。
4. 3D 查看器、图生 3D、视频时间线与完整画板体系独立评估，避免把一次体验升级扩成几个大编辑器。

如果使用本地 ComfyUI 是新版投入日常工作的前提，则把第 3 步中的单工作流闭环提前；这不影响第 1、2 步独立交付。

### 首批验收标准

- 隐藏/锁定：锁定节点不会被拖动或误删，仍可在图层树中解锁；隐藏状态在刷新/导出导入后保持；一组整理操作能一次撤销。
- 调色：取消不写入；多次打开不累计烘焙；按住看原图；应用可撤销；透明通道保留；导出再导入仍能恢复原图继续调。
- 选区：缩放和平移后遮罩对准原图；追加/擦除/撤销一致；框选、套索、羽化不误改选区外像素，生成结果另存并保留来源。
- ComfyUI：标记错误在提交前指出；缺节点/模型给可读错误；页面刷新不重复提交；取消区分排队/运行；结果存为本地 Blob，关闭 ComfyUI 后仍可看；ZIP 保留输入、输出与实际 seed。

以上都是后续开发验收要求，本次尚未实现。

## 移植边界

- ComfyArt 主体为 MIT，可按许可复用其自有业务代码并保留版权声明；tldraw 有独立生产授权条件。建议沿用现有画布引擎，抽取算法/工作流适配层，重写 UI 和状态绑定。[ComfyArt LICENSE](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/LICENSE)、[tldraw 条款](https://github.com/jtydhr88/ComfyArt/blob/406ae8624e8a2babccb35a7006af021b15b33837/licenses/tldraw-LICENSE.md)。
- ComfyArt 是 tldraw + ComfyUI Python 扩展；目标是自定义节点 + Zustand/localForage。不能把其 React 组件或 /comfyart 路由原样复制即视为接入完成。
- 新媒体必须写入目标资产存储。目标导出/回收递归识别字段名 storageKey；保留调色原图宜采用 source: {storageKey}，避免漏导出或误回收。插件私有存储不会自动进入项目 ZIP。
- 种子要保存实际提交值。ComfyArt 的工作流填充有随机化 seed 逻辑，直接复制后不能宣称结果可复现。
- 接入工作流还依赖 ComfyUI 节点包、模型与算力；项目代码 MIT 不代表所有依赖、模型权重和素材许可相同。

## 详细证据

- [ComfyArt 八类功能核查](2026-11-09-comfyart-features.md)
- [五模块技术可移植性与验收](2026-11-09-comfyart-portability.md)
- [本次部署清单](2026-11-09-upgrade-manifest.json)
- [升级前对目标 Fork 的源码审查](2026-11-09-wangxiye-infinite-canvas-review.md)：这是当时的只读审查记录；其中“尚未部署”的状态由本报告更新。

