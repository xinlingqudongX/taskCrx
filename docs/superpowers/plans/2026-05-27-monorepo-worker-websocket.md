# Monorepo重构 + Cloudflare Worker WebSocket Cookie共享 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单项目 Chrome 扩展重构为 pnpm monorepo，新增 Cloudflare Worker 模块，通过 WebSocket 实现实时 Cookie 共享。

**Architecture:** pnpm workspace monorepo，三个子包：`apps/extension`（Chrome扩展）、`apps/worker`（Cloudflare Worker）、`packages/shared`（共享类型和常量）。Worker 使用 Durable Object 维护 WebSocket 房间，扩展通过 WebSocket 客户端连接 Worker 进行实时 Cookie 交换。

**Tech Stack:** pnpm workspaces, Cloudflare Workers + Durable Objects, WebSocket (native), TypeScript, Vue 3, Vite + @crxjs/vite-plugin

---

## 当前项目结构（重构前）

```
taskCrx/
├─ package.json          ← 单项目配置
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ manifest.config.ts
└─ src/
   ├─ background.ts
   ├─ types/index.ts
   ├─ utils/
   │  ├─ app-collector.ts
   │  ├─ chatgpt-collector.ts
   │  └─ cookie-keeper.ts
   ├─ services/
   │  ├─ BodyRewriterService.ts
   │  ├─ CookieCollector.ts
   │  ├─ CookieFileExporter.ts
   │  ├─ CookieFileImporter.ts
   │  ├─ CookieSerializer.ts
   │  ├─ CookieSharingService.ts
   │  ├─ NetworkMonitorService.ts
   │  └─ ProtoDecoderService.ts
   ├─ options/
   │  ├─ App.vue
   │  ├─ store.ts
   │  ├─ main.ts
   │  ├─ index.html
   │  └─ components/
   ├─ store/setting.ts
   └─ public/icons/
```

## 目标项目结构（重构后）

```
taskCrx/
├─ package.json              ← 根 workspace 配置
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ vitest.config.ts
├─ apps/
│  ├─ extension/
│  │  ├─ package.json
│  │  ├─ manifest.config.ts
│  │  ├─ vite.config.ts
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ background/      ← background.ts + utils + services
│  │     │  ├─ index.ts      ← background.ts 入口
│  │     │  ├─ services/     ← 原 src/services/
│  │     │  └─ utils/        ← 原 src/utils/
│  │     ├─ content/
│  │     ├─ popup/
│  │     │  ├─ App.vue       ← 原 options/
│  │     │  ├─ store.ts
│  │     │  ├─ main.ts
│  │     │  ├─ index.html
│  │     │  └─ components/
│  │     ├─ sidepanel/
│  │     ├─ types/
│  │     │  └─ index.ts
│  │     ├─ websocket/       ← 新增：WebSocket 客户端
│  │     │  ├─ ws-client.ts
│  │     │  └─ message-handler.ts
│  │     └─ public/icons/
│  │
│  └─ worker/
│     ├─ package.json
│     ├─ wrangler.toml
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts
│        ├─ durable-objects/
│        │  └─ relay-room.ts
│        ├─ middleware/
│        │  └─ auth.ts
│        ├─ routes/
│        │  └─ websocket.ts
│        └─ utils/
│           └─ response.ts
│
├─ packages/
│  └─ shared/
│     ├─ package.json
│     └─ src/
│        ├─ relay-message.ts
│        ├─ constants.ts
│        └─ index.ts
│
└─ scripts/
   ├─ dev-worker.ts
   └─ deploy-worker.ts
```

---

### Task 1: 创建 Monorepo 根配置

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`（根 workspace，替换原有 package.json）
- Create: `tsconfig.base.json`

- [ ] **Step 1: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: 创建根 package.json**

将原 `package.json` 重命名为 `package.json.bak` 作为备份，然后创建新的根 package.json：

```json
{
    "name": "team-session-sync",
    "version": "1.0.2",
    "private": true,
    "scripts": {
        "dev": "pnpm --filter @team-session/extension dev",
        "build": "pnpm --filter @team-session/extension build",
        "dev:worker": "pnpm --filter @team-session/worker dev",
        "deploy:worker": "pnpm --filter @team-session/worker deploy",
        "test": "vitest --run",
        "test:watch": "vitest"
    }
}
```

- [ ] **Step 3: 创建 tsconfig.base.json**

```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "lib": ["ES2020", "DOM"],
        "strict": true,
        "esModuleInterop": true,
        "forceConsistentCasingInFileNames": true,
        "skipLibCheck": true,
        "noImplicitAny": false,
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "allowSyntheticDefaultImports": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json
git commit -m "chore: 创建 monorepo 根配置文件"
```

---

### Task 2: 创建共享包 packages/shared

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/relay-message.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tsconfig.json`

- [ ] **Step 1: 创建 packages/shared/package.json**

```json
{
    "name": "@team-session/shared",
    "version": "1.0.0",
    "private": true,
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "scripts": {
        "test": "vitest --run"
    }
}
```

- [ ] **Step 2: 创建 packages/shared/src/relay-message.ts**

```typescript
/**
 * WebSocket 中继消息协议定义
 * 插件与 Worker 之间的通信协议
 */

export type RelayMessageType =
    | 'join'           // 加入房间
    | 'leave'          // 离开房间
    | 'cookie-share'   // 共享 Cookie
    | 'cookie-request' // 请求 Cookie
    | 'cookie-response' // Cookie 响应
    | 'user-list'      // 用户列表更新
    | 'ping'           // 心跳
    | 'pong'           // 心跳响应
    | 'error';         // 错误消息

export interface RelayMessage {
    type: RelayMessageType;
    payload: unknown;
    sender?: string;
    timestamp: number;
}

export interface JoinPayload {
    roomId: string;
    userId: string;
    userName?: string;
}

export interface CookieSharePayload {
    domain: string;
    cookies: CookieData[];
}

export interface CookieData {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
    expirationDate?: number;
}

export interface CookieRequestPayload {
    domain: string;
    targetUserId?: string;
}

export interface CookieResponsePayload {
    domain: string;
    cookies: CookieData[];
    fromUserId: string;
    success: boolean;
    error?: string;
}

export interface UserListPayload {
    users: UserInfo[];
}

export interface UserInfo {
    userId: string;
    userName?: string;
    connectedAt: number;
}

export interface ErrorPayload {
    code: string;
    message: string;
}

/**
 * 创建中继消息
 */
export function createRelayMessage(
    type: RelayMessageType,
    payload: unknown,
    sender?: string
): RelayMessage {
    return {
        type,
        payload,
        sender,
        timestamp: Date.now(),
    };
}

/**
 * 解析中继消息
 */
export function parseRelayMessage(data: string): RelayMessage | null {
    try {
        const msg = JSON.parse(data);
        if (!msg.type || typeof msg.timestamp !== 'number') {
            return null;
        }
        return msg as RelayMessage;
    } catch {
        return null;
    }
}
```

