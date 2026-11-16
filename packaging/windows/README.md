# Windows 安装包

用户打开 `InfiniteCanvas-Setup-x64.exe`，点击「安装并打开」。在画布中点击「连接 ChatGPT」或「连接 Google」，完成官方登录后自动添加对话和可用的图片模型。以后从桌面「无限画布」打开。

备用安装方式：解压 `InfiniteCanvas-Windows-x64.zip`，双击 `install.cmd`。

安装到当前用户的 `%LOCALAPPDATA%\InfiniteCanvas\releases`，不需要管理员权限。各版本分别存放，账号、素材和画布不会打包或覆盖。已有旧服务运行时先退出旧服务再打开新版。

关闭网页后本地服务仍可继续运行；需要退出时，在开始菜单选择「无限画布 → 退出无限画布」。它只结束该安装版本的进程。

开发者构建：在项目目录运行 `node packaging/windows/build.mjs`。脚本从 Node 和 Google 官方地址下载并校验运行文件，按锁文件安装生产依赖；前端与 Agent 输出到独立打包目录。输出位于 `artifacts/windows`，不提交安装产物。

首次授权仍由用户本人在官方页面完成；安装与连接检查不发起图片生成。Windows x64 全新系统上的真实账号对话和生图需进行最终验收。
