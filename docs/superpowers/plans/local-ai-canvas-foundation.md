# 本地 AI 画布第一批实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 逐项执行；已由用户授权按 PRD 开发，不重复需求确认。

**Goal:** 让平台连接、RunningHub 配置及任务恢复成为下一批统一图片／视频节点可复用的可靠基础。

**Architecture:** 沿用现有 `canvas-connectors` 和 React／Zustand。平台配置留在本机服务，工作流业务配置留在既有预设 store；查询与下载只恢复原任务。

**Tech Stack:** Node.js、React、TypeScript、Ant Design、Zustand、localforage。

**Spec:** `docs/superpowers/specs/local-ai-canvas-prd.md` 1.2，主要对应 F01、F02、F07、F09 的基础部分。

## 全局约束

- 保留当前工作区改动，在现有开发分支增量修改；不提交、合并、发布或运行付费任务。
- 不检查语法、不运行构建；运行有实际行为断言的离线测试，不用源码字符串测试冒充 UI 验收。
- 不新增或调整并发、超时、重试次数、大小限制；保留已有查询节奏。
- 不改变个人 GPT／Google 既有登录与默认模型，不自动付费兜底。
- 可灵、即梦、RunningHub 使用具体名称；首次配置说明有操作位置、步骤及成功结果。
- 现有主题与扁平按钮优先；不新增全局 CSS。
- 首批 RunningHub 清单仍为空。可配置不等于试运行通过，不实现虚假发布成功。

## Review Focus

- 用户指定的 CLI 不存在时不能偷偷改用 PATH 中另一账号工具。
- 查询失败与结果下载失败不能标成提交失败或触发重新生成。
- 多结果只保存了一部分时，重开恢复应保留已有文件并避免重复下载相同输出。
- 工作流映射冲突、重复角色或不合法参数类型必须在保存前指出，不能静默覆盖。
- 现有 JSON 预设不能在打开表单时丢字段；超出当前可视化字段范围时保留高级 JSON 编辑。

## Task 1：平台连接引导

**Files:** `canvas-connectors/src/runtime.mjs`、`providers/cli.mjs`、`providers/runninghub.mjs`、`server.mjs`；`web/src/components/connectors/connector-manager.tsx` 及同目录接入卡片；`canvas-connectors/test/providers.test.mjs`、`windows-cli.test.mjs`。

**Interfaces:** CLI 配置增加非敏感 `executable`；`ctx.which(name, executable?)` 和 `ctx.runCli(name,args,{executable?})` 支持显式路径。空路径继续自动发现。配置、检查、登录和生成使用同一路径。

- [x] 离线测试显式路径、错误路径不回退、Windows 带空格路径及参数传递。
- [x] 接入路径贯穿状态、检查、授权、生成和查询；可灵仍验证国内官方包身份。
- [x] 接入卡片按平台给出安装／打开设置、登录或填写 Key、保存并检查、下一步创建预设的步骤；刷新安装检测不复用过时结果。
- [x] 修正 RunningHub 会员积分说明，余额未知不写成零；区分连接检查和生成验证。
- [x] 运行受影响离线测试。

## Task 2：RunningHub 可视化工作流配置

**Files:** `web/src/lib/connectors/runninghub-preset.ts`；`web/src/components/connectors/runninghub-preset-fields.tsx`、`connector-manager.tsx`、`connector-task-node.tsx`；`web/tests/runninghub-preset.test.ts`。

**Interfaces:** `parseRunningHubParams(params)` 读取既有映射为表单或抛错；`buildRunningHubParams(fields)` 返回当前适配使用的 `nodeInfoList/promptTarget/inputTargets/outputKind`；`runningHubInputRoles(preset)` 提供角色选项。纯函数以测试验证双向转换和冲突拒绝。

- [x] 测试提示词、参考素材、固定参数、输出类型往返；非法 JSON 值、重复角色、同字段冲突拒绝；未知字段拒绝可视化转换而保留高级编辑。
- [x] 为 RunningHub 添加表单模式，仍允许高级 JSON；在两种模式间显式转换，不静默删除字段。
- [x] 任务节点按已配置角色提供选项；显示具体工作流名称及计费来源。
- [x] 运行纯函数测试，保留真实工作流试运行与发布同步待办。

## Task 3：查询、保存与恢复状态

**Files:** `canvas-connectors/src/jobs.mjs`；`web/src/services/api/connectors.ts`、`local-cli.ts`；平台任务节点与任务列表；`canvas-connectors/test/service.test.mjs`。

**Interfaces:** 增加 `saving`、`save_failed`、`query_failed` 状态；保存结果按源标识摘要记录已归档输出，查询成功后复用相同来源的本地文件。服务重开保留下载失败状态及原任务 ID，不重新提交。

- [x] 测试查询失败保留原 ID、下载失败与查询失败分离、多输出部分下载重开后只补缺失文件、同时查询不重复保存。
- [x] 保存每个已下载结果，暴露保存状态；恢复时只查询原任务，失败保留已有文件。
- [x] 所有平台／本地 CLI 客户端识别新增状态；查询／下载失败提供明确恢复动作，禁止未确认取消。
- [x] 运行连接服务测试及相关前端行为测试；不运行构建与类型检查。

## 收尾与后续批次

- [x] 独立代码审查本批实际变更，修复重要问题。
- [x] 更新 todo、pending-test（中英）与 CHANGELOG；不提前写入已验收功能说明。
- 下一批：统一图片／视频节点能力选择、候选与历史、参考角色和手动生成。
- 后续：本地项目目录与分享、工作流试运行／发布／启动同步、创作助手收敛、双系统打包与实账号验收。
- 即梦首尾帧：官方 Skill 只确认命令名，精确 flags 要以本机 `frames2video -h` 为准；取得真实帮助后再实现，不猜参数。

## 执行记录

- Ruling：按已确认 PRD 直接执行首批基础工作，不重复审批；现有分支含用户大量未提交实现，保留并增量修改，不创建丢失这些改动的新工作树。
- Ruling：首次安装走官方入口和明确指引，允许配置已安装工具路径；本批不静默安装软件、不复制网页登录会话。完整安装包集成仍属后续验收。
- Ruling：即梦首尾帧先保留缺口，官方在线 Skill 要求本机帮助为准，当前没有可供核验的 CLI；不能用猜测的参数做成假支持。
- Task 1：完成。显式工具路径、安装重新检测、接入步骤、保存后检查与会员计费说明已实现；真实安装和授权仍待用户环境验收。
- Task 2：完成。RunningHub 表单／JSON 切换、类型转换、冲突校验、角色选择与上传前校验已实现；清单仍为空，不声称工作流试运行或发布完成。
- Task 3：完成。区分查询和保存阶段、保留逐个已下载文件、重开恢复、保存期间不取消远端任务；未新增重试节奏。
- Final review：独立审查指出高级 JSON 绕过冲突检查、旧保存失败状态影响新查询错误分类。均补充失败用例后修复并通过，前后端都拒绝重复目标映射。
- 验证：连接服务全套 130 项通过、1 项原有 Windows 符号链接权限跳过；相关前端行为测试 13 项通过。未运行构建、类型／语法检查、浏览器界面验收或真实生成。
- Ruling：审查未判断真实平台下载 URL 是否变化、恢复时结果列表是否完整。本批按平台当前返回的结果来源复用已归档文件；真实返回契约与签名链接变化仍需平台验收，不能把模拟测试当作这些行为已验证。
- Ruling：保留当前用户工作区，不自动提交／合并／发布；没有重启用户正在使用的应用。界面需用户按现有启动方式加载新代码后验收。
