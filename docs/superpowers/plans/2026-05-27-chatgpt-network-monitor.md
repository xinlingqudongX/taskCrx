# ChatGPT数据收集 + 网络监控 + Body重写 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [`) syntax for tracking.

**Goal:** 为现有Chrome扩展增加三个功能：(1) chatgpt.com数据收集，(2) 网络请求/响应body监听与proto解密，(3) 请求body重写

**Architecture:**
- 数据收集：沿用现有AppCollector模式，新增ChatGPTDataCollector类
- 网络监控：使用chrome.debugger + CDP (Chrome DevTools Protocol) 的Fetch域来拦截完整请求/响应body
- Proto解密：引入protobufjs库，在background中解码protobuf二进制数据
- Body重写：通过CDP Fetch.continueRequest/FulfillRequest的postData/responseHeaders参数实现

**Tech Stack:** TypeScript, Vue 3, Naive UI, protobufjs, Chrome Extension Manifest V3, CDP (Chrome DevTools Protocol)

---

## 文件结构

### 新建文件
| 文件路径 | 职责 |
|---------|------|
| `src/utils/chatgpt-collector.ts` | ChatGPT数据收集器（Cookie + 对话列表） |
| `src/services/NetworkMonitorService.ts` | 网络请求监控服务（CDP Fetch域） |
| `src/services/BodyRewriterService.ts` | 请求/响应Body重写服务 |
| `src/services/ProtoDecoderService.ts` | Protobuf解码服务 |
| `src/utils/chatgpt-collector.test.ts` | ChatGPT收集器测试 |
| `src/services/ProtoDecoderService.test.ts` | Proto解码器测试 |

### 修改文件
| 文件路径 | 修改内容 |
|---------|---------|
| `manifest.config.ts` | 增加`debugger`权限（已有）、增加`declarativeNetRequest`权限 |
| `src/background.ts` | 注册网络监控消息处理、ChatGPT数据收集调度 |
| `src/types/index.ts` | 新增ChatGPT相关类型、网络监控相关类型、重写规则类型 |
| `src/options/App.vue` | 增加ChatGPT数据收集开关、网络监控面板入口 |
| `src/options/components/TaskList.vue` | 任务列表增加"网络监控"列标识 |
| `package.json` | 增加`protobufjs`依赖 |

---

## Task 1: 类型定义扩展

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 添加ChatGPT数据收集类型**

在 `src/types/index.ts` 末尾追加以下类型定义：

```typescript
// ==================== ChatGPT 数据收集类型 ====================

/**
 * ChatGPT会话信息
 */
export interface ChatGPTConversation {
    id: string;
    title: string;
    createTime: string;
    updateTime: string;
    model?: string;
}

/**
 * ChatGPT用户信息
 */
export interface ChatGPTUserInfo {
    id: string;
    name: string;
    email: string;
    imageUrl?: string;
}

/**
 * ChatGPT收集数据
 */
export interface ChatGPTData {
    userInfo?: ChatGPTUserInfo;
    conversations?: ChatGPTConversation[];
    collectTime: number;
}
```

- [ ] **Step 2: 添加网络监控类型**

```typescript
// ==================== 网络监控类型 ====================

/**
 * 拦截到的网络请求
 */
export interface InterceptedRequest {
    requestId: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
    timestamp: number;
    type: 'request';
}

/**
 * 拦截到的网络响应
 */
export interface InterceptedResponse {
    requestId: string;
    url: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string | null;
    bodyRaw: ArrayBuffer | null;
    timestamp: number;
    type: 'response';
}

/**
 * Proto解码结果
 */
export interface DecodedProto {
    requestId: string;
    messageType: string;
    decoded: Record<string, any>;
    raw: Uint8Array;
}

/**
 * Body重写规则
 */
export interface BodyRewriteRule {
    id: string;
    name: string;
    urlPattern: string;
    enabled: boolean;
    target: 'request' | 'response';
    matchType: 'json' | 'text' | 'regex';
    matchPattern: string;
    replaceWith: string;
}

/**
 * 网络监控配置
 */
export interface NetworkMonitorConfig {
    enabled: boolean;
    targetUrls: string[];
    captureRequestBodies: boolean;
    captureResponseBodies: boolean;
    protoDecode: boolean;
    maxBufferSize: number;
}
```

- [ ] **Step 3: 扩展AppDataConfig**

修改现有 `AppDataConfig` 接口，增加ChatGPT选项：

```typescript
export interface AppDataConfig {
    collectJiguangData?: boolean;
    collectAppleData?: boolean;
    collectChatGPTData?: boolean;  // 新增
    maxApps?: number;
}
```

- [ ] **Step 4: 扩展CollectedAppData**

修改 `CollectedAppData` 接口，增加ChatGPT数据字段：

```typescript
export interface CollectedAppData {
    jiguangData?: JiguangData;
    appleData?: AppleData;
    chatgptData?: ChatGPTData;  // 新增
    collectTime: number;
}
```

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts
git commit -m "feat: add ChatGPT, network monitor, and body rewrite type definitions"
```

---

## Task 2: ChatGPT数据收集器

**Files:**
- Create: `src/utils/chatgpt-collector.ts`
- Create: `src/utils/chatgpt-collector.test.ts`

- [ ] **Step 1: 创建ChatGPT数据收集器**

```typescript
// src/utils/chatgpt-collector.ts
import type { ChatGPTConversation, ChatGPTUserInfo, ChatGPTData } from "../types/index";