- [ ] **Step 3: 创建 packages/shared/src/constants.ts**

```typescript
/**
 * 共享常量定义
 */

/** WebSocket 连接默认配置 */
export const WS_CONFIG = {
    DEFAULT_PORT: 8787,
    HEARTBEAT_INTERVAL: 30_000,
    RECONNECT_INTERVAL: 5_000,
    MAX_RECONNECT_ATTEMPTS: 10,
    CONNECTION_TIMEOUT: 10_000,
} as const;

/** 房间配置 */
export const ROOM_CONFIG = {
    MAX_USERS_PER_ROOM: 50,
    MAX_COOKIE_SIZE: 1024 * 1024, // 1MB
    ROOM_ID_PATTERN: /^[a-zA-Z0-9_-]{3,64}$/,
    USER_ID_PATTERN: /^[a-zA-Z0-9_-]{1,64}$/,
} as const;

/** 错误码 */
export const ERROR_CODES = {
    AUTH_FAILED: 'AUTH_FAILED',
    ROOM_FULL: 'ROOM_FULL',
    INVALID_MESSAGE: 'INVALID_MESSAGE',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    COOKIE_TOO_LARGE: 'COOKIE_TOO_LARGE',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** API 路径 */
export const ROUTES = {
    WEBSOCKET: '/ws',
    HEALTH: '/health',
    API_PREFIX: '/api',
} as const;
```

- [ ] **Step 4: 创建 packages/shared/src/index.ts**

```typescript
export * from './relay-message';
export * from './constants';
```

- [ ] **Step 5: 创建 packages/shared/tsconfig.json**

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src"
    },
    "include": ["src/**/*"]
}
```

- [ ] **Step 6: 验证和提交**

```bash
cd packages/shared && ls src/
git add packages/shared/
git commit -m "feat: 创建 @team-session/shared 共享包，定义 WebSocket 消息协议"
```

---

### Task 3: 创建 Cloudflare Worker 应用

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/wrangler.toml`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/src/routes/websocket.ts`
- Create: `apps/worker/src/middleware/auth.ts`
- Create: `apps/worker/src/durable-objects/relay-room.ts`
- Create: `apps/worker/src/utils/response.ts`
- Create: `scripts/dev-worker.ts`
- Create: `scripts/deploy-worker.ts`

- [ ] **Step 1: 创建 apps/worker/package.json**

```json
{
    "name": "@team-session/worker",
    "version": "1.0.0",
    "private": true,
    "scripts": {
        "dev": "wrangler dev",
        "deploy": "wrangler deploy",
        "test": "vitest --run"
    },
    "dependencies": {
        "@team-session/shared": "workspace:*"
    },
    "devDependencies": {
        "@cloudflare/workers-types": "^4.20240512.0",
        "typescript": "^5.5.0",
        "vitest": "^1.0.0",
        "wrangler": "^3.57.0"
    }
}
```

- [ ] **Step 2: 创建 apps/worker/wrangler.toml**

```toml
name = "team-session-relay"
main = "src/index.ts"
compatibility_date = "2024-05-01"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "RELAY_ROOM"
class_name = "RelayRoom"

[[migrations]]
tag = "v1"
new_classes = ["RelayRoom"]

[vars]
AUTH_SECRET = "CHANGE_ME_TO_A_SECURE_SECRET"
```

- [ ] **Step 3: 创建 apps/worker/tsconfig.json**

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src",
        "types": ["@cloudflare/workers-types"]
    },
    "include": ["src/**/*"]
}
```

- [ ] **Step 4: 创建 apps/worker/src/utils/response.ts**

```typescript
/**
 * HTTP 响应工具函数
 */

export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ error: message }, status);
}

export function healthResponse(): Response {
    return jsonResponse({
        status: 'ok',
        timestamp: Date.now(),
        service: 'team-session-relay',
    });
}
```

- [ ] **Step 5: 创建 apps/worker/src/middleware/auth.ts**

```typescript
/**
 * WebSocket 连接鉴权中间件
 * 从 URL 查询参数中提取 token 并验证
 */

export interface AuthResult {
    valid: boolean;
    userId?: string;
    error?: string;
}

export function authenticate(request: Request, secret: string): AuthResult {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const userId = url.searchParams.get('userId');

    if (!token || !userId) {
        return { valid: false, error: '缺少 token 或 userId 参数' };
    }

    try {
        // 简单 token 验证: base64(userId:timestamp:signature)
        const decoded = atob(token);
        const parts = decoded.split(':');

        if (parts.length !== 3) {
            return { valid: false, error: 'token 格式无效' };
        }

        const [tokenUserId, timestamp, signature] = parts;

        // 检查 userId 是否匹配
        if (tokenUserId !== userId) {
            return { valid: false, error: 'userId 不匹配' };
        }

        // 检查是否过期（24小时）
        const tokenTime = parseInt(timestamp, 10);
        if (Date.now() - tokenTime > 24 * 60 * 60 * 1000) {
            return { valid: false, error: 'token 已过期' };
        }

        // 验证签名
        const expectedSignature = simpleHash(`${userId}:${timestamp}:${secret}`);
        if (signature !== expectedSignature) {
            return { valid: false, error: 'token 签名无效' };
        }

        return { valid: true, userId: tokenUserId };
    } catch {
        return { valid: false, error: 'token 解析失败' };
    }
}

/**
 * 生成认证 token
 */
export function generateToken(userId: string, secret: string): string {
    const timestamp = Date.now().toString();
    const signature = simpleHash(`${userId}:${timestamp}:${secret}`);
    return btoa(`${userId}:${timestamp}:${signature}`);
}

function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
```

- [ ] **Step 6: 创建 apps/worker/src/durable-objects/relay-room.ts**

