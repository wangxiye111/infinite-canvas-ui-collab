# 本地平台连接服务

为画布增加可灵国内站、即梦独立 CLI、RunningHub、Tripo 国内站和 Liblib.art 的连接入口、任务预设及结果导入。仅监听本机 `127.0.0.1`。

同时提供 Codex、Gemini、Antigravity 的本地 CLI 配置、文本生成渠道和 Agent 入口。

## 启动

运行需要 Node.js 22 或更新版本；从源码构建网页还需 Bun。首次从源码启动，在项目根目录准备依赖和构建文件：

```sh
npm ci --prefix canvas-connectors
npm ci --prefix canvas-agent
npm run build --prefix canvas-agent
cd web
bun install
bun run build
cd ..
```

Windows 完成准备后双击根目录的 `start-windows.cmd`，它会同时启动网页/连接服务和对话 Agent。其他系统先运行：

```sh
npm start --prefix canvas-connectors
```

需要右侧 Codex 对话时，再另开终端，在项目根目录运行 `npm start --prefix canvas-agent`。

打开 [本地画布](http://127.0.0.1:3000)。可通过 `CANVAS_CONNECTORS_PORT` 指定端口、`CANVAS_CONNECTORS_DIST` 指定网页构建目录、`CANVAS_CONNECTORS_HOME` 指定服务数据目录。

### Windows 迁移

在 Windows 重新安装依赖，不复用 macOS 的 `node_modules`。已有 `web/dist` 与 `canvas-agent/dist` 可直接运行，不必为迁移重复构建：

```powershell
npm ci --prefix canvas-connectors
npm ci --prefix canvas-agent
.\start-windows.cmd
```

根目录双击 `start-windows.cmd` 也可启动：使用 PATH 中的 Node.js，或本机 Codex 自带的 Node.js，后台运行网页/连接服务（3000）和 Agent（17371）。不修改 PowerShell 执行策略；端口已有进程时保留现状，启动日志在 `%USERPROFILE%\.infinite-canvas\logs`。提示 launched 只表示进程已启动，仍需打开网页确认。

CLI 自动检测支持 Windows `.exe`、`.cmd`。官方 npm 的 JS 入口可传递中文、多行提示词；普通 CMD 客户端遇到多行参数会在执行前明确拒绝。取消会结束本次本地进程树，不代表远端退费。

源码目录不包含浏览器内的画布、素材和渠道配置；旧电脑需通过画布 ZIP、配置导出/导入恢复。官方 CLI 的安装和登录也需在新电脑分别确认，不能沿用 Mac 的绝对路径。

## 使用

1. 画布右上角「画布设置与更多」→「平台连接」中登录官方 CLI 或保存 API 凭据，再点击检查连接。配置成功不保证账户有额度。
2. 图片／视频节点底部直接选择已连接的可灵或即梦模型，通过「参数」调整选项。RunningHub 在「任务预设」填写工作流/应用 ID、业务参数和输入映射；预设不保存密钥。
3. 连接参考素材后手动生成，结果回到原节点候选与历史。特殊工作流可使用「扩展节点」→「平台任务」。源码预览见 `docs/content/docs/progress/platform-node-preview.zh-CN.mdx`；端口 3000 的打包页面需构建更新后才包含源码修改。

「扩展节点」→「3D 模型」可导入资源内嵌的 GLB，切换交互后旋转、缩放；截图会成为普通图片节点。模型与截图使用现有本地素材库并随画布 ZIP 导出。

## 本地 CLI

生图流程：**画布 → 本地连接服务 → 本机 Codex 或 Antigravity → 图片返回画布**。

「渠道」是一组连接配置，API 和 CLI 都属于渠道：API 渠道填写接口地址和 API Key；CLI 渠道使用本机工具的登录状态。「GPT 生图（本机 Codex）」对应 CLI 渠道。

首次使用按下面三步完成。以下以 Codex 为例，它支持对话和 GPT 生图。

### 1. 安装工具并登录

按照 [Codex 官方安装说明](https://developers.openai.com/codex/cli/)安装。电脑已有 Node.js 时，可打开终端运行：

```sh
npm install -g @openai/codex
codex login
```

在打开的浏览器中登录 ChatGPT 账号。完成后运行 `codex login status`，显示 `Logged in using ChatGPT` 就表示登录成功；运行 `codex` 可进入终端对话界面。[登录命令说明](https://developers.openai.com/codex/cli/reference/)

### 2. 启动本地服务，检测并连接到画布

首次从源码启动，先完成上方[启动](#启动)中的依赖安装和构建准备；已有构建文件的迁移项目按 [Windows 迁移](#windows-迁移)准备即可。

Windows 双击项目根目录的 `start-windows.cmd`，它会一起启动连接服务和对话 Agent。其他系统在两个终端中分别运行 `npm start --prefix canvas-connectors` 和 `npm start --prefix canvas-agent`。

打开 [本地画布配置](http://127.0.0.1:3000/config)，进入「本地 CLI」，选择「Codex CLI」，点击第 2 步的「检测并配置」。

**成功标志：** 页面显示「已设为生图默认」，出现「前往生图工作台」按钮，图片模型列表中增加「GPT 生图（本机 Codex）」。

若提示本地服务未连接，启动服务后点击「服务已启动，重新连接」。若提示找不到 Codex，展开「高级设置 · 手动指定安装路径」，填写完整可执行文件路径，点击「保存路径」后再点「检测并配置」；其它检测原因见「连接详情」。

### 3. 选择生图或对话入口

| 要做什么 | 从哪里进入 | 成功后看到什么 |
| --- | --- | --- |
| 在画布生图 | 打开画布图片节点，模型选择「GPT 生图（本机 Codex）」，输入提示词并点击「生成」。 | 生成的图片显示在画布中。 |
| 在工作台生图 | 点击「前往生图工作台」，确认同名模型，输入提示词并点击生成。 | 图片显示在工作台结果区。 |
| 与 Codex 对话 | 回到「配置 → 本地 CLI」的第 3 步，点击「连接并对话」，在右侧助手输入需求并发送。 | 助手显示连接状态，并在对话中返回回复。 |

图片生成由本地连接服务调用 Codex；右侧 Codex 对话由独立的 `canvas-agent` 服务处理。第 2 步已启动两项服务，直接使用即可。需要手动连接时，在「高级设置」点击「手动地址 / Token」。

### Gemini 生图：连接 Antigravity

1. 按 [Antigravity 官方说明](https://antigravity.google/docs/getting-started?tab=cli)安装 Antigravity CLI。在「配置 → 本地 CLI」选择「Antigravity CLI」，点击「登录 Google」，在官方页面登录自己的 Google 账号；完成后回到画布点击「检查登录状态」。已在本机 Antigravity 登录的用户可以直接继续。
2. 点击「检测连接」。连接成功后点击「添加 Gemini 图片模型」。添加后保留原来的默认图片模型。
3. 在生图工作台或画布图片节点的模型列表中选择「Gemini 生图（本机 Antigravity）」，填写提示词并生成；也可以在同一列表切回「GPT 生图（本机 Codex）」。

检测不到工具时，展开「高级设置 · 手动指定安装路径」，填写 `agy.exe`（Windows）或 `agy` 的完整路径，保存后再检测。登录和连接错误的具体原因可在折叠的详情中查看。

Gemini CLI 的入口用于对话。按 [Gemini 官方说明](https://geminicli.com/docs/get-started/)安装并运行 `gemini` 登录，回到页面检测后点击「开始对话」。Antigravity 也保留对话入口；画布修改提案需点击「应用到画布」后执行。

GPT 和 Gemini 的本机图片入口使用各自官方工具的图片能力。界面名称不承诺图片引擎的具体版本：Codex 的任务模型、Antigravity 的会话模型与实际图片模型不是同一字段。需要固定 API 图片模型版本时，应另行配置对应 API 渠道。

### 开发与任务恢复

| 项目 | 当前实现 |
| --- | --- |
| 图片调用 | Codex 使用原生 `image_generation`，单次最多 5 张参考图；Antigravity 使用受控的图片主代理调用原生 `generate_image`。尺寸、质量、张数作为生成要求，实际输出以返回图片为准。 |
| 模型映射 | `codex-image-default` 与 `antigravity-image-default` 是前端入口别名。Codex 的任务模型从官方 `model/list` 选择；两种别名都不代表实际图片模型的版本。 |
| CLI 路径 | 自动查找服务数据目录的 `tools/node_modules/.bin`、Antigravity 的 `tools/antigravity`、用户的 `~/.local/bin` 和 PATH；Windows 支持 `.cmd`、`.exe`，也可手动填写完整路径。 |
| 对话运行时 | Codex Agent 使用自身运行时；「本地 CLI」中保存的路径用于生成渠道。 |
| 结果保存 | `cli-results/<任务ID>` 保存运行记录和输出。「本地 CLI」任务列表可查询、读取、下载结果，已保存结果在服务重启后仍可读取。 |
| Antigravity 文件返回 | CLI 1.5.6 的 ACP 返回工具状态，图片由同一原生会话的结构化媒体记录定位；按会话目录、工具调用和创建时间校验，再完整解码保存。升级 CLI 后若媒体结构变化，需重新验证此适配。 |
| 中断恢复 | 执行中服务中断的任务显示「待核查」。按已记录的线程 ID 核对 `$CODEX_HOME/generated_images/<线程ID>`，再手动导入完成的图片。刷新与恢复只读取原任务。 |

## 首期界面与后续平台

当前提示词库入口、首页推荐和后台请求通过 `web/src/constant/feature-flags.ts` 的 `PROMPT_LIBRARY_ENABLED=false` 暂停，数据和实现不删除；恢复时开启同一开关。用户自己的新提示词沉淀留到后续。

可灵、即梦、RunningHub 保留现有 provider 合约与真实安装/授权状态。ComfyUI 官方是后续独立适配，当前不提供假连接。账号登录、平台权益与生成额度始终分别判断。

## 平台边界

| 平台       | 本版调用路径                                   | 授权要求                                                |
| ---------- | ---------------------------------------------- | ------------------------------------------------------- |
| 可灵国内站 | 官方 `@klingai/cli-cn`，图像/视频生成          | 官方 CLI 登录、个人付费灵感值；不支持全球版 CLI         |
| 即梦       | 官方独立 `dreamina` CLI，生成与最终文件下载    | 可运行的官方客户端及登录；不混用 `dreamina-canvas` 协议 |
| RunningHub | 工作流/AI 应用、上传、查询；工作流支持请求取消 | 对应 API Key、工作流/应用权限及额度                     |
| Tripo      | 国内 `.com` V3 文生/图生 3D                    | 国内 API Key 和 API 额度                                |
| Liblib.art | 已开放 API 参数的 ComfyUI 应用、上传、查询     | Access Key / Secret Key 和 API 权限                     |

各机器的安装情况以「平台连接」检测结果为准；macOS 客户端不能直接复制到 Windows 运行。五平台真实账号授权与付费生成尚未验收，网页会员不能直接视作 API 权益。

## 数据与恢复

默认数据目录 `~/.infinite-canvas/connectors`。连接凭据保存于本机 JSON，未做磁盘加密；POSIX 系统设置目录 0700、文件 0600，Windows 使用用户目录现有 ACL，不承诺 POSIX 权限等效。CLI 令牌由官方客户端管理。原有 OpenAI 兼容渠道仍使用项目原来的浏览器存储方式。

提交前保存 requestId，取得平台任务 ID 后持久保存。刷新只查询同一任务；提交状态不确定时显示中断，不自动重新提交。查询失败可手动刷新。关闭页面后重新打开原任务节点可继续查询。取消仅向支持的远端工作流发出请求，不代表退款。

## 验证

```sh
npm test --prefix canvas-connectors
npm run typecheck --prefix web
```

协议测试使用注入的网络/CLI 响应。原生图片端到端测试使用真实本地子进程执行离线假 CLI，覆盖 HTTP 提交、图片落盘、下载与防重投，不代表真实账号生成验证。GLB 校验测试位于 `web/tests/model3d-validation.test.ts`。