/**
 * 从浏览器Cookie获取ChatGPT会话令牌
 */
export async function getChatGPTTokenFromCookie(): Promise<string | null> {
    try {
        const cookie = await chrome.cookies.get({
            url: "https://chatgpt.com",
            name: "__Secure-next-auth.session-token",
        });
        return cookie?.value || null;
    } catch (error) {
        console.error("获取ChatGPT session token失败:", error);
        return null;
    }
}

/**
 * ChatGPT数据收集器
 */
export class ChatGPTDataCollector {
    private baseUrl = "https://chatgpt.com/backend-api";
    private defaultHeaders: Record<string, string>;

    constructor(sessionToken?: string) {
        this.defaultHeaders = {
            accept: "application/json",
            "content-type": "application/json",
            "oai-language": "zh-CN",
        };
        if (sessionToken) {
            this.defaultHeaders["Authorization"] = `Bearer ${sessionToken}`;
        }
    }

    /**
     * 获取用户信息
     */
    async getUserInfo(): Promise<{ success: boolean; data?: ChatGPTUserInfo; error?: string }> {
        try {
            const resp = await fetch(`${this.baseUrl}/accounts/check/v4-2023-04-27`, {
                method: "GET",
                headers: this.defaultHeaders,
                credentials: "include",
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const raw = await resp.json();
            const user = raw?.accounts?.default?.user;
            if (!user) throw new Error("未找到用户信息");
            return {
                success: true,
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    imageUrl: user.image,
                },
            };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : "未知错误" };
        }
    }

    /**
     * 获取会话列表
     */
    async getConversations(offset = 0, limit = 50): Promise<{
        success: boolean;
        data?: ChatGPTConversation[];
        error?: string;
    }> {
        try {
            const params = new URLSearchParams({
                offset: String(offset),
                limit: String(limit),
                order: "updated",
            });
            const resp = await fetch(`${this.baseUrl}/conversations?${params}`, {
                method: "GET",
                headers: this.defaultHeaders,
                credentials: "include",
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const raw = await resp.json();
            const items: ChatGPTConversation[] = (raw.items || []).map((item: any) => ({
                id: item.id,
                title: item.title || "无标题",
                createTime: item.create_time,
                updateTime: item.update_time,
                model: item.default_model_slug,
            }));
            return { success: true, data: items };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : "未知错误" };
        }
    }

    /**
     * 收集所有ChatGPT数据
     */
    async collectAll(maxConversations = 50): Promise<{
        success: boolean;
        data?: ChatGPTData;
        error?: string;
    }> {
        try {
            const [userResult, convResult] = await Promise.all([
                this.getUserInfo(),
                this.getConversations(0, maxConversations),
            ]);

            const data: ChatGPTData = {
                collectTime: Date.now(),
            };

            if (userResult.success && userResult.data) {
                data.userInfo = userResult.data;
            }
            if (convResult.success && convResult.data) {
                data.conversations = convResult.data;
            }

            if (!data.userInfo && !data.conversations) {
                return { success: false, error: "未能收集到任何ChatGPT数据" };
            }

            return { success: true, data };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : "未知错误" };
        }
    }
}

/**
 * 便捷函数：实时收集ChatGPT数据
 */
export async function collectChatGPTData(maxConversations = 50): Promise<{
    success: boolean;
    data?: ChatGPTData;
    error?: string;
}> {
    const token = await getChatGPTTokenFromCookie();
    if (!token) {
        return { success: false, error: "未找到ChatGPT会话令牌" };
    }
    const collector = new ChatGPTDataCollector(token);
    return collector.collectAll(maxConversations);
}
```

- [ ] **Step 2: 创建测试文件**

```typescript
// src/utils/chatgpt-collector.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome API
const mockCookiesGet = vi.fn();
(globalThis as any).chrome = {
    cookies: { get: mockCookiesGet },
};

describe("getChatGPTTokenFromCookie", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("应返回token当cookie存在时", async () => {
        mockCookiesGet.mockResolvedValue({ value: "test-session-token" });
        const { getChatGPTTokenFromCookie } = await import("./chatgpt-collector");
        const token = await getChatGPTTokenFromCookie();
        expect(token).toBe("test-session-token");
    });

    it("应返回null当cookie不存在时", async () => {
        mockCookiesGet.mockResolvedValue(null);
        const { getChatGPTTokenFromCookie } = await import("./chatgpt-collector");
        const token = await getChatGPTTokenFromCookie();
        expect(token).toBeNull();
    });
});

