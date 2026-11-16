> 历史只读审查：随后用户授权替换，本地现已运行本文对应的 v0.20.0。以下“未部署/先并行”的表述保留为当时记录，当前状态见 [升级及 ComfyArt 报告](2026-11-09-upgrade-and-comfyart-plan.md)。

# infinite-canvas 更新与体验审查

审查日期：2026-11-09。范围：`wangxiye111/infinite-canvas` 固定提交 `854bd86dbfabb72711368c8de7ca16ab39aa9019`。只读检查公开文档和前端源码；没有安装依赖、启动此项目、操作用户数据或进行浏览器实测。下文“已有”指静态实现或作者记录，不代表已经完成运行验收。

## 结论

这个 Fork 已包含上游当前代码；不能把它当作本地 Python 画布的直接新版升级包。围绕“界面与画布操作体验”，建议先改善触控板操作、批量排版与撤销可靠性，再做保存反馈及导入校验。现成的撤销重做、搜索、多选、分组、缩略图和小地图应先利用，无需重新开发。

- 固定提交比较结果：Fork 比上游 `9cd3deacbcc598361807afc16c059a80dd18b6f9` ahead 1、behind 0；唯一差异是 README 删除 100 行，没有未同步的上游代码。[固定提交比较](https://github.com/wangxiye111/infinite-canvas/compare/9cd3deacbcc598361807afc16c059a80dd18b6f9...854bd86dbfabb72711368c8de7ca16ab39aa9019)
- 产品版本是 **v0.20.0**，更新日志日期为 **2026-10-10**。构建从根目录 VERSION 注入版本号；`web/package.json` 中的 0.1.0 是另一处包元数据，不能用来判断产品版本。来源：[VERSION](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/VERSION)、[构建配置](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/vite.config.ts#L10)、[CHANGELOG](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/CHANGELOG.md#L5)、[package.json](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/package.json#L3)。
- 架构为 React / Vite 前端；README 描述浏览器直连用户配置的模型接口，并支持自定义调用脚本。来源：[前端依赖与命令](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/package.json)、[项目功能](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/README.md#L32)。

## 当前已经具备的交互

版本检查入口会读取 basketikun 上游的 VERSION 和 CHANGELOG 并显示结果；其实现不包含自动安装或替换应用代码。来源：[版本检查实现](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/hooks/use-version-check.ts)。

| 能力 | 已见实现与边界 | 固定源码 |
|---|---|---|
| 撤销 / 重做 | 有独立 past / future 栈、工具栏按钮及 Ctrl/Cmd+Z、Shift+Z、Y；并非只有撤销。历史在页面内维护，约最多 50 个 past 快照。 | [历史记录](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/project.tsx#L490)、[Undo / Redo](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/project.tsx#L1172) |
| 视图导航 | 拖拽平移、中键平移、选择/移动模式切换、光标中心缩放；滑杆范围 5%–500%；小地图与重置视图。 | [视图事件](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/infinite-canvas.tsx#L86)、[缩放工具](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-zoom-controls.tsx#L28) |
| 找节点 | 元素面板按标题、正文、提示词搜索，按类型筛选；树形分组、列表/缩略图切换，点击聚焦。 | [元素面板](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-side-panel.tsx#L143) |
| 选择与连线 | 框选、修饰键追加选择、全选、复制粘贴；连线有 16 单位透明命中区域、选中高亮及右键菜单。 | [键盘操作](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/project.tsx#L1582)、[连线组件](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-connections.tsx#L33) |
| 分组与组织 | 多选虚线范围框、打组/解散组；拖入拖出组、组引用资源。不是完整排版工具。 | [多选工具](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-selection-toolbar.tsx)、[组几何逻辑](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-node-geometry.ts) |
| 多媒体与性能 | 作者日志记载 WebP 缩略图、连线视口裁剪、拖拽按帧更新；视频任务 ID 恢复查询。尚未测量本机帧率或验证提供方接口。 | [v0.19 / v0.18 日志](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/CHANGELOG.md#L23) |

v0.20 还已有居中聚焦、选中自动居中开关、元素缩略图、复制时保留参考连线，以及修正视口尺寸测量。这些不能再被列作该 Fork 的“缺失功能”。来源：[v0.20 更新](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/CHANGELOG.md#L5)。

## 六项值得继续更新的地方

### 1. 优先：触控板平移与捏合缩放分开

**静态事实：** `handleWheel` 把所有画布滚轮事件的 deltaY 都用于缩放，没有按 ctrlKey 区分捏合，也没有利用 deltaX 平移；鼠标拖动平移已经存在。来源：[滚轮处理](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/infinite-canvas.tsx#L86)。

**建议：** 增加“鼠标 / 触控板”偏好；触控板双指移动负责平移，捏合负责缩放，保留鼠标滚轮缩放方案。验收应覆盖 Mac 触控板、鼠标、光标锚点及浮层内部滚动。当前属于源码行为判断，未实测手感。

### 2. 优先：把批量整理补完整

**静态事实：** 当前多选浮层只提供打组/解散组；上下文菜单主要是复制、删除、分组及视频截帧。已检查的这些入口未提供对齐、等距分布或自动整理；节点类型也没有正式的锁定字段。组吸附已有，不能与网格/对齐吸附混淆。来源：[多选浮层](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-selection-toolbar.tsx)、[右键菜单](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-context-menu.tsx)、[节点类型](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas.ts)、[组吸附](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-node-geometry.ts#L21)。

**建议：** 先加左/中/右和顶/中/底对齐、水平/垂直等距分布，再加节点锁定与可关闭的参考线吸附。对素材对比、分镜、HMI 方案排版，比继续增加入口更直接。

### 3. 优先：验证快速撤销的操作边界

**静态事实：** 历史提交延迟 180ms；Undo 直接取 `lastHistoryRef`，没有先提交等待中的最新变更，applyHistory 又会清掉等待定时器。来源：[防抖提交](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/project.tsx#L490)、[历史恢复与撤销](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/project.tsx#L1150)。

**风险推断，未运行复现：** 修改后立即按撤销，可能没有撤销入口，或跳过尚未入栈的新状态，影响之后重做。建议按拖拽结束、粘贴、删除等用户动作提交事务，并在 Undo/Redo 前处理待提交变更。验收重点是“编辑后 180ms 内撤销”“连续拖拽后重做”“撤销后再编辑”，不是重做功能从无到有。

### 4. 次优先：让保存状态可见且可恢复

**静态事实：** 画布持久化层延迟 400ms 后用 void 调用写入；该层没有将成功或最终失败暴露为保存状态。底层已有 localForage 失败后回退 localStorage，因此不能说完全没有降级。来源：[持久化队列](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/stores/canvas/use-canvas-store.ts#L40)、[存储降级](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/localforage-storage.ts)。

**建议：** 显示“保存中 / 已保存 / 保存失败重试”，对关闭或切换前仍待提交的修改提供一致处理，并保留可导出的恢复副本。现有延迟写入存在关页时丢失最后变更的待验证窗口；本次没有模拟浏览器关闭或存储配额耗尽。

### 5. 次优先：导入导出先做完整性检查

**静态事实：** 导入 ZIP 时只读取 projects.json 并进行类型断言，未在此入口检查 app/version 或项目结构；缺少某个资源文件时直接跳过，之后仍显示导入成功。导出找不到本地 Blob 时也直接跳过。来源：[导入入口](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/pages/canvas/index.tsx#L40)、[导出实现](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-export.ts#L12)、[格式 v3](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas-export.ts)。

**建议：** 导入前显示版本、项目数、资源数、缺失项；完整成功与部分成功分开提示；对未知版本给出明确原因。迁移旧画布前，这比只改图标和颜色更能避免“导入成功但图片丢失”。

### 6. 低成本：把帮助和视觉细节更新到当前行为

**静态事实：** 节点手册仍教用户点击文本顶部“生图”，而 v0.16/v0.17 日志已经记录移除相关入口；手册的多图描述也与 v0.15“可展开单节点”不同。快捷键弹窗缺少源码已支持的撤销/重做、全选及 Escape；多选工具条使用固定白底和深色字，未沿用其已经读取的主题配色。来源：[当前手册](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/docs/content/docs/canvas/canvas-node-manual.zh-CN.mdx)、[行为变更记录](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/CHANGELOG.md)、[快捷键弹窗](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-zoom-controls.tsx#L66)、[多选条样式](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/components/canvas/canvas-selection-toolbar.tsx#L62)。

**建议：** 先统一真实操作、中文手册和快捷键弹窗，再将多选工具条接入浅/深色主题。文字更新可静态核对，视觉效果仍须浏览器验收。

## 作者计划与本次建议的区别

当前 TODO 文档只列两类后续：Claude Code CLI Adapter 改为 Claude Agent SDK Adapter并完善工具队列；Skill 网络检索安装、资源文件管理及可控本地记忆。它们是作者计划，不能说已经实现，也不是作者承诺会做上面的六项界面更新。来源：[中文 TODO](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/docs/content/docs/progress/todo.zh-CN.mdx)、[英文 TODO](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/docs/content/docs/progress/todo.mdx)。

## 与现有 Python 画布并行采用的迁移缺口

以下是迁移建议，不是兼容性承诺；没有读取旧画布的 data、assets、.env 或个人模型配置。

1. **项目与素材格式要转换。** 新项目使用浏览器 localForage 持久化，以及包含 projects.json、CanvasProject、资源 storageKey 的 ZIP v3。不能把旧 Python 服务目录或 JSON 直接当成这个格式。应先用不含敏感内容的一个样本转换，核对位置、尺寸、连线、分组、提示词、媒体与生成元数据，再扩大范围。来源：[项目结构](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/stores/canvas/use-canvas-store.ts#L10)、[导出结构](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas-export.ts)、[导出资源](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/lib/canvas/canvas-export.ts)。

2. **ComfyUI / RunningHub 需要单独适配验证。** 已检查的一手描述与模板以 OpenAI/Gemini 请求及自定义调用脚本为入口；这不能证明旧工作流 JSON、参数映射、任务 ID 或上传协议可直接复用。应按每个旧工作流验证“上传→参数→提交→查询→结果回填→失败重试”，然后决定是脚本适配还是保留旧服务桥接。来源：[接口说明](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/README.md#L35)、[自定义调用与模板](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/services/api/model-plugin.ts)、[视频任务元数据](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/web/src/types/canvas.ts#L81)。

3. **接入方式与存储位置需要重新梳理。** 新画布 README 声明浏览器前台直连接口；它与旧 Python 后端代发请求的部署方式不同。需要逐个验证跨域、本地代理、资源可达性和导出恢复，不应复制旧凭据后即宣称完成迁移。来源：[连接方式](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/README.md#L35)、[本地代理说明及版本记录](https://github.com/wangxiye111/infinite-canvas/blob/854bd86dbfabb72711368c8de7ca16ab39aa9019/CHANGELOG.md#L34)。

建议先并行试用该 Fork，用一个真实但不含敏感信息的小项目验证画布手感和必要生成链路；确认后再决定替换旧画布还是只移植交互能力。本次没有执行升级、迁移或部署。

