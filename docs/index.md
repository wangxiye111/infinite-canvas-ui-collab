# Infinite Canvas Documentation Index

## Overview

- [Quick Start](/docs/overview/quick-start)
- [Features](/docs/overview/features)
- [Deploy on Render](/docs/overview/render)
- [Docker Deployment](/docs/overview/docker)
- [Third-party Prompt Sources](/docs/overview/third-party-prompt-repositories)

## Canvas Guide

- [Canvas Node Guide](/docs/canvas/canvas-node-manual)
- [Canvas Shortcuts](/docs/canvas/canvas-shortcuts)

## Development and Data

- [Local Development](/docs/development/local-development)
- [Canvas Data Structure](/docs/development/canvas-data-structure)
- [How the Local Codex Connection Works](/docs/development/local-codex-canvas)

## Business

- [Open-source License](/docs/business/license)
- [Business Cooperation](/docs/business/business)

## Support and Security

- [Report a Vulnerability](/docs/support/security)
- [Sponsor the Project](/docs/support/sponsor)

## Project Progress

- [Changelog](/docs/progress/changelog)
- [Pending Tests](/docs/progress/pending-test)
- [TODO](/docs/progress/todo)

## Product Requirements

- [UI 协作需求（中文）](ui-collaboration/brief.zh-CN.md) / [English brief](ui-collaboration/brief.en.md)：以完整画布为起点建立统一视觉与交互体系，Cue 组件作为参考，包含协作范围与验收要求。
- [UI 协作者运行与交接](ui-collaboration/README.md)：无账号的前端评审入口、代码位置、分享范围与英文沟通草稿。

- [本地 AI 创作画布 PRD](superpowers/specs/local-ai-canvas-prd.md)：当前生图、生视频与 GPT 创作助手的需求基线，包含 LibTV 调研对照、现有实现差距、工作流同步、开发顺序和验收标准。规划中的能力不代表已实现；后续任务引用 F01–F11 与 A01–A29。
- [平台接入核查与选择](../research/platform-access-decision.md)：具体平台命名、CLI／MCP／API 默认路径与能力边界，供实施前核对。
- [第二轮平台接入与画布核查](../research/platform-readiness-round2.md)：Craft 公开指南证据、登录后会员接口观察、本机缺失项和仍未执行的真实生成验收。
- [PRD 首批基础实施计划](superpowers/plans/local-ai-canvas-foundation.md)：平台接入、RunningHub 配置和结果恢复的实现记录；界面与真实账号验收见待测试文档。
- [普通节点平台生成实施计划](superpowers/plans/local-ai-canvas-node-generation.md)：第二批平台节点流程、审查修复和验证记录。
- [平台节点开发版测试](content/docs/progress/platform-node-preview.zh-CN.mdx)：独立开发预览启动、用户测试步骤、合成样例与已知边界。

## Notes

- Canvas projects and My Assets are primarily stored in the browser. WebDAV can be configured for cross-device synchronization.
- The AI API key is stored in the browser, which sends requests directly to OpenAI-compatible endpoints.