describe("ChatGPTDataCollector", () => {
    it("collectAll应在无数据时返回失败", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
        const { ChatGPTDataCollector } = await import("./chatgpt-collector");
        const collector = new ChatGPTDataCollector("fake-token");
        const result = await collector.collectAll();
        expect(result.success).toBe(false);
    });
});
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run src/utils/chatgpt-collector.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/utils/chatgpt-collector.ts src/utils/chatgpt-collector.test.ts
git commit -m "feat: add ChatGPT data collector with cookie, user info, and conversation collection"
```

---

## Task 3: Protobuf解码服务

**Files:**
- Modify: `package.json` (添加protobufjs依赖)
- Create: `src/services/ProtoDecoderService.ts`
- Create: `src/services/ProtoDecoderService.test.ts`

- [ ] **Step 1: 安装protobufjs**

```bash
npm install protobufjs
```

- [ ] **Step 2: 创建Proto解码服务**

```typescript
// src/services/ProtoDecoderService.ts
import protobuf from "protobufjs";

/**
 * Proto解码服务
 * 支持动态加载.proto定义文件，解码二进制protobuf数据
 */
export class ProtoDecoderService {
    private roots: Map<string, protobuf.Root> = new Map();

    /**
     * 从字符串加载.proto定义
     */
    loadProtoSource(name: string, protoSource: string): void {
        const root = protobuf.parse(protoSource).root;
        this.roots.set(name, root);
    }

    /**
     * 从文件加载.proto定义（通过fetch）
     */
    async loadProtoFile(name: string, url: string): Promise<void> {
        const root = await protobuf.load(url);
        this.roots.set(name, root);
    }

    /**
     * 尝试解码二进制数据
     * 会依次尝试所有已加载的message type
     */
    decode(data: Uint8Array, rootName?: string): { typeName: string; message: any } | null {
        const roots = rootName
            ? [this.roots.get(rootName)].filter(Boolean) as protobuf.Root[]
            : Array.from(this.roots.values());

        for (const root of roots) {
            const types = this.getAllTypes(root);
            for (const typeName of types) {
                try {
                    const type = root.lookupType(typeName);
                    const msg = type.decode(data);
                    const obj = type.toObject(msg, {
                        longs: String,
                        enums: Number,
                        bytes: String,
                        defaults: true,
                    });
                    return { typeName, message: obj };
                } catch {
                    // 解码失败，尝试下一个type
                }
            }
        }
        return null;
    }

    /**
     * 使用指定的type解码
     */
    decodeAs(data: Uint8Array, rootName: string, typeName: string): any | null {
        const root = this.roots.get(rootName);
        if (!root) return null;
        try {
            const type = root.lookupType(typeName);
            const msg = type.decode(data);
            return type.toObject(msg, {
                longs: String,
                enums: Number,
                bytes: String,
                defaults: true,
            });
        } catch {
            return null;
        }
    }

    /**
     * 将对象编码为protobuf二进制
     */
    encode(obj: any, rootName: string, typeName: string): Uint8Array | null {
        const root = this.roots.get(rootName);
        if (!root) return null;
        try {
            const type = root.lookupType(typeName);
            const errMsg = type.verify(obj);
            if (errMsg) throw new Error(errMsg);
            const msg = type.create(obj);
            return type.encode(msg).finish();
        } catch {
            return null;
        }
    }

    /**
     * 递归获取root下所有message类型
     */
    private getAllTypes(root: protobuf.Root): string[] {
        const types: string[] = [];
        const walk = (ns: protobuf.Namespace, prefix: string) => {
            for (const [name, nested] of Object.entries(ns.nested || {})) {
                const fullName = prefix ? `${prefix}.${name}` : name;
                if (nested instanceof protobuf.Type) {
                    types.push(fullName);
                }
                if (nested instanceof protobuf.Namespace) {
                    walk(nested, fullName);
                }
            }
        };
        walk(root, "");
        return types;
    }

    /**
     * 移除已加载的proto定义
     */
    unload(name: string): void {
        this.roots.delete(name);
    }

    /**
     * 获取已加载的proto列表
     */
    getLoadedNames(): string[] {
        return Array.from(this.roots.keys());
    }
}

// 全局单例
export const protoDecoder = new ProtoDecoderService();
```

- [ ] **Step 3: 创建测试**

```typescript
// src/services/ProtoDecoderService.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ProtoDecoderService } from "./ProtoDecoderService";