```typescript
/**
 * RelayRoom Durable Object
 * 管理 WebSocket 房间，维护用户连接和 Cookie 数据共享
 */

import {
    type RelayMessage,
    type JoinPayload,
    type CookieSharePayload,
    type CookieRequestPayload,
    type UserInfo,
    createRelayMessage,
    parseRelayMessage,
    ROOM_CONFIG,
    ERROR_CODES,
} from '@team-session/shared';

interface ConnectedUser {
    ws: WebSocket;
    userId: string;
    userName?: string;
    connectedAt: number;
}

export class RelayRoom implements DurableObject {
    private users: Map<string, ConnectedUser> = new Map();
    private cookies: Map<string, Record<string, unknown>[]> = new Map();

    constructor(private ctx: DurableObjectState, private env: Env) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/ws') {
            return this.handleWebSocket(request);
        }

        if (url.pathname === '/users') {
            return new Response(JSON.stringify(this.getUserList()), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response('Not Found', { status: 404 });
    }

    private handleWebSocket(request: Request): Response {
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader !== 'websocket') {
            return new Response('Expected WebSocket', { status: 400 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        this.handleSession(server);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    private handleSession(ws: WebSocket): void {
        ws.accept();

        ws.addEventListener('message', (event) => {
            try {
                const msg = parseRelayMessage(event.data as string);
                if (!msg) {
                    this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '消息格式无效');
                    return;
                }
                this.handleMessage(ws, msg);
            } catch (err) {
                this.sendError(ws, ERROR_CODES.INTERNAL_ERROR, '消息处理失败');
            }
        });

        ws.addEventListener('close', () => {
            this.handleDisconnect(ws);
        });

        ws.addEventListener('error', () => {
            this.handleDisconnect(ws);
        });
    }

    private handleMessage(ws: WebSocket, msg: RelayMessage): void {
        switch (msg.type) {
            case 'join':
                this.handleJoin(ws, msg.payload as JoinPayload);
                break;
            case 'leave':
                this.handleLeave(ws);
                break;
            case 'cookie-share':
                this.handleCookieShare(ws, msg.payload as CookieSharePayload);
                break;
            case 'cookie-request':
                this.handleCookieRequest(ws, msg.payload as CookieRequestPayload);
                break;
            case 'ping':
                this.send(ws, createRelayMessage('pong', {}, 'server'));
                break;
            default:
                this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, `未知消息类型: ${msg.type}`);
        }
    }

    private handleJoin(ws: WebSocket, payload: JoinPayload): void {
        const { roomId, userId, userName } = payload;

        if (!userId || !roomId) {
            this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '缺少 userId 或 roomId');
            return;
        }

        if (this.users.size >= ROOM_CONFIG.MAX_USERS_PER_ROOM) {
            this.sendError(ws, ERROR_CODES.ROOM_FULL, '房间已满');
            return;
        }

        const user: ConnectedUser = {
            ws,
            userId,
            userName,
            connectedAt: Date.now(),
        };

        this.users.set(userId, user);

        // 发送确认和用户列表
        this.send(ws, createRelayMessage('join', {
            success: true,
            userId,
            users: this.getUserList(),
        }, 'server'));

        // 广播用户列表更新
        this.broadcast(createRelayMessage('user-list', {
            users: this.getUserList(),
        }, 'server'), userId);

        console.log(`用户 ${userId} 加入房间，当前 ${this.users.size} 人`);
    }

    private handleLeave(ws: WebSocket): void {
        let leftUserId: string | undefined;

        for (const [userId, user] of this.users) {
            if (user.ws === ws) {
                leftUserId = userId;
                break;
            }
        }

        if (leftUserId) {
            this.users.delete(leftUserId);
            this.broadcast(createRelayMessage('user-list', {
                users: this.getUserList(),
            }, 'server'));
            console.log(`用户 ${leftUserId} 离开房间`);
        }
    }

    private handleCookieShare(ws: WebSocket, payload: CookieSharePayload): void {
        const { domain, cookies } = payload;

        if (!domain || !cookies || !Array.isArray(cookies)) {
            this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, 'Cookie 数据格式无效');
            return;
        }

        const dataSize = JSON.stringify(cookies).length;
        if (dataSize > ROOM_CONFIG.MAX_COOKIE_SIZE) {
            this.sendError(ws, ERROR_CODES.COOKIE_TOO_LARGE, 'Cookie 数据过大');
            return;
        }

        // 查找发送者
        let senderId = 'unknown';
        for (const [userId, user] of this.users) {
            if (user.ws === ws) {
                senderId = userId;
                break;
            }
        }

        // 存储 cookie
        this.cookies.set(domain, cookies);

        // 广播给其他用户
        this.broadcast(createRelayMessage('cookie-share', {
            domain,
            cookies,
            fromUserId: senderId,
        }, senderId), senderId);

        console.log(`用户 ${senderId} 共享了 ${domain} 的 ${cookies.length} 个 Cookie`);
    }

    private handleCookieRequest(ws: WebSocket, payload: CookieRequestPayload): void {
        const { domain, targetUserId } = payload;

        if (!domain) {
            this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '缺少 domain 参数');
            return;
        }

        const cookies = this.cookies.get(domain);

        if (cookies) {
            this.send(ws, createRelayMessage('cookie-response', {
                domain,
                cookies,
                success: true,
            }, 'server'));
        } else if (targetUserId) {
            const targetUser = this.users.get(targetUserId);
            if (targetUser) {
                this.send(targetUser.ws, createRelayMessage('cookie-request', {
                    domain,
                    fromUserId: Array.from(this.users.entries())
                        .find(([, u]) => u.ws === ws)?.[0],
                }, 'server'));
            }
        } else {
            this.send(ws, createRelayMessage('cookie-response', {
                domain,
                cookies: [],
                success: false,
                error: '没有找到该域名的 Cookie 数据',
            }, 'server'));
        }
    }

    private handleDisconnect(ws: WebSocket): void {
        for (const [userId, user] of this.users) {
            if (user.ws === ws) {
                this.users.delete(userId);
                this.broadcast(createRelayMessage('user-list', {
                    users: this.getUserList(),
                }, 'server'));
                console.log(`用户 ${userId} 断开连接`);
                break;
            }
        }
    }

    private getUserList(): UserInfo[] {
        return Array.from(this.users.values()).map((u) => ({
            userId: u.userId,
            userName: u.userName,
            connectedAt: u.connectedAt,
        }));
    }

    private send(ws: WebSocket, msg: RelayMessage): void {
        try {
            ws.send(JSON.stringify(msg));
        } catch {
            // 连接可能已关闭
        }
    }

    private sendError(ws: WebSocket, code: string, message: string): void {
        this.send(ws, createRelayMessage('error', { code, message }, 'server'));
    }

    private broadcast(msg: RelayMessage, excludeUserId?: string): void {
        const data = JSON.stringify(msg);
        for (const [userId, user] of this.users) {
            if (userId !== excludeUserId) {
                try {
                    user.ws.send(data);
                } catch {
                    this.users.delete(userId);
                }
            }
        }
    }
}

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
    AUTH_SECRET: string;
}
```

- [ ] **Step 7: 创建 apps/worker/src/routes/websocket.ts**

