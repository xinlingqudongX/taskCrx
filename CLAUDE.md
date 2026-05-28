# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**Team Session Share** — Chrome MV3 扩展，用于在团队成员间共享 Session/Cookie 和应用数据。支持定时任务、WebSocket 实时同步、网络监控。

## Monorepo 结构

```
apps/extension/   Chrome 扩展 (Vue 3 + TypeScript + Vite)
apps/worker/      Cloudflare Worker (WebSocket Relay + Durable Objects)
packages/shared/  共享类型和消息协议
```

包管理器: **pnpm**，工作区配置在 `pnpm-workspace.yaml`。

## 常用命令

```bash
# 开发
pnpm dev                    # 启动扩展开发服务器 (HMR, localhost:5173)
pnpm dev:worker             # 启动 Worker 本地开发 (wrangler)

# 构建
pnpm build                  # 构建扩展，产物在 apps/extension/dist，打包在 release/release.zip
pnpm deploy:worker          # 部署 Worker 到 Cloudflare

# 测试
pnpm test                   # 运行所有测试 (vitest)
pnpm test:watch             # 监听模式
vitest path/to/file.test.ts # 运行单个测试文件
```

## 扩展架构 (apps/extension/)

### 核心模块

| 目录 | 职责 |
|---|---|
| `background/` | Service Worker — 任务调度、Cookie/数据收集、WebSocket 管理 |
| `background/services/` | CookieCollector、NetworkMonitor、BodyRewriter、ProtoDecoder、CookieSharingService |
| `background/utils/` | app-collector (极光/苹果数据)、chatgpt-collector、cookie-keeper |
| `popup/` | Vue 3 选项页 UI (Naive UI)，用 `chrome.runtime.openOptionsPage()` 打开 |
| `content/` | Content Script 注入 |
| `sidepanel/` | 侧边栏 |
| `websocket/` | WSClient + WSMessageHandler — 通过 Worker Relay 实现实时 Cookie 同步 |
| `types/` | 全部接口定义 (Task, AppData, Cookie, Network, WebSocket 等) |

### 通信机制

所有 UI ↔ Background 通信通过 `chrome.runtime.onMessage` 消息协议。消息类型定义在 `background/index.ts` 的 listener 中（约 40+ 种消息类型）。

### 关键依赖

- `@crxjs/vite-plugin` — CRXJS Vite 插件，处理 MV3 manifest 和 HMR
- `@vitejs/plugin-vue` — Vue 3 SFC 支持
- `protobufjs` — Proto 消息解码
- `pako` — zlib 压缩/解压
- `naive-ui` — UI 组件库

## Worker 架构 (apps/worker/)

- 入口: `src/index.ts`，路由 `/ws` (WebSocket) 和 `/health`
- Durable Object: `RelayRoom` — 管理 WebSocket 房间，转发 Cookie 数据
- 认证: `middleware/auth.ts` 校验 token

## 配置说明

- Manifest 权限: cookies, storage, alarms, debugger, scripting, activeTab, tabs, clipboardRead/Write
- Host permissions: `<all_urls>`
- 存储: `chrome.storage.sync` 用于任务和域名（跨设备同步），`chrome.storage.local` 用于临时状态
- 定时任务: 使用 `chrome.alarms` API，支持 cron 表达式（`0 */N * * *` 小时级，`*/M * * * *` 分钟级）
- CSP: 开发环境允许 `localhost:5173` WebSocket 连接

## 测试

测试框架: **vitest**，测试文件与源文件同目录，命名 `*.test.ts`。

已覆盖模块:
- `background/services/CookieCollector.test.ts`
- `background/services/CookieSerializer.test.ts`
- `background/services/CookieSharingService.test.ts`
- `background/utils/chatgpt-collector.test.ts`
- `worker/src/middleware/auth.test.ts`
- `worker/src/utils/response.test.ts`
- `packages/shared/src/relay-message.test.ts`

## TypeScript 配置

- 基础配置: `tsconfig.base.json` (target ES2020, module ESNext, bundler resolution)
- 扩展和 Worker 各自继承基础配置
- Worker 额外类型: `@cloudflare/workers-types`
- Chrome API 类型: `@types/chrome`