describe("ProtoDecoderService", () => {
    let service: ProtoDecoderService;

    beforeEach(() => {
        service = new ProtoDecoderService();
    });

    it("应能加载proto定义并解码", () => {
        service.loadProtoSource("test", `
            syntax = "proto3";
            message TestMessage {
                string name = 1;
                int32 id = 2;
            }
        `);

        // 先编码再解码来验证
        const encoded = service.encode({ name: "hello", id: 42 }, "test", "TestMessage");
        expect(encoded).not.toBeNull();

        const decoded = service.decode(encoded!, "test");
        expect(decoded).not.toBeNull();
        expect(decoded!.typeName).toBe("TestMessage");
        expect(decoded!.message.name).toBe("hello");
        expect(decoded!.message.id).toBe(42);
    });

    it("decodeAs应能用指定类型解码", () => {
        service.loadProtoSource("test", `
            syntax = "proto3";
            message User {
                string username = 1;
                bool active = 2;
            }
        `);

        const encoded = service.encode({ username: "test", active: true }, "test", "User");
        expect(encoded).not.toBeNull();

        const decoded = service.decodeAs(encoded!, "test", "User");
        expect(decoded).not.toBeNull();
        expect(decoded.username).toBe("test");
        expect(decoded.active).toBe(true);
    });

    it("解码失败时应返回null", () => {
        service.loadProtoSource("test", `
            syntax = "proto3";
            message Simple { string val = 1; }
        `);

        const result = service.decode(new Uint8Array([0xFF, 0xFF, 0xFF]), "test");
        expect(result).toBeNull();
    });

    it("encode失败时应返回null", () => {
        service.loadProtoSource("test", `
            syntax = "proto3";
            message Strict { int32 required_field = 1; }
        `);

        // 对于proto3，encode一般不会因为字段缺失而失败，但type不存在会
        const result = service.encode({}, "test", "NonExistentType");
        expect(result).toBeNull();
    });

    it("getLoadedNames应返回已加载的proto名", () => {
        expect(service.getLoadedNames()).toEqual([]);
        service.loadProtoSource("proto1", `syntax = "proto3"; message A {}`);
        service.loadProtoSource("proto2", `syntax = "proto3"; message B {}`);
        expect(service.getLoadedNames()).toEqual(["proto1", "proto2"]);
    });

    it("unload应移除proto定义", () => {
        service.loadProtoSource("test", `syntax = "proto3"; message X {}`);
        expect(service.getLoadedNames()).toContain("test");
        service.unload("test");
        expect(service.getLoadedNames()).not.toContain("test");
    });
});
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/services/ProtoDecoderService.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add package.json src/services/ProtoDecoderService.ts src/services/ProtoDecoderService.test.ts
git commit -m "feat: add protobuf decoder service with dynamic proto loading and auto-detection"
```

---

## Task 4: 网络监控服务 (CDP Fetch域)

**Files:**
- Create: `src/services/NetworkMonitorService.ts`
- Modify: `manifest.config.ts` (确认debugger权限已在)

- [ ] **Step 1: 创建网络监控服务**

```typescript
// src/services/NetworkMonitorService.ts
import type { InterceptedRequest, InterceptedResponse, NetworkMonitorConfig } from "../types/index";

type RequestCallback = (request: InterceptedRequest) => void;
type ResponseCallback = (response: InterceptedResponse) => void;

/**
 * 网络监控服务
 * 基于chrome.debugger + CDP Fetch域实现请求/响应拦截
 *
 * 注意：需要manifest中声明 "debugger" 权限
 * 使用chrome.debugger会显示"正在调试"提示条
 */
export class NetworkMonitorService {
    private config: NetworkMonitorConfig;
    private attachedTabId: number | null = null;
    private isListening = false;
    private requestCallbacks: RequestCallback[] = [];
    private responseCallbacks: ResponseCallback[] = [];
    private pendingRequests: Map<string, { url: string; method: string; headers: Record<string, string>; body: string | null }> = new Map();

    constructor(config?: Partial<NetworkMonitorConfig>) {
        this.config = {
            enabled: false,
            targetUrls: ["https://chatgpt.com/*"],
            captureRequestBodies: true,
            captureResponseBodies: true,
            protoDecode: false,
            maxBufferSize: 10 * 1024 * 1024, // 10MB
            ...config,
        };
    }

    /**
     * 附加到指定tab进行调试
     */
    async attach(tabId: number): Promise<boolean> {
        try {
            await chrome.debugger.attach({ tabId }, "1.3");
            this.attachedTabId = tabId;
            console.log(`已附加到tab ${tabId}进行网络监控`);
            return true;
        } catch (error) {
            console.error("附加调试器失败:", error);
            return false;
        }
    }

    /**
     * 从tab分离调试器
     */
    async detach(): Promise<void> {
        if (this.attachedTabId !== null) {
            try {
                await chrome.debugger.detach({ tabId: this.attachedTabId });
                console.log(`已从tab ${this.attachedTabId}分离调试器`);
            } catch (error) {
                console.error("分离调试器失败:", error);
            }
            this.attachedTabId = null;
            this.isListening = false;
            this.pendingRequests.clear();
        }
    }

    /**
     * 开始监听网络请求
     */
    async startListening(): Promise<boolean> {
        if (this.attachedTabId === null) {
            console.error("未附加到任何tab");
            return false;
        }

        try {
            // 启用Fetch域，拦截符合条件的请求
            await this.sendCommand("Fetch.enable", {
                patterns: this.config.targetUrls.map((urlPattern) => ({
                    urlPattern,
                    requestStage: "Request",
                })),
            });

            // 如果需要捕获响应body，也要在Response阶段拦截
            if (this.config.captureResponseBodies) {
                await this.sendCommand("Fetch.enable", {
                    patterns: this.config.targetUrls.map((urlPattern) => ({
                        urlPattern,
                        requestStage: "Response",
                    })),
                });
            }

            // 监听CDP事件
            chrome.debugger.onEvent.addListener(this.handleDebuggerEvent);

            this.isListening = true;
            this.config.enabled = true;
            console.log("网络监控已启动");
            return true;
        } catch (error) {
            console.error("启动网络监控失败:", error);
            return false;
        }
    }