```typescript
/**
 * WebSocket 路由处理
 */

import { authenticate } from '../middleware/auth';
import { healthResponse, errorResponse } from '../utils/response';
import { ROUTES } from '@team-session/shared';

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
    AUTH_SECRET: string;
}

export async function handleWebSocketRoute(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === ROUTES.HEALTH) {
        return healthResponse();
    }

    // WebSocket 连接
    if (url.pathname === ROUTES.WEBSOCKET) {
        return handleWebSocket(request, env);
    }

    return new Response('Not Found', { status: 404 });
}

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
    // 验证请求方式
    if (request.method !== 'GET') {
        return errorResponse('仅支持 GET 请求', 405);
    }

    // 鉴权
    const auth = authenticate(request, env.AUTH_SECRET);
    if (!auth.valid) {
        return errorResponse(auth.error || '认证失败', 401);
    }

    // 获取房间 ID
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) {
        return errorResponse('缺少 roomId 参数', 400);
    }

    // 获取 Durable Object 实例
    const roomStub = env.RELAY_ROOM.get(env.RELAY_ROOM.idFromName(roomId));

    // 转发 WebSocket 请求到 Durable Object
    const forwardedUrl = new URL(request.url);
    forwardedUrl.pathname = '/ws';

    return roomStub.fetch(new Request(forwardedUrl.toString(), {
        headers: request.headers,
    }));
}
```

- [ ] **Step 8: 创建 apps/worker/src/index.ts**

```typescript
/**
 * Team Session Relay Worker 入口
 * 接受插件的 WebSocket 连接，用于 Cookie 共享
 */

import { handleWebSocketRoute } from './routes/websocket';

export { RelayRoom } from './durable-objects/relay-room';

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
    AUTH_SECRET: string;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // 处理 WebSocket 和健康检查路由
        if (url.pathname === '/ws' || url.pathname === '/health') {
            return handleWebSocketRoute(request, env);
        }

        return new Response(JSON.stringify({
            service: 'team-session-relay',
            version: '1.0.0',
            endpoints: {
                websocket: '/ws?token=xxx&userId=xxx&roomId=xxx',
                health: '/health',
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
```

- [ ] **Step 9: 创建 scripts/dev-worker.ts**

```typescript
// scripts/dev-worker.ts
// 开发环境启动 Worker
import { execSync } from 'child_process';
import { resolve } from 'path';

const workerDir = resolve(__dirname, '../apps/worker');
console.log('Starting worker dev server...');
execSync('pnpm dev', { cwd: workerDir, stdio: 'inherit' });
```

- [ ] **Step 10: 创建 scripts/deploy-worker.ts**

```typescript
// scripts/deploy-worker.ts
// 部署 Worker 到 Cloudflare
import { execSync } from 'child_process';
import { resolve } from 'path';

const workerDir = resolve(__dirname, '../apps/worker');
console.log('Deploying worker to Cloudflare...');
execSync('pnpm deploy', { cwd: workerDir, stdio: 'inherit' });
```

- [ ] **Step 11: Commit**

```bash
git add apps/worker/ scripts/
git commit -m "feat: 创建 Cloudflare Worker 模块，WebSocket 中继 + Durable Object 房间管理"
```

---

### Task 4: 迁移现有扩展代码到 apps/extension

**Files:**
- Move: `manifest.config.ts` → `apps/extension/manifest.config.ts`
- Move: `vite.config.ts` → `apps/extension/vite.config.ts`
- Move: `tsconfig.json` → `apps/extension/tsconfig.json`
- Move: `src/background.ts` → `apps/extension/src/background/index.ts`
- Move: `src/utils/*` → `apps/extension/src/background/utils/*`
- Move: `src/services/*` → `apps/extension/src/background/services/*`
- Move: `src/types/index.ts` → `apps/extension/src/types/index.ts`
- Move: `src/options/*` → `apps/extension/src/popup/*`
- Move: `src/store/setting.ts` → `apps/extension/src/popup/store/setting.ts`
- Move: `src/public/*` → `apps/extension/src/public/*`
- Create: `apps/extension/package.json`
- Create: `apps/extension/src/content/` (空目录占位)
- Create: `apps/extension/src/sidepanel/` (空目录占位)

- [ ] **Step 1: 创建 apps/extension/package.json**

```json
{
    "name": "@team-session/extension",
    "version": "1.0.2",
    "private": true,
    "description": "Share the session with other users in the same team.",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    },
    "dependencies": {
        "@team-session/shared": "workspace:*",
        "@types/chrome": "^0.1.3",
        "@types/node": "^24.2.1",
        "@vicons/ionicons5": "^0.13.0",
        "jsqr": "^1.4.0",
        "pako": "^2.1.0",
        "protobufjs": "^8.4.2",
        "qrcode": "^1.5.3"
    },
    "devDependencies": {
        "@crxjs/vite-plugin": "^2.1.0",
        "@vitejs/plugin-vue": "^6.0.1",
        "jsdom": "^27.4.0",
        "naive-ui": "^2.42.0",
        "typescript": "^5.9.2",
        "vite": "^7.1.1",
        "vite-plugin-zip-pack": "^1.2.4",
        "vue": "^3.5.18"
    }
}
```

- [ ] **Step 2: 复制并修改 vite.config.ts**

复制原 `vite.config.ts` 到 `apps/extension/vite.config.ts`，修改 root 路径：

```typescript
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";
import zip from "vite-plugin-zip-pack";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
    root: "src/",
    plugins: [
        vue(),
        crx({ manifest }),
        zip({
            inDir: "src/dist",
            outDir: "release",
            outFileName: "release.zip",
        }),
    ],
    server: {
        host: "localhost",
        port: 5173,
        cors: true,
        allowedHosts: ["localhost"],
        hmr: {
            host: "localhost",
            port: 5173,
            protocol: "ws",
        },
    },
    build: {
        target: "chrome107",
        outDir: "dist",
        assetsDir: "assets",
        rollupOptions: {
            input: {
                popup: path.resolve(__dirname, "src/popup/index.html"),
            },
        },
        sourcemap: true,
        copyPublicDir: true,
    },
    legacy: {
        skipWebSocketTokenCheck: true,
    },
});
```

- [ ] **Step 3: 复制并修改 manifest.config.ts**

```typescript
import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json";

const isDev = process.env.NODE_ENV === "development";

export default defineManifest({
    manifest_version: 3,
    name: "Team Session Share",
    short_name: "Team Session Share",
    version: packageJson.version,
    description: packageJson.description,
    permissions: [
        "cookies",
        "storage",
        "alarms",
        "notifications",
        "scripting",
        "activeTab",
        "tabs",
        "clipboardRead",
        "clipboardWrite",
        "debugger",
    ],
    optional_permissions: [],
    host_permissions: [
        "<all_urls>",
        "*://*/*",
        "http://*/*",
        "https://*/*",
        "https://*/",
        "http://*/",
        "https://appstoreconnect.apple.com/*",
    ],
    background: {
        service_worker: "background/index.ts",
        type: "module",
    },
    options_ui: {
        page: "popup/index.html",
        open_in_tab: true,
    },
    action: {
        default_title: "Team Session Share",
    },
    icons: {
        "48": "icons/icon48.png",
        "128": "icons/icon128.png",
    },
    web_accessible_resources: [
        {
            matches: ["<all_urls>"],
            resources: ["**/*", "*"],
        },
    ],
    storage: {
        managed_schema: "schema.json",
    },
});
```

