import type { InterceptedRequest, InterceptedResponse, NetworkMonitorConfig } from "../types/index";

type RequestCallback = (request: InterceptedRequest) => void;
type ResponseCallback = (response: InterceptedResponse) => void;

export class NetworkMonitorService {
    private config: NetworkMonitorConfig;
    private attachedTabId: number | null = null;
    private isListening = false;
    private requestCallbacks: RequestCallback[] = [];
    private responseCallbacks: ResponseCallback[] = [];
    private pendingRequests: Map<string, { url: string; method: string; headers: Record<string, string>; body: string | null; timestamp: number }> = new Map();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly PENDING_TTL = 30_000; // 30s

    constructor(config?: Partial<NetworkMonitorConfig>) {
        this.config = {
            enabled: false,
            targetUrls: ["*://*/*"],
            captureRequestBodies: true,
            captureResponseBodies: true,
            protoDecode: false,
            maxBufferSize: 10 * 1024 * 1024,
            ...config,
        };
    }

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

    async detach(): Promise<void> {
        if (this.attachedTabId !== null) {
            try {
                await chrome.debugger.detach({ tabId: this.attachedTabId });
            } catch (error) {
                console.error("分离调试器失败:", error);
            }
            this.attachedTabId = null;
            this.isListening = false;
            this.pendingRequests.clear();
        }
    }

    async startListening(): Promise<boolean> {
        if (this.attachedTabId === null) {
            console.error("未附加到任何tab");
            return false;
        }

        try {
            // 启用Network域用于请求/响应监听
            await this.sendCommand("Network.enable", {});

            // 监听CDP事件
            chrome.debugger.onEvent.addListener(this.handleDebuggerEvent);

            this.isListening = true;
            this.config.enabled = true;
            this.startCleanupTimer();
            console.log("网络监控已启动");
            return true;
        } catch (error) {
            console.error("启动网络监控失败:", error);
            return false;
        }
    }

    async stopListening(): Promise<void> {
        if (this.attachedTabId !== null) {
            try {
                await this.sendCommand("Network.disable", {});
            } catch {
                // ignore
            }
        }
        chrome.debugger.onEvent.removeListener(this.handleDebuggerEvent);
        this.isListening = false;
        this.config.enabled = false;
        this.stopCleanupTimer();
        this.pendingRequests.clear();
        console.log("网络监控已停止");
    }

    onRequest(callback: RequestCallback): void {
        this.requestCallbacks.push(callback);
    }

    onResponse(callback: ResponseCallback): void {
        this.responseCallbacks.push(callback);
    }

    offRequest(callback: RequestCallback): void {
        this.requestCallbacks = this.requestCallbacks.filter((cb) => cb !== callback);
    }

    offResponse(callback: ResponseCallback): void {
        this.responseCallbacks = this.responseCallbacks.filter((cb) => cb !== callback);
    }

    private handleDebuggerEvent = (source: chrome.debugger.Debuggee, method: string, params?: any): void => {
        if (source.tabId !== this.attachedTabId) return;

        switch (method) {
            case "Network.requestWillBeSent":
                this.handleRequestWillBeSent(params);
                break;
            case "Network.responseReceived":
                this.handleResponseReceived(params);
                break;
        }
    };

    private handleRequestWillBeSent(params: any): void {
        const { requestId, request } = params;
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

        this.pendingRequests.set(requestId, {
            url: request.url,
            method: request.method,
            headers,
            body: request.postData || null,
            timestamp: Date.now(),
        });

        for (const cb of this.requestCallbacks) {
            try { cb(intercepted); } catch (e) { console.error("请求回调错误:", e); }
        }
    }

    private handleResponseReceived(params: any): void {
        const { requestId, response } = params;
        const headers: Record<string, string> = {};
        if (response.headers) {
            for (const [key, value] of Object.entries(response.headers)) {
                headers[key] = String(value);
            }
        }

        if (this.config.captureResponseBodies) {
            this.sendCommand("Network.getResponseBody", { requestId })
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
                    this.pendingRequests.delete(requestId);
                    const intercepted: InterceptedResponse = {
                        requestId,
                        url: cached?.url || response.url,
                        statusCode: response.status,
                        headers,
                        body,
                        bodyRaw,
                        timestamp: Date.now(),
                        type: "response",
                    };

                    for (const cb of this.responseCallbacks) {
                        try { cb(intercepted); } catch (e) { console.error("响应回调错误:", e); }
                    }
                })
                .catch((err) => {
                    console.error("获取响应body失败:", err);
                });
        } else {
            const cached = this.pendingRequests.get(requestId);
            this.pendingRequests.delete(requestId);
            const intercepted: InterceptedResponse = {
                requestId,
                url: cached?.url || response.url,
                statusCode: response.status,
                headers,
                body: null,
                bodyRaw: null,
                timestamp: Date.now(),
                type: "response",
            };

            for (const cb of this.responseCallbacks) {
                try { cb(intercepted); } catch (e) { console.error("响应回调错误:", e); }
            }
        }
    }

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

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    private startCleanupTimer(): void {
        this.stopCleanupTimer();
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [id, entry] of this.pendingRequests) {
                if (now - entry.timestamp > NetworkMonitorService.PENDING_TTL) {
                    this.pendingRequests.delete(id);
                }
            }
        }, NetworkMonitorService.PENDING_TTL);
    }

    private stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    updateConfig(updates: Partial<NetworkMonitorConfig>): void {
        Object.assign(this.config, updates);
    }

    getStatus(): { isListening: boolean; attachedTabId: number | null; config: NetworkMonitorConfig } {
        return {
            isListening: this.isListening,
            attachedTabId: this.attachedTabId,
            config: { ...this.config },
        };
    }
}

export const networkMonitor = new NetworkMonitorService();