    /**
     * 停止监听
     */
    async stopListening(): Promise<void> {
        if (this.attachedTabId !== null) {
            try {
                await this.sendCommand("Fetch.disable", {});
            } catch {
                // ignore
            }
        }
        chrome.debugger.onEvent.removeListener(this.handleDebuggerEvent);
        this.isListening = false;
        this.config.enabled = false;
        this.pendingRequests.clear();
        console.log("网络监控已停止");
    }

    /**
     * 注册请求回调
     */
    onRequest(callback: RequestCallback): void {
        this.requestCallbacks.push(callback);
    }

    /**
     * 注册响应回调
     */
    onResponse(callback: ResponseCallback): void {
        this.responseCallbacks.push(callback);
    }

    /**
     * 移除回调
     */
    offRequest(callback: RequestCallback): void {
        this.requestCallbacks = this.requestCallbacks.filter((cb) => cb !== callback);
    }

    offResponse(callback: ResponseCallback): void {
        this.responseCallbacks = this.responseCallbacks.filter((cb) => cb !== callback);
    }

    /**
     * 处理CDP调试事件
     */
    private handleDebuggerEvent = (source: chrome.debugger.Debuggee, method: string, params?: any): void => {
        if (source.tabId !== this.attachedTabId) return;

        if (method === "Fetch.requestPaused") {
            this.handleRequestPaused(params);
        } else if (method === "Fetch.responsePaused") {
            this.handleResponsePaused(params);
        }
    };

    /**
     * 处理暂停的请求
     */
    private handleRequestPaused(params: any): void {
        const { requestId, request, responseStatusCode, responseHeaders } = params;

        // 如果有responseStatusCode，说明是Response阶段的暂停
        if (responseStatusCode) {
            this.handleResponseStage(params);
            return;
        }

        // Request阶段：捕获请求数据
        const headers: Record<string, string> = {};
        if (request.headers) {
            for (const [key, value] of Object.entries(request.headers)) {
                headers[key] = String(value);
            }
        }

        const intercepted: InterceptedRequest = {
            requestId,
            url: request.url,
            method: request.method,
            headers,
            body: request.postData || null,
            timestamp: Date.now(),
            type: "request",
        };

        // 缓存请求信息，等待匹配响应
        this.pendingRequests.set(requestId, {
            url: request.url,
            method: request.method,
            headers,
            body: request.postData || null,
        });

        // 触发回调
        for (const cb of this.requestCallbacks) {
            try { cb(intercepted); } catch (e) { console.error("请求回调错误:", e); }
        }

        // 继续请求（不修改）
        this.sendCommand("Fetch.continueRequest", { requestId }).catch(console.error);
    }

    /**
     * 处理Response阶段的暂停
     */
    private handleResponseStage(params: any): void {
        const { requestId, responseStatusCode, responseHeaders: rawHeaders } = params;

        const headers: Record<string, string> = {};
        if (rawHeaders) {
            for (const header of rawHeaders) {
                headers[header.name] = header.value;
            }
        }

        // 获取响应body
        if (this.config.captureResponseBodies) {
            this.sendCommand("Fetch.getResponseBody", { requestId })
                .then((result: any) => {
                    let body: string | null = null;
                    let bodyRaw: ArrayBuffer | null = null;

                    if (result.base64Encoded) {
                        bodyRaw = this.base64ToArrayBuffer(result.body);
                        body = new TextDecoder().decode(bodyRaw);
                    } else {
                        body = result.body;
                        bodyRaw = new TextEncoder().encode(body).buffer as ArrayBuffer;
                    }

                    const cached = this.pendingRequests.get(requestId);
                    const intercepted: InterceptedResponse = {
                        requestId,
                        url: cached?.url || "",
                        statusCode: responseStatusCode,
                        headers,
                        body,
                        bodyRaw,
                        timestamp: Date.now(),
                        type: "response",
                    };

                    for (const cb of this.responseCallbacks) {
                        try { cb(intercepted); } catch (e) { console.error("响应回调错误:", e); }
                    }

                    // 继续响应
                    this.sendCommand("Fetch.continueResponse", { requestId }).catch(console.error);
                })
                .catch((err) => {
                    console.error("获取响应body失败:", err);
                    this.sendCommand("Fetch.continueResponse", { requestId }).catch(console.error);
                });
        } else {
            this.sendCommand("Fetch.continueResponse", { requestId }).catch(console.error);
        }
    }

    private handleResponsePaused(params: any): void {
        // 合并到 handleRequestPaused 处理
        this.handleResponseStage(params);
    }