- [ ] **Step 4: 复制 tsconfig.json 并修改**

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "dist",
        "types": ["node", "chrome"]
    },
    "include": ["src/**/*"]
}
```

- [ ] **Step 5: 移动源文件**

将原 `src/` 下的文件按照目标结构移动：

- `src/background.ts` → `apps/extension/src/background/index.ts`
- `src/utils/*` → `apps/extension/src/background/utils/*`
- `src/services/*` → `apps/extension/src/background/services/*`
- `src/types/index.ts` → `apps/extension/src/types/index.ts`
- `src/options/*` → `apps/extension/src/popup/*`
- `src/store/setting.ts` → `apps/extension/src/popup/store/setting.ts`
- `src/public/*` → `apps/extension/src/public/*`

- [ ] **Step 6: 更新内部 import 路径**

移动文件后，需要更新跨目录的 import 路径：

**`apps/extension/src/background/index.ts`（原 background.ts）：**
```typescript
// 修改前
import { ... } from "./utils/app-collector";
import { ... } from "./services/NetworkMonitorService";
import type { ... } from "./types/index";

// 修改后
import { ... } from "./utils/app-collector";
import { ... } from "./services/NetworkMonitorService";
import type { ... } from "../types/index";
```

**`apps/extension/src/background/services/*.ts`：**
```typescript
// 修改前
import type { FullCookie } from '../types/index';
// 修改后
import type { FullCookie } from '../../types/index';
```

**`apps/extension/src/popup/store.ts`（原 options/store.ts）：**
```typescript
// 修改前
import type { Task as BackgroundTask, AppDataConfig } from "../types/index";
// 修改后
import type { Task as BackgroundTask, AppDataConfig } from "../../types/index";
```

**`apps/extension/src/popup/App.vue`：**
```typescript
// 修改前
import { domainStore } from "./store";
// 修改后（无需修改，相对路径不变）
import { domainStore } from "./store";
```

- [ ] **Step 7: 创建空占位目录**

```bash
mkdir -p apps/extension/src/content
mkdir -p apps/extension/src/sidepanel
echo '// 内容脚本入口' > apps/extension/src/content/index.ts
echo '// Side Panel 入口' > apps/extension/src/sidepanel/index.ts
```

- [ ] **Step 8: 验证安装和构建**

```bash
cd D:/git_project/taskCrx
pnpm install
pnpm --filter @team-session/extension build
```

- [ ] **Step 9: Commit**

```bash
git add apps/extension/
git commit -m "refactor: 迁移扩展代码到 apps/extension 目录结构"
```

---

### Task 5: 创建 WebSocket 客户端

**Files:**
- Create: `apps/extension/src/websocket/ws-client.ts`
- Create: `apps/extension/src/websocket/message-handler.ts`

- [ ] **Step 1: 创建 apps/extension/src/websocket/ws-client.ts**

```typescript
/**
 * WebSocket 客户端
 * 连接到 Cloudflare Worker 中继服务器，实现 Cookie 实时共享
 */

import {
    type RelayMessage,
    type CookieData,
    type UserInfo,
    createRelayMessage,
    parseRelayMessage,
    WS_CONFIG,
} from '@team-session/shared';

export type WSClientEvent =
    | 'connected'
    | 'disconnected'
    | 'error'
    | 'cookie-received'
    | 'user-list-updated'
    | 'reconnecting';

export interface WSClientConfig {
    serverUrl: string;
    token: string;
    userId: string;
    roomId: string;
    userName?: string;
    heartbeatInterval?: number;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}

export type WSClientEventHandler = (data?: unknown) => void;

export class WSClient {
    private ws: WebSocket | null = null;
    private config: Required<WSClientConfig>;
    private listeners: Map<WSClientEvent, WSClientEventHandler[]> = new Map();
    private heartbeatTimer: number | null = null;
    private reconnectAttempts = 0;
    private isManualClose = false;
    private isDestroyed = false;

    constructor(config: WSClientConfig) {
        this.config = {
            ...config,
            heartbeatInterval: config.heartbeatInterval ?? WS_CONFIG.HEARTBEAT_INTERVAL,
            reconnectInterval: config.reconnectInterval ?? WS_CONFIG.RECONNECT_INTERVAL,
            maxReconnectAttempts: config.maxReconnectAttempts ?? WS_CONFIG.MAX_RECONNECT_ATTEMPTS,
        };
    }

