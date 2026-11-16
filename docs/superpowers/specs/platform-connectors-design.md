# 五平台画布接入：已确认首版

用户已确认范围：新增本地连接服务和五平台入口；优先国内可灵、即梦、RunningHub；Tripo 国内站与 Liblib.art 实现 API 适配，未开通时待连接；支持 GLB 导入与预览。用户主要有网页/App会员，没有已确认 API 额度。

## 产品行为

- 同一画布选择平台与保存的任务预设，连接上游素材，提交后展示真实任务状态并把输出作为普通媒体/3D节点加入画布。
- 五个平台均有明确的连接卡。CLI 未安装、未授权、API未配置与账号检查成功分开显示，不把图标出现当作已连接。
- 可灵使用国内官方 CLI；即梦先兼容官方 dreamina 独立生成 CLI，若只能使用 dreamina-canvas，则按独立画布/节点映射适配，不混用两套命令。真实账户权限需要登录后验证。
- RunningHub 支持会员工作流/AI应用；Liblib 使用独立 AK/SK 的工作流 API；Tripo 使用国内 v3 API，自动生成前需要实际 API 权益。
- 模型与工作流预设保留平台、动作、模型/远端ID、业务参数和输入映射；不含凭据。可以从上游文本/图片/视频取输入。
- 3D节点支持GLB导入、旋转/缩放、下载和当前视角截图。模型二进制使用共享媒体存储，跟随项目ZIP导入导出。
- 不自动充值、不领取活动、不提交真实生成测试。点击生成才开始一个用户任务，失败/超时不自动重投。

## 架构

- 新包 canvas-connectors：Node ESM，本地HTTP服务，仅监听回环地址，同时提供web构建产物和/api/connectors。标准协议/签名使用Node标准库，不引入后台LLM对话依赖。
- 本地凭据和任务放在用户目录的 .infinite-canvas/connectors，受限文件权限；对前端只返回脱敏配置。默认端口3000，可通过环境变量在独立预览端口运行。
- 前端外部调用集中到 services/api/connectors.ts；设置面板、预设、任务节点使用现有主题和节点注册接口。
- 同源服务检查Host与Origin；没有通用shell执行或任意文件读写端点。CLI只允许已知官方命令，参数数组传递。
- GET状态不自动提交任务；POST jobs按requestId去重。记录真实remoteId后才能查询恢复。进程中断且无remoteId的提交标为待核查，不能自动再次提交。
- 结果下载至本地连接服务后，由前端写入现有图片/媒体库。短效远端链接不作为永久项目资源。
- 取消能力逐平台暴露，停止等待不声称取消远端任务。

## 接口契约

所有路径以/api/connectors开头，JSON错误为{error:string}，未知字段不转为shell。

| 路径 | 输入/输出 |
|---|---|
| GET /health | {ok:true,version:string} |
| GET /providers | {providers:ProviderSummary[]} |
| PUT /providers/:id | {config:Record<string,string>}；空secret表示保留已存值；返回脱敏ProviderSummary |
| POST /providers/:id/check | 只读连接检查；返回ProviderSummary，details可含实时模型或余额但不得含凭据 |
| POST /providers/:id/login | 启动已知CLI登录；返回{loginId,status,message} |
| GET /logins/:id | {id,status:running/succeeded/failed,message,url?,code?}；只公开授权指引，不公开token |
| POST /files?name=filename | 原始文件字节与Content-Type；返回{id,name,mimeType,bytes} |
| GET /files/:id | 返回本地文件，仅接受服务生成的id |
| POST /jobs | {requestId,provider,preset,prompt,inputs,canvasId?,nodeId?}；返回Job |
| GET /jobs | {jobs:Job[]} |
| GET /jobs/:id | 已存Job，不提交或隐式重试 |
| POST /jobs/:id/refresh | 查询已有remoteId并保存终态及结果；同任务并发查询合并 |
| POST /jobs/:id/cancel | 仅适配器真实支持时可用；返回Job |

ProviderSummary={id,name,auth:'cli'|'api',state:'not-installed'|'not-connected'|'configured'|'ready'|'error',message,billing,docs,fields:Field[],actions:Action[],config:Record<string,string>,details?:unknown}; Field={key,label,secret?:boolean,placeholder?:string}; Action={id,label,output:'image'|'video'|'model3d',requiresModel?:boolean,requiresRemoteId?:boolean,canCancel?:boolean}。

Preset={id,name,provider,action,model?:string,remoteId?:string,params?:object}；Input={fileId,role?:string}。

Job={id,requestId,provider,preset,prompt,inputs,canvasId?,nodeId?,status:'submitting'|'queued'|'running'|'succeeded'|'failed'|'interrupted'|'cancelled',remoteId?:string,remoteContext?:object,progress?:number,message?:string,outputs:Output[],createdAt,updatedAt}。

Output={id,url,name,mimeType,kind:'image'|'video'|'audio'|'model3d'}；url为本地/api/connectors/files/id，不含账户凭据。

## 适配器契约（服务器模块）

createProviders(ctx) 返回 provider数组。每个provider包含 id,name,auth,billing,docs,fields,actions 与异步方法：

- status(config) -> {state,message,details?}：本地安装/配置状态，不隐式登录。
- check(config) -> {state,message,details?}：只读账号/API能力检查。
- login(config,onMessage) -> Promise<void>：可选；onMessage({message,url?,code?})。
- submit(config,job) -> {remoteId?,remoteContext?,status?,outputs?,message?}：一次真实提交。
- query(config,job) -> {status,progress?,message?,outputs?}：按真实任务ID查询。
- cancel(config,job) -> state：可选，未提供时服务返回不支持。

ctx={fetch:globalThis.fetch,runCli:(executable,args,{onMessage?}?)=>Promise<{stdout,stderr,code}>,which:(name)=>Promise<string|null>,getFile:(id)=>{id,path,name,mimeType,bytes},saveRemote:(url,{name?,kind?,headers?}?)=>Promise<Output>,dataDir:string}。

适配器可以返回远端输出描述{url,name?,mimeType?,kind?}，服务统一下载为Output。config只在服务器传递；不能进入job、日志或check details。不得从prompt构造命令名或shell串。模糊失败不重投。真实远端字段应依官方文档实现，有未验证字段必须显式报错。

## 验收

- Node测试验证同源访问限制、私钥脱敏、请求去重、重启恢复不重投、任务输出保存，以及供应商请求/结果解析。
- 使用本地假供应商验证完整任务链，不消耗任何会员积分。失败只证明对应错误，不伪装成远端已连接。
- 独立浏览器页面验证五平台设置、未连接提示、任务预设以及GLB导入/预览/下载/截图。
- 真实授权与每个平台生成质量由用户账号联调确认；构建/单元测试不能替代这些验收。

## 工作方式

在现有checkout的codex/platform-connectors分支实现，当前web/dist继续服务原版。候选版本先构建到独立目录、独立端口验证，保留原构建供回退；不合并main或推送远端。