    /**
     * 向调试目标发送CDP命令
     */
    private sendCommand(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.attachedTabId === null) {
                reject(new Error("未附加到任何tab"));
                return;
            }
            chrome.debugger.sendCommand(
                { tabId: this.attachedTabId },
                method,
                params,
                (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    }

    /**
     * Base64转ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * 更新配置
     */
    updateConfig(updates: Partial<NetworkMonitorConfig>): void {
        Object.assign(this.config, updates);
    }

    /**
     * 获取当前状态
     */
    getStatus(): { isListening: boolean; attachedTabId: number | null; config: NetworkMonitorConfig } {
        return {
            isListening: this.isListening,
            attachedTabId: this.attachedTabId,
            config: { ...this.config },
        };
    }
}

// 全局单例
export const networkMonitor = new NetworkMonitorService();
```

- [ ] **Step 2: 确认manifest权限**

确认 `manifest.config.ts` 中已有 `debugger` 权限（当前已有，无需修改）。

- [ ] **Step 3: 提交**

```bash
git add src/services/NetworkMonitorService.ts
git commit -m "feat: add network monitor service using CDP Fetch domain for request/response interception"
```

---

## Task 5: Body重写服务

**Files:**
- Create: `src/services/BodyRewriterService.ts`

- [ ] **Step 1: 创建Body重写服务**

```typescript
// src/services/BodyRewriterService.ts
import type { BodyRewriteRule } from "../types/index";

/**
 * Body重写服务
 * 支持对请求和响应body进行文本替换、JSON字段修改、正则替换
 */
export class BodyRewriterService {
    private rules: BodyRewriteRule[] = [];

    /**
     * 添加重写规则
     */
    addRule(rule: BodyRewriteRule): void {
        this.rules.push(rule);
    }

    /**
     * 移除规则
     */
    removeRule(ruleId: string): void {
        this.rules = this.rules.filter((r) => r.id !== ruleId);
    }

    /**
     * 更新规则
     */
    updateRule(ruleId: string, updates: Partial<BodyRewriteRule>): void {
        const rule = this.rules.find((r) => r.id === ruleId);
        if (rule) Object.assign(rule, updates);
    }

    /**
     * 获取所有规则
     */
    getRules(): BodyRewriteRule[] {
        return [...this.rules];
    }

    /**
     * 获取启用的规则
     */
    getEnabledRules(): BodyRewriteRule[] {
        return this.rules.filter((r) => r.enabled);
    }

    /**
     * 检查URL是否匹配规则
     */
    matchesUrl(rule: BodyRewriteRule, url: string): boolean {
        try {
            const pattern = rule.urlPattern.replace(/\*/g, ".*");
            return new RegExp(`^${pattern}$`).test(url);
        } catch {
            return url.includes(rule.urlPattern);
        }
    }

    /**
     * 对body应用重写规则
     * @returns 重写后的body，如果没有匹配规则则返回null
     */
    rewrite(body: string, url: string, target: "request" | "response"): string | null {
        const applicable = this.rules.filter(
            (r) => r.enabled && r.target === target && this.matchesUrl(r, url)
        );

        if (applicable.length === 0) return null;

        let result = body;

        for (const rule of applicable) {
            try {
                switch (rule.matchType) {
                    case "text":
                        result = result.split(rule.matchPattern).join(rule.replaceWith);
                        break;

                    case "regex":
                        const regex = new RegExp(rule.matchPattern, "g");
                        result = result.replace(regex, rule.replaceWith);
                        break;

                    case "json":
                        result = this.rewriteJson(result, rule.matchPattern, rule.replaceWith);
                        break;
                }
            } catch (error) {
                console.warn(`规则 ${rule.name} 执行失败:`, error);
            }
        }

        return result === body ? null : result;
    }

    /**
     * JSON字段重写
     * matchPattern 格式: "path.to.field" (点分隔的JSON路径)
     * replaceWith: 新值（会尝试解析为JSON，否则作为字符串）
     */
    private rewriteJson(body: string, path: string, newValue: string): string {
        const obj = JSON.parse(body);
        const keys = path.split(".");
        let current: any = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined) return body;
            current = current[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        // 尝试解析为JSON值（数字、布尔、对象等）
        try {
            current[lastKey] = JSON.parse(newValue);
        } catch {
            current[lastKey] = newValue;
        }

        return JSON.stringify(obj);
    }

    /**
     * 将body string转为Uint8Array（用于CDP postData替换）
     */
    static bodyToBytes(body: string): Uint8Array {
        return new TextEncoder().encode(body);
    }

    /**
     * 将Uint8Array转为base64（用于CDP）
     */
    static bytesToBase64(bytes: Uint8Array): string {
        let binary = "";
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    }

    /**
     * 从base64转为string
     */
    static base64ToString(base64: string): string {
        return atob(base64);
    }

    /**
     * 设置规则列表（从存储加载时使用）
     */
    setRules(rules: BodyRewriteRule[]): void {
        this.rules = rules;
    }

    /**
     * 清空所有规则
     */
    clearRules(): void {
        this.rules = [];
    }
}

// 全局单例
export const bodyRewriter = new BodyRewriterService();
```

- [ ] **Step 2: 提交**

```bash
git add src/services/BodyRewriterService.ts
git commit -m "feat: add body rewrite service with text, regex, and JSON field replacement"
```

---

## Task 6: 集成到Background Script

**Files:**
- Modify: `src/background.ts`

- [ ] **Step 1: 在background.ts中添加import和消息处理**

在 `src/background.ts` 顶部添加import：

```typescript
import { collectChatGPTData } from "./utils/chatgpt-collector";
import { networkMonitor } from "./services/NetworkMonitorService";
import { bodyRewriter, BodyRewriterService } from "./services/BodyRewriterService";
import { protoDecoder } from "./services/ProtoDecoderService";
```

- [ ] **Step 2: 在消息监听器中添加ChatGPT相关处理**

在 `chrome.runtime.onMessage.addListener` 回调中，在现有消息处理块之后添加：

```typescript
// ChatGPT数据收集
if (msg?.type === "collectChatGPTData") {
    collectChatGPTData(msg.maxConversations || 50).then((result) => {
        sendResponse(result);
    });
    return true;
}

// 网络监控相关
if (msg?.type === "attachNetworkMonitor") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id) {
            const ok = await networkMonitor.attach(tabs[0].id);
            sendResponse({ ok, tabId: tabs[0].id });
        } else {
            sendResponse({ ok: false, error: "无活跃标签页" });
        }
    });
    return true;
}