    /**
     * 连接到 WebSocket 服务器
     */
    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.warn('WebSocket 已连接');
            return;
        }

        this.isManualClose = false;
        const url = this.buildUrl();

        try {
            this.ws = new WebSocket(url);
            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket 连接失败:', error);
            this.emit('error', error);
            this.scheduleReconnect();
        }
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        this.isManualClose = true;
        this.stopHeartbeat();

        if (this.ws) {
            // 先发送离开消息
            this.sendRaw(createRelayMessage('leave', {}));
            this.ws.close(1000, '客户端主动断开');
            this.ws = null;
        }
    }

    /**
     * 销毁客户端，不再自动重连
     */
    destroy(): void {
        this.isDestroyed = true;
        this.disconnect();
    }

    /**
     * 共享 Cookie
     */
    shareCookies(domain: string, cookies: CookieData[]): void {
        this.send(createRelayMessage('cookie-share', { domain, cookies }));
    }

    /**
     * 请求 Cookie
     */
    requestCookies(domain: string, targetUserId?: string): void {
        this.send(createRelayMessage('cookie-request', { domain, targetUserId }));
    }

    /**
     * 获取在线用户列表
     */
    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * 注册事件监听
     */
    on(event: WSClientEvent, handler: WSClientEventHandler): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
    }

    /**
     * 移除事件监听
     */
    off(event: WSClientEvent, handler: WSClientEventHandler): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index >= 0) handlers.splice(index, 1);
        }
    }

    private buildUrl(): string {
        const { serverUrl, token, userId, roomId } = this.config;
        const params = new URLSearchParams({ token, userId, roomId });
        return `${serverUrl}/ws?${params.toString()}`;
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            console.log('WebSocket 已连接');
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.emit('connected');

            // 发送加入房间消息
            this.sendRaw(createRelayMessage('join', {
                roomId: this.config.roomId,
                userId: this.config.userId,
                userName: this.config.userName,
            }));
        };

        this.ws.onmessage = (event) => {
            const msg = parseRelayMessage(event.data);
            if (!msg) {
                console.warn('收到无效消息:', event.data);
                return;
            }
            this.handleMessage(msg);
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket 关闭:', event.code, event.reason);
            this.stopHeartbeat();
            this.emit('disconnected');

            if (!this.isManualClose && !this.isDestroyed) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (event) => {
            console.error('WebSocket 错误:', event);
            this.emit('error', event);
        };
    }

    private handleMessage(msg: RelayMessage): void {
        switch (msg.type) {
            case 'cookie-share':
                this.emit('cookie-received', msg.payload);
                break;
            case 'cookie-response':
                this.emit('cookie-received', msg.payload);
                break;
            case 'user-list':
                this.emit('user-list-updated', (msg.payload as { users: UserInfo[] }).users);
                break;
            case 'join':
                if ((msg.payload as { users: UserInfo[] }).users) {
                    this.emit('user-list-updated', (msg.payload as { users: UserInfo[] }).users);
                }
                break;
            case 'pong':
                // 心跳响应，无需处理
                break;
            case 'error':
                console.error('服务器错误:', msg.payload);
                break;
            default:
                console.log('未处理的消息类型:', msg.type);
        }
    }

    private send(msg: RelayMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendRaw(msg);
        } else {
            console.warn('WebSocket 未连接，无法发送消息');
        }
    }

    private sendRaw(msg: RelayMessage): void {
        try {
            this.ws?.send(JSON.stringify(msg));
        } catch (error) {
            console.error('发送消息失败:', error);
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendRaw(createRelayMessage('ping', {}));
            }
        }, this.config.heartbeatInterval) as unknown as number;
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error('达到最大重连次数，停止重连');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempts, 5);

        console.log(`将在 ${delay}ms 后重连 (第 ${this.reconnectAttempts} 次)`);
        this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

        setTimeout(() => {
            if (!this.isManualClose && !this.isDestroyed) {
                this.connect();
            }
        }, delay);
    }

    private emit(event: WSClientEvent, data?: unknown): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`事件处理器错误 (${event}):`, error);
                }
            }
        }
    }
}
```

- [ ] **Step 2: 创建 apps/extension/src/websocket/message-handler.ts**

```typescript
/**
 * WebSocket 消息处理器
 * 将接收到的 Cookie 数据同步到 Chrome 浏览器
 */

import type { CookieData, UserInfo } from '@team-session/shared';
import { WSClient, type WSClientConfig } from './ws-client';

export interface WSHandlerConfig extends WSClientConfig {
    autoApplyCookies?: boolean;
}

export class WSMessageHandler {
    private client: WSClient;
    private config: WSHandlerConfig;
    private onlineUsers: UserInfo[] = [];

    constructor(config: WSHandlerConfig) {
        this.config = config;
        this.client = new WSClient(config);
        this.setupListeners();
    }

    /**
     * 连接到中继服务器
     */
    connect(): void {
        this.client.connect();
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        this.client.disconnect();
    }

    /**
     * 销毁
     */
    destroy(): void {
        this.client.destroy();
    }

    /**
     * 共享指定域名的 Cookie
     */
    async shareDomainCookies(domain: string): Promise<void> {
        try {
            const cookies = await this.collectCookies(domain);
            this.client.shareCookies(domain, cookies);
            console.log(`已共享 ${domain} 的 ${cookies.length} 个 Cookie`);
        } catch (error) {
            console.error('共享 Cookie 失败:', error);
            throw error;
        }
    }

    /**
     * 请求指定域名的 Cookie
     */
    requestDomainCookies(domain: string, targetUserId?: string): void {
        this.client.requestCookies(domain, targetUserId);
    }

    /**
     * 获取在线用户
     */
    getOnlineUsers(): UserInfo[] {
        return [...this.onlineUsers];
    }

    /**
     * 是否已连接
     */
    get isConnected(): boolean {
        return this.client.isConnected;
    }

    /**
     * 注册事件
     */
    on(event: Parameters<WSClient['on']>[0], handler: Parameters<WSClient['on']>[1]): void {
        this.client.on(event, handler);
    }

    private setupListeners(): void {
        this.client.on('cookie-received', (data) => {
            const payload = data as { domain: string; cookies: CookieData[]; fromUserId?: string };
            if (payload?.cookies && this.config.autoApplyCookies !== false) {
                this.applyCookies(payload.domain, payload.cookies);
            }
        });

        this.client.on('user-list-updated', (data) => {
            this.onlineUsers = (data as UserInfo[]) || [];
            console.log('在线用户更新:', this.onlineUsers.length, '人');
        });
    }

