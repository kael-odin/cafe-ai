# Cafe AI 中文说明

`Cafe` 是一个桌面优先的 AI 工作台，目标不是只做聊天，而是把 `对话 + 工具 + 文件 + Browser + Skills + MCP + 数字人/自动化` 放进同一个工作空间。

## 当前定位

- 桌面工作台: `Electron + React + Capacitor`
- 核心交互: Space、Conversation、Artifacts、Canvas、Browser
- 扩展体系: `App Store / Skills / MCP / Registry`
- 自动化能力: 数字人、运行时、活动记录、通知与远程访问

## 主要能力

- 一个空间里同时处理聊天、文件产物、浏览器任务和应用能力
- 支持 `AI Sources` 多来源管理，包括 API Key 与 OAuth 登录
- 支持 `AI Browser`、Artifacts 文件树、Canvas 预览
- 支持 App Store / Registry / MCP 扩展
- 支持消息渠道、数字人交互和自动化 App 运行时

## 本地开发

安装依赖:

```bash
npm install
```

启动开发环境:

```bash
npm run dev
```

类型检查:

```bash
npm run typecheck
```

单元测试:

```bash
npm run test:unit
```

## 项目结构

- `src/main/`: Electron 主进程、IPC、运行时与平台服务
- `src/renderer/`: React 前端、页面、组件、状态管理
- `src/shared/`: 主进程与前端共享类型/协议
- `resources/`: 图标、托盘图和打包资源
- `tests/`: 单元测试与 E2E 配置

## 适合的使用场景

- 个人 AI 工作台
- 数字人/自动化执行终端
- 技能与 MCP 集成实验平台
- 带 Browser 与文件产物的复杂多步任务

## 后续重点方向

1. 多 agent 协作
2. AI 监工模式
3. 通用文件上传与知识输入层
4. 更强的代码工作区体验
5. 更开放的 Skill / MCP / Registry 生态

## 仓库

- GitHub: `https://github.com/kael-odin/cafe-ai`

更多调研文档可参考:

- `cafe-ai-review-1-findings.md`
- `cafe-ai-review-2-expansion.md`
