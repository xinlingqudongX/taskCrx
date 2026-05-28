/**
 * WebSocket 客户端
 * 连接到 Cloudflare Worker 中继服务器，实现 Cookie 实时共享
 *
 * 匿名身份模型：
 * - 连接时只传 roomId
 * - 服务端通过 Set-Cookie 下发匿名 sessionId 和昵称（浏览器自动存）
 * - 服务端首条消息 'assigned' 把分配的 userId/userName 告知客户端
 * - 重连时浏览器自动带 cookie，保持同一身份
 */

import {
    type RelayMessage,
    type CookieData,
    type UserInfo,
    type AssignedPayload,
    createRelayMessage,
    parseRelayMessage,
    WS_CONFIG,
} from '@team-session/shared';

export type WSClientEvent =
    | 'connected'
    | 'disconnected'
    | 'error'
    | 'assigned'
    | 'cookie-received'
    | 'cookie-ack'
    | 'user-list-updated'
    | 'reconnecting'
    | 'rtc-offer'
    | 'rtc-answer'
    | 'rtc-ice';

export interface WSClientConfig {
    serverUrl: string;
    roomId: string;
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

    /** 服务端分配的身份，连接建立后由 'assigned' 消息填充 */
    private assignedUserId: string | null = null;
    private assignedUserName: string | null = null;

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
        this.send(createRelayMessage('cookie-share', { domain, cookies }, this.assignedUserId ?? undefined));
    }

    /**
     * 请求 Cookie
     */
    requestCookies(domain: string, targetUserId?: string): void {
        this.send(createRelayMessage('cookie-request', { domain, targetUserId }));
    }

    /**
     * 发送 WebRTC Offer
     */
    sendRTCOffer(targetUserId: string, offer: RTCSessionDescriptionInit): void {
        this.send(createRelayMessage('rtc-offer', { targetUserId, offer }));
    }

    /**
     * 发送 WebRTC Answer
     */
    sendRTCAnswer(targetUserId: string, answer: RTCSessionDescriptionInit): void {
        this.send(createRelayMessage('rtc-answer', { targetUserId, answer }));
    }

    /**
     * 发送 ICE Candidate
     */
    sendRTCIce(targetUserId: string, candidate: RTCIceCandidateInit): void {
        this.send(createRelayMessage('rtc-ice', { targetUserId, candidate }));
    }

    /**
     * 是否已连接
     */
    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * 服务端分配的 userId（连接前返回 null）
     */
    get userId(): string | null {
        return this.assignedUserId;
    }

    /**
     * 服务端分配的昵称（连接前返回 null）
     */
    get userName(): string | null {
        return this.assignedUserName;
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
        const { serverUrl, roomId } = this.config;
        const params = new URLSearchParams({ roomId });
        // serverUrl 可能已包含 /ws 路径，避免重复拼接
        const base = serverUrl.endsWith('/ws') ? serverUrl : `${serverUrl}/ws`;
        return `${base}?${params.toString()}`;
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            console.log('WebSocket 已连接，等待服务端分配身份...');
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.emit('connected');
            // 不再主动发 join，等服务端 'assigned' 消息
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
            case 'assigned': {
                const payload = msg.payload as AssignedPayload;
                this.assignedUserId = payload.userId;
                this.assignedUserName = payload.userName;
                console.log(`服务端分配身份: ${payload.userId} (${payload.userName})`);
                this.emit('assigned', payload);
                break;
            }
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
            case 'cookie-ack':
                this.emit('cookie-ack', msg.payload);
                break;
            case 'pong':
                // 心跳响应，无需处理
                break;
            case 'rtc-offer':
                this.emit('rtc-offer', msg.payload);
                break;
            case 'rtc-answer':
                this.emit('rtc-answer', msg.payload);
                break;
            case 'rtc-ice':
                this.emit('rtc-ice', msg.payload);
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