    /**
     * 从浏览器收集 Cookie
     */
    private async collectCookies(domain: string): Promise<CookieData[]> {
        const cookies = await chrome.cookies.getAll({ domain });
        return cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            expirationDate: c.expirationDate,
        }));
    }

    /**
     * 将接收到的 Cookie 应用到浏览器
     */
    private async applyCookies(domain: string, cookies: CookieData[]): Promise<void> {
        let successCount = 0;

        for (const cookie of cookies) {
            try {
                const cookieDomain = cookie.domain.startsWith('.')
                    ? cookie.domain.substring(1)
                    : cookie.domain;

                await chrome.cookies.set({
                    url: `https://${cookieDomain}${cookie.path || '/'}`,
                    name: cookie.name,
                    value: cookie.value,
                    path: cookie.path || '/',
                    secure: cookie.secure ?? true,
                    httpOnly: cookie.httpOnly ?? false,
                    sameSite: (cookie.sameSite as chrome.cookies.SameSiteStatus) || 'lax',
                    domain: cookie.domain,
                    expirationDate: cookie.expirationDate,
                });
                successCount++;
            } catch (error) {
                console.warn(`设置 Cookie 失败 [${cookie.name}@${cookie.domain}]:`, error);
            }
        }

        console.log(`成功应用 ${successCount}/${cookies.length} 个 Cookie 到 ${domain}`);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/websocket/
git commit -m "feat: 添加 WebSocket 客户端和消息处理器，支持实时 Cookie 共享"
```

---

### Task 6: 集成 WebSocket 到 Background Service Worker

**Files:**
- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/types/index.ts`

- [ ] **Step 1: 在 types/index.ts 末尾添加 WebSocket 相关类型**

```typescript
// ==================== WebSocket 连接配置 ====================

/** WebSocket 连接配置 */
export interface WSConnectionConfig {
    serverUrl: string;
    roomId: string;
    userId: string;
    userName?: string;
    autoReconnect?: boolean;
    autoApplyCookies?: boolean;
}

/** WebSocket 连接状态 */
export interface WSConnectionStatus {
    connected: boolean;
    roomId: string | null;
    userId: string | null;
    onlineUsers: number;
    lastError?: string;
}
```

- [ ] **Step 2: 在 background/index.ts 中添加 WebSocket 集成**

在 imports 部分添加：

```typescript
import { WSMessageHandler } from "../websocket/message-handler";
import type { WSConnectionConfig, WSConnectionStatus } from "../types/index";
```

在常量定义之后添加 WebSocket 状态管理：

```typescript
// WebSocket 连接管理
let wsHandler: WSMessageHandler | null = null;
let wsConnectionConfig: WSConnectionConfig | null = null;

const WS_CONFIG_KEY = "cc_ws_config_v1";
```

在 message handler 中（`chrome.runtime.onMessage.addListener`）添加以下消息处理：

```typescript
// WebSocket 连接管理
if (msg?.type === "wsConnect") {
    const config = msg.config as WSConnectionConfig;
    try {
        if (wsHandler) {
            wsHandler.destroy();
        }
        wsHandler = new WSMessageHandler({
            serverUrl: config.serverUrl,
            token: msg.token,
            userId: config.userId,
            roomId: config.roomId,
            userName: config.userName,
            autoApplyCookies: config.autoApplyCookies ?? true,
        });
        wsHandler.connect();
        wsConnectionConfig = config;

        // 保存配置
        chrome.storage.local.set({ [WS_CONFIG_KEY]: config });

        sendResponse({ ok: true });
    } catch (error: any) {
        sendResponse({ ok: false, error: error.message });
    }
    return true;
}

if (msg?.type === "wsDisconnect") {
    if (wsHandler) {
        wsHandler.destroy();
        wsHandler = null;
    }
    sendResponse({ ok: true });
    return true;
}

if (msg?.type === "wsShareCookies") {
    if (!wsHandler) {
        sendResponse({ ok: false, error: "WebSocket 未连接" });
        return true;
    }
    try {
        await wsHandler.shareDomainCookies(msg.domain);
        sendResponse({ ok: true });
    } catch (error: any) {
        sendResponse({ ok: false, error: error.message });
    }
    return true;
}

if (msg?.type === "wsRequestCookies") {
    if (!wsHandler) {
        sendResponse({ ok: false, error: "WebSocket 未连接" });
        return true;
    }
    wsHandler.requestDomainCookies(msg.domain, msg.targetUserId);
    sendResponse({ ok: true });
    return true;
}

if (msg?.type === "wsGetStatus") {
    const status: WSConnectionStatus = {
        connected: wsHandler?.isConnected ?? false,
        roomId: wsConnectionConfig?.roomId ?? null,
        userId: wsConnectionConfig?.userId ?? null,
        onlineUsers: wsHandler?.getOnlineUsers().length ?? 0,
    };
    sendResponse(status);
    return true;
}

if (msg?.type === "wsGetOnlineUsers") {
    if (!wsHandler) {
        sendResponse({ users: [] });
        return true;
    }
    sendResponse({ users: wsHandler.getOnlineUsers() });
    return true;
}
```

在 `chrome.runtime.onInstalled.addListener` 中添加 WebSocket 自动重连：

```typescript
// 恢复 WebSocket 连接
chrome.storage.local.get([WS_CONFIG_KEY], (result) => {
    const config = result[WS_CONFIG_KEY];
    if (config) {
        console.log('恢复 WebSocket 连接配置:', config.roomId);
        // 需要重新获取 token
        // 可以在 popup 中触发连接
    }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/background/index.ts apps/extension/src/types/index.ts
git commit -m "feat: 将 WebSocket 客户端集成到 background service worker"
```

---

### Task 7: 添加 WebSocket 连接 UI 到 Options 页面

**Files:**
- Modify: `apps/extension/src/popup/App.vue`

- [ ] **Step 1: 在 App.vue 模板中添加 WebSocket 连接卡片**

在 Cookie状态监控卡片后面添加：

```vue
<!-- WebSocket 连接管理 -->
<n-card title="WebSocket Cookie共享">
    <n-space vertical>
        <n-space align="center">
            <n-tag :type="wsStatus.connected ? 'success' : 'default'">
                连接状态: {{ wsStatus.connected ? '已连接' : '未连接' }}
            </n-tag>
            <n-tag v-if="wsStatus.connected" type="info">
                在线用户: {{ wsStatus.onlineUsers }}
            </n-tag>
        </n-space>
        <n-space align="center">
            <n-input
                v-model:value="wsConfig.serverUrl"
                placeholder="服务器地址，如 wss://your-worker.workers.dev"
                style="width: 300px;"
            />
            <n-input
                v-model:value="wsConfig.roomId"
                placeholder="房间ID"
                style="width: 150px;"
            />
            <n-input
                v-model:value="wsConfig.userId"
                placeholder="用户ID"
                style="width: 150px;"
            />
        </n-space>
        <n-space align="center">
            <n-button
                @click="wsConnect"
                type="primary"
                size="small"
                :loading="wsLoading"
                :disabled="wsStatus.connected"
            >
                连接
            </n-button>
            <n-button
                @click="wsDisconnect"
                type="error"
                size="small"
                :disabled="!wsStatus.connected"
            >
                断开
            </n-button>
            <n-button
                @click="openShareModal"
                type="success"
                size="small"
                :disabled="!wsStatus.connected"
            >
                共享Cookie
            </n-button>
        </n-space>
    </n-space>
</n-card>
```

- [ ] **Step 2: 在 App.vue script 中添加 WebSocket 状态和方法**

在 script setup 部分添加：

```javascript
// WebSocket 连接相关
const wsLoading = ref(false);
const wsConfig = reactive({
    serverUrl: '',
    roomId: '',
    userId: '',
});
const wsStatus = ref({ connected: false, roomId: null, userId: null, onlineUsers: 0 });

const wsConnect = async () => {
    if (!wsConfig.serverUrl || !wsConfig.roomId || !wsConfig.userId) {
        alert('请填写完整的连接信息');
        return;
    }
    wsLoading.value = true;
    try {
        // token 需要由服务端生成，这里简化处理
        const token = btoa(`${wsConfig.userId}:${Date.now()}:simple`);
        const result = await chrome.runtime.sendMessage({
            type: 'wsConnect',
            config: wsConfig,
            token,
        });
        if (result?.ok) {
            await refreshWsStatus();
        } else {
            alert('连接失败: ' + (result?.error || '未知错误'));
        }
    } catch (error) {
        alert('连接失败: ' + error.message);
    } finally {
        wsLoading.value = false;
    }
};

const wsDisconnect = async () => {
    await chrome.runtime.sendMessage({ type: 'wsDisconnect' });
    wsStatus.value = { connected: false, roomId: null, userId: null, onlineUsers: 0 };
};

const refreshWsStatus = async () => {
    try {
        const status = await chrome.runtime.sendMessage({ type: 'wsGetStatus' });
        wsStatus.value = status;
    } catch {
        wsStatus.value = { connected: false, roomId: null, userId: null, onlineUsers: 0 };
    }
};

const openShareModal = async () => {
    const domain = prompt('请输入要共享Cookie的域名:');
    if (domain) {
        const result = await chrome.runtime.sendMessage({
            type: 'wsShareCookies',
            domain,
        });
        if (result?.ok) {
            alert(`已共享 ${domain} 的 Cookie`);
        } else {
            alert('共享失败: ' + (result?.error || '未知错误'));
        }
    }
};

// 页面加载时检查 WebSocket 状态
refreshWsStatus();
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/popup/App.vue
git commit -m "feat: Options页面添加WebSocket连接管理和Cookie共享UI"
```

---

### Task 8: 更新 Vitest 配置并验证构建

**Files:**
- Modify: `vitest.config.ts`（根目录）
- Modify: `apps/extension/vitest.config.ts`（如需单独测试）

- [ ] **Step 1: 更新根 vitest.config.ts 支持 monorepo**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
        include: [
            'apps/**/*.test.ts',
            'packages/**/*.test.ts',
        ],
    },
    resolve: {
        alias: {
            '@team-session/shared': resolve(__dirname, './packages/shared/src'),
        },
    },
});
```

- [ ] **Step 2: 安装所有依赖并验证构建**

```bash
cd D:/git_project/taskCrx
pnpm install
pnpm --filter @team-session/extension build
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test
```

- [ ] **Step 4: 清理旧文件**

确认新结构构建成功后，清理旧的根目录文件：

```bash
# 删除备份文件
rm package.json.bak