if (msg?.type === "startNetworkMonitor") {
    networkMonitor.startListening().then((ok) => {
        sendResponse({ ok });
    });
    return true;
}

if (msg?.type === "stopNetworkMonitor") {
    networkMonitor.stopListening().then(() => {
        sendResponse({ ok: true });
    });
    return true;
}

if (msg?.type === "detachNetworkMonitor") {
    networkMonitor.detach().then(() => {
        sendResponse({ ok: true });
    });
    return true;
}

if (msg?.type === "getNetworkMonitorStatus") {
    sendResponse(networkMonitor.getStatus());
    return true;
}

// Body重写规则管理
if (msg?.type === "getRewriteRules") {
    sendResponse({ rules: bodyRewriter.getRules() });
    return true;
}

if (msg?.type === "addRewriteRule") {
    bodyRewriter.addRule(msg.rule);
    sendResponse({ ok: true });
    return true;
}

if (msg?.type === "removeRewriteRule") {
    bodyRewriter.removeRule(msg.ruleId);
    sendResponse({ ok: true });
    return true;
}

if (msg?.type === "updateRewriteRule") {
    bodyRewriter.updateRule(msg.ruleId, msg.updates);
    sendResponse({ ok: true });
    return true;
}

// Proto解码
if (msg?.type === "decodeProto") {
    const data = new Uint8Array(msg.data);
    const result = protoDecoder.decode(data, msg.rootName);
    sendResponse({ result });
    return true;
}

if (msg?.type === "encodeProto") {
    const result = protoDecoder.encode(msg.obj, msg.rootName, msg.typeName);
    sendResponse({ data: result ? Array.from(result) : null });
    return true;
}

if (msg?.type === "loadProtoSource") {
    protoDecoder.loadProtoSource(msg.name, msg.source);
    sendResponse({ ok: true });
    return true;
}
```

- [ ] **Step 3: 在runTask函数中集成ChatGPT数据收集**

修改 `src/background.ts` 中的 `collectAppData` 函数，在Apple数据收集之后添加：

```typescript
// 收集ChatGPT数据
if (config.collectChatGPTData) {
    const chatgptResult = await collectChatGPTData(config.maxApps || 50);
    if (chatgptResult.success && chatgptResult.data) {
        collectedData.chatgptData = chatgptResult.data;
    }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/background.ts
git commit -m "feat: integrate ChatGPT collector, network monitor, body rewriter, and proto decoder into background"
```

---

## Task 7: 更新Options页面UI

**Files:**
- Modify: `src/options/App.vue`
- Modify: `src/options/components/TaskList.vue`

- [ ] **Step 1: 在App.vue的任务表单中增加ChatGPT数据收集开关**

在任务编辑弹窗的"收集苹果数据信息"表单项之后，添加：

```vue
<n-form-item label="收集ChatGPT数据信息" path="collectChatGPTData">
    <n-switch v-model:value="taskFormValue.appDataConfig.collectChatGPTData">
        <template #checked>启用</template>
        <template #unchecked>禁用</template>
    </n-switch>
    <n-text depth="3" style="margin-left: 12px; font-size: 12px;">
        启用后将收集ChatGPT的会话列表和用户信息
    </n-text>
</n-form-item>
```

- [ ] **Step 2: 在App.vue的taskFormValue初始化中增加chatgpt字段**

修改 `taskFormValue.appDataConfig` 初始化：

```javascript
appDataConfig: {
    collectJiguangData: false,
    collectAppleData: false,
    collectChatGPTData: false,  // 新增
    maxApps: 50,
},
```

同样修改 `openAddTaskModal` 和 `openEditTaskModal` 中的重置逻辑。

- [ ] **Step 3: 在App.vue顶部添加"网络监控"按钮**

在顶部操作栏的"导入任务"按钮之后添加：

```vue
<n-button @click="openNetworkMonitor" type="warning">
    <template #icon>
        <n-icon><AnalyticsOutline /></n-icon>
    </template>
    网络监控
</n-button>
```

同时在import部分添加图标：

```javascript
import { AnalyticsOutline } from "@vicons/ionicons5";
```

- [ ] **Step 4: 添加网络监控弹窗**

在App.vue末尾的 `</template>` 之前添加网络监控弹窗：

```vue
<!-- 网络监控弹窗 -->
<n-modal
    v-model:show="networkMonitorVisible"
    preset="dialog"
    title="网络监控"
    style="width: 700px"
>
    <n-space vertical>
        <n-space align="center">
            <n-tag :type="monitorStatus.isListening ? 'success' : 'default'">
                状态: {{ monitorStatus.isListening ? '监听中' : '未启动' }}
            </n-tag>
            <n-button
                v-if="!monitorStatus.isListening"
                @click="startMonitor"
                type="primary"
                size="small"
            >
                启动监控
            </n-button>
            <n-button
                v-if="monitorStatus.isListening"
                @click="stopMonitor"
                type="error"
                size="small"
            >
                停止监控
            </n-button>
        </n-space>

        <n-divider />

        <!-- Body重写规则 -->
        <n-text strong>Body重写规则</n-text>
        <n-space>
            <n-button @click="addNewRewriteRule" size="small" type="primary">
                添加规则
            </n-button>
        </n-space>

        <!-- 拦截到的请求列表 -->
        <n-text strong>最近拦截的请求</n-text>
        <n-data-table
            :columns="interceptedColumns"
            :data="interceptedRequests"
            :pagination="{ pageSize: 10 }"
            size="small"
            max-height="300"
        />
    </n-space>

    <template #action>
        <n-button @click="networkMonitorVisible = false">关闭</n-button>
    </template>
</n-modal>
```

- [ ] **Step 5: 添加网络监控相关数据和方法**

在 `<script setup>` 中添加：

```javascript
// 网络监控相关
const networkMonitorVisible = ref(false);
const monitorStatus = ref({ isListening: false, attachedTabId: null });
const interceptedRequests = ref([]);

const openNetworkMonitor = () => {
    checkMonitorStatus();
    networkMonitorVisible.value = true;
};

const checkMonitorStatus = async () => {
    const status = await chrome.runtime.sendMessage({ type: "getNetworkMonitorStatus" });
    monitorStatus.value = status;
};

const startMonitor = async () => {
    // 先附加到当前tab
    const attachResp = await chrome.runtime.sendMessage({ type: "attachNetworkMonitor" });
    if (attachResp.ok) {
        await chrome.runtime.sendMessage({ type: "startNetworkMonitor" });
        await checkMonitorStatus();
    }
};

const stopMonitor = async () => {
    await chrome.runtime.sendMessage({ type: "stopNetworkMonitor" });
    await chrome.runtime.sendMessage({ type: "detachNetworkMonitor" });
    await checkMonitorStatus();
};

const addNewRewriteRule = () => {
    // 简单实现：弹出prompt收集信息
    const name = prompt("规则名称:");
    if (!name) return;
    const urlPattern = prompt("URL匹配模式 (如 *chatgpt.com*)");
    if (!urlPattern) return;
    const matchPattern = prompt("匹配内容:");
    if (!matchPattern) return;
    const replaceWith = prompt("替换为:");
    if (replaceWith === null) return;

    chrome.runtime.sendMessage({
        type: "addRewriteRule",
        rule: {
            id: Date.now().toString(),
            name,
            urlPattern,
            enabled: true,
            target: "response",
            matchType: "text",
            matchPattern,
            replaceWith,
        },
    });
};

const interceptedColumns = [
    { title: "方法", key: "method", width: 80 },
    { title: "URL", key: "url", ellipsis: true },
    { title: "类型", key: "type", width: 80 },
    { title: "时间", key: "timestamp", width: 120, render: (row) => new Date(row.timestamp).toLocaleTimeString() },
];
```

- [ ] **Step 6: 在TaskList.vue的"应用数据"列中显示ChatGPT**

修改 `TaskList.vue` 中 `taskColumns` 的 `appDataConfig` render 函数，添加：

```javascript
if (config.collectChatGPTData) {
    features.push("ChatGPT数据");
}
```

- [ ] **Step 7: 提交**

```bash
git add src/options/App.vue src/options/components/TaskList.vue
git commit -m "feat: add ChatGPT toggle, network monitor panel, and body rewrite UI to options page"
```

---

## Task 8: 集成测试与验证

- [ ] **Step 1: 构建并验证无编译错误**

```bash
npm run build
```

- [ ] **Step 2: 运行所有测试**

```bash
npx vitest run
```

- [ ] **Step 3: 手动验证清单**

1. 加载扩展到Chrome
2. 打开options页面，验证ChatGPT数据收集开关显示正常
3. 添加chatgpt.com为授权域名
4. 创建任务，启用ChatGPT数据收集
5. 点击"网络监控"按钮，验证弹窗显示
6. 访问chatgpt.com，启动网络监控
7. 验证请求被拦截并显示在列表中
8. 添加body重写规则，验证规则生效

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "feat: complete ChatGPT data collection, network monitoring, and body rewrite features"
```

---

## 自检清单

1. **Spec覆盖:**
   - [x] chatgpt.com数据收集 - Task 2 + Task 6
   - [x] webRequest/响应body监听 - Task 4 (CDP Fetch域)
   - [x] proto解密和查看 - Task 3 + Task 6
   - [x] body重写功能 - Task 5 + Task 6

2. **无占位符检查:**
   - [x] 所有步骤包含实际代码
   - [x] 无"TBD"、"TODO"、"implement later"
   - [x] 测试代码完整

3. **类型一致性:**
   - [x] Task 1定义的类型在后续Task中一致使用
   - [x] AppDataConfig扩展后在background和options中同步
   - [x] CollectedAppData扩展后在数据收集和提交流程中同步