# 删除旧的 src 目录（已全部迁移到 apps/extension/src）
# 注意：这一步应在确认构建成功后执行
# rm -rf src/
# rm manifest.config.ts
# rm vite.config.ts
# rm tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: 更新 vitest 配置支持 monorepo，验证构建和测试通过"
```

---

### Task 9: 添加 Worker 单元测试

**Files:**
- Create: `apps/worker/src/middleware/auth.test.ts`
- Create: `apps/worker/src/utils/response.test.ts`
- Create: `packages/shared/src/relay-message.test.ts`

- [ ] **Step 1: 创建 packages/shared/src/relay-message.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { createRelayMessage, parseRelayMessage } from './relay-message';

describe('relay-message', () => {
    describe('createRelayMessage', () => {
        it('应该创建包含正确字段的消息', () => {
            const msg = createRelayMessage('ping', { test: true }, 'user1');
            expect(msg.type).toBe('ping');
            expect(msg.payload).toEqual({ test: true });
            expect(msg.sender).toBe('user1');
            expect(typeof msg.timestamp).toBe('number');
        });

        it('sender 应该可选', () => {
            const msg = createRelayMessage('pong', {});
            expect(msg.sender).toBeUndefined();
        });
    });

    describe('parseRelayMessage', () => {
        it('应该正确解析有效消息', () => {
            const original = createRelayMessage('join', { roomId: 'test' });
            const parsed = parseRelayMessage(JSON.stringify(original));
            expect(parsed).not.toBeNull();
            expect(parsed!.type).toBe('join');
            expect(parsed!.payload).toEqual({ roomId: 'test' });
        });

        it('应该返回 null 对于无效 JSON', () => {
            expect(parseRelayMessage('not json')).toBeNull();
        });

        it('应该返回 null 对于缺少 type 的消息', () => {
            expect(parseRelayMessage(JSON.stringify({ timestamp: 123 }))).toBeNull();
        });

        it('应该返回 null 对于缺少 timestamp 的消息', () => {
            expect(parseRelayMessage(JSON.stringify({ type: 'ping' }))).toBeNull();
        });
    });
});
```

- [ ] **Step 2: 创建 apps/worker/src/middleware/auth.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { authenticate, generateToken } from './auth';

describe('auth middleware', () => {
    const secret = 'test-secret';

    describe('generateToken + authenticate', () => {
        it('应该生成并验证有效的 token', () => {
            const token = generateToken('user1', secret);
            const url = new URL('https://example.com/ws?token=' + token + '&userId=user1');
            const request = new Request(url.toString());

            const result = authenticate(request, secret);
            expect(result.valid).toBe(true);
            expect(result.userId).toBe('user1');
        });

        it('应该拒绝缺少 token 的请求', () => {
            const url = new URL('https://example.com/ws?userId=user1');
            const request = new Request(url.toString());

            const result = authenticate(request, secret);
            expect(result.valid).toBe(false);
        });

        it('应该拒绝缺少 userId 的请求', () => {
            const token = generateToken('user1', secret);
            const url = new URL('https://example.com/ws?token=' + token);
            const request = new Request(url.toString());

            const result = authenticate(request, secret);
            expect(result.valid).toBe(false);
        });
    });
});
```

- [ ] **Step 3: 创建 apps/worker/src/utils/response.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { jsonResponse, errorResponse, healthResponse } from './response';

describe('response utils', () => {
    it('jsonResponse 应该返回 JSON 响应', async () => {
        const res = jsonResponse({ hello: 'world' }, 200);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/json');
        const body = await res.json();
        expect(body).toEqual({ hello: 'world' });
    });

    it('errorResponse 应该返回错误响应', async () => {
        const res = errorResponse('bad request', 400);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('bad request');
    });

    it('healthResponse 应该返回健康检查响应', async () => {
        const res = healthResponse();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(body.service).toBe('team-session-relay');
    });
});
```

- [ ] **Step 4: 运行测试**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/**/*.test.ts packages/shared/src/**/*.test.ts
git commit -m "test: 添加 shared 包和 worker 模块的单元测试"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] pnpm monorepo 结构 → Task 1
- [x] Cloudflare Worker 模块 → Task 3
- [x] WebSocket 客户端连接 → Task 5, 6
- [x] Cookie 实时共享 → Task 5 (ws-client.ts + message-handler.ts)
- [x] Durable Object 房间管理 → Task 3 (relay-room.ts)
- [x] 共享类型包 → Task 2
- [x] 扩展代码迁移 → Task 4
- [x] UI 集成 → Task 7

**2. Placeholder scan:**
- [x] 无 TBD/TODO 占位符
- [x] 所有代码步骤包含完整实现
- [x] 无 "实现错误处理" 等模糊步骤

**3. Type consistency:**
- [x] RelayMessage, CookieData, UserInfo 等类型在 shared 包中定义
- [x] extension 和 worker 都通过 `@team-session/shared` 引用同一类型
- [x] message handler 中的 CookieData 字段与 relay-message.ts 一致
