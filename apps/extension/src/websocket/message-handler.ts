/**
 * WebSocket 消息处理器
 * 将接收到的 Cookie 数据同步到 Chrome 浏览器
 *
 * P2P 通过 offscreen 文档代理：Service Worker 没有 RTCPeerConnection，
 * 所有 WebRTC 操作在 offscreen DOM 上下文中执行。
 */

import type { CookieData, UserInfo, AssignedPayload } from '@team-session/shared';
import { WSClient, type WSClientConfig } from './ws-client';

export type WSHandlerConfig = WSClientConfig;

export class WSMessageHandler {
    private client: WSClient;
    private config: WSHandlerConfig;
    private onlineUsers: UserInfo[] = [];
    /** offscreen 文档是否已就绪 */
    private offscreenReady = false;
    /** 服务端分配的本人 userId（连接前为 null） */
    private myUserId: string | null = null;
    private myUserName: string | null = null;

    constructor(config: WSHandlerConfig) {
        this.config = config;
        this.client = new WSClient(config);
        this.setupListeners();
        this.setupOffscreenListener();
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
        this.sendToOffscreen('offscreen:destroy');
        this.offscreenReady = false;
        this.client.destroy();
    }

    /**
     * 共享指定域名的 Cookie（可选附带 localStorage）
     */
    async shareDomainCookies(domain: string, localStorageData?: Record<string, string>): Promise<void> {
        try {
            const cookies = await this.collectCookies(domain);
            const payload: any = { type: 'cookie-share', domain, cookies };
            if (localStorageData && Object.keys(localStorageData).length > 0) {
                payload.localStorage = localStorageData;
            }

            // 优先通过 P2P（offscreen）发送
            if (this.offscreenReady) {
                this.sendToOffscreen('offscreen:broadcast', payload);
                console.log(`已通过 P2P 共享 ${domain} 的 ${cookies.length} 个 Cookie`);
            }

            // 同时通过 WebSocket relay 发送（确保未建立 P2P 的用户也能收到）
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
     * 应用待确认的共享 Cookie 和 localStorage（由用户确认后调用）
     */
    async applySharedCookies(domain: string, cookies: CookieData[], localStorageData?: Record<string, string>): Promise<void> {
        await this.applyCookies(domain, cookies);
        if (localStorageData && Object.keys(localStorageData).length > 0) {
            await this.applyLocalStorage(localStorageData);
        }
    }

    /**
     * 将 localStorage 数据写入当前活动标签页
     */
    private async applyLocalStorage(data: Record<string, string>): Promise<void> {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                console.warn('无活动标签页，无法写入 localStorage');
                return;
            }
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (entries: Record<string, string>) => {
                    for (const [key, value] of Object.entries(entries)) {
                        localStorage.setItem(key, value);
                    }
                },
                args: [data],
            });
            console.log(`已写入 ${Object.keys(data).length} 个 localStorage 项`);
        } catch (error) {
            console.warn('写入 localStorage 失败:', error);
        }
    }

    /**
     * 获取在线用户
     */
    getOnlineUsers(): UserInfo[] {
        return [...this.onlineUsers];
    }

    /**
     * 获取本人 userId（服务端分配，未连接时返回 null）
     */
    getMyUserId(): string | null {
        return this.myUserId;
    }

    /**
     * 获取本人昵称（服务端分配，未连接时返回 null）
     */
    getMyUserName(): string | null {
        return this.myUserName;
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

    // ── Offscreen 通信 ──────────────────────────────────────────────

    /**
     * 确保 offscreen 文档已创建
     */
    private async ensureOffscreen(): Promise<void> {
        if (this.offscreenReady) return;

        try {
            // 检查是否已存在
            const existingContexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
            });
            if (existingContexts.length === 0) {
                await chrome.offscreen.createDocument({
                    url: 'offscreen/index.html',
                    reasons: ['WEB_RTC' as chrome.offscreen.Reason],
                    justification: 'WebRTC P2P 需要 DOM 上下文（Service Worker 无 RTCPeerConnection）',
                });
            }
            this.offscreenReady = true;
        } catch (error) {
            console.error('创建 offscreen 文档失败:', error);
        }
    }

    /**
     * 向 offscreen 文档发送消息
     */
    private sendToOffscreen(type: string, data?: unknown): void {
        chrome.runtime.sendMessage({ type, target: 'offscreen', data }).catch(() => {
            // offscreen 可能未就绪，忽略错误
        });
    }

    /**
     * 监听 offscreen 文档发来的消息
     */
    private setupOffscreenListener(): void {
        chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
            if (msg?.target !== 'sw' || !msg?.type?.startsWith('offscreen:')) return;

            switch (msg.type) {
                case 'offscreen:peer-connected':
                    console.log('P2P 连接建立:', msg.data);
                    break;

                case 'offscreen:peer-disconnected':
                    console.log('P2P 连接断开:', msg.data);
                    break;

                case 'offscreen:peer-data': {
                    const payload = msg.data as { userId: string; data: unknown };
                    const p2pData = payload.data as { type: string; domain: string; cookies: CookieData[]; localStorage?: Record<string, string> };
                    if (p2pData?.type === 'cookie-share' && p2pData?.cookies) {
                        console.log(`[CookieShare] P2P 收到 ${payload.userId} 共享的 ${p2pData.domain} Cookie: ${p2pData.cookies.length} 个`);
                        chrome.storage.local.get(["pending_shared_cookies"], (result) => {
                            const stored = result["pending_shared_cookies"];
const pending: any[] = Array.isArray(stored) ? stored : [];
                            pending.push({
                                domain: p2pData.domain,
                                cookies: p2pData.cookies,
                                localStorage: p2pData.localStorage,
                                fromUserId: payload.userId,
                                receivedAt: Date.now(),
                            });
                            chrome.storage.local.set({ "pending_shared_cookies": pending });
                            chrome.action.setBadgeText({ text: String(pending.length) });
                            chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
                        });
                    }
                    break;
                }

                case 'offscreen:peer-error':
                    console.warn('P2P 错误:', msg.data);
                    break;

                case 'offscreen:signal': {
                    // offscreen 产生的信令消息，转发到 WebSocket 服务器
                    const { type: signalType, targetUserId, signalData } = msg.data;
                    if (signalType === 'rtc-offer') {
                        this.client.sendRTCOffer(targetUserId, signalData);
                    } else if (signalType === 'rtc-answer') {
                        this.client.sendRTCAnswer(targetUserId, signalData);
                    } else if (signalType === 'rtc-ice') {
                        this.client.sendRTCIce(targetUserId, signalData);
                    }
                    break;
                }
            }
        });
    }

    // ── WebSocket 事件监听 ──────────────────────────────────────────

    private setupListeners(): void {
        // 服务端分配身份：先于 user-list-updated 触发，初始化 offscreen P2P
        this.client.on('assigned', (data) => {
            const payload = data as AssignedPayload;
            this.myUserId = payload.userId;
            this.myUserName = payload.userName;
            this.initOffscreenP2P();
        });

        // 重连时连接断开但身份保留，下一次 'assigned' 会更新
        this.client.on('disconnected', () => {
            this.sendToOffscreen('offscreen:destroy');
            this.offscreenReady = false;
        });

        this.client.on('cookie-received', (data) => {
            const payload = data as { domain: string; cookies: CookieData[]; fromUserId?: string; localStorage?: Record<string, string> };
            console.log(`[CookieShare] 收到 ${payload?.fromUserId || 'unknown'} 共享的 ${payload?.domain} Cookie: ${payload?.cookies?.length || 0} 个`);
            if (!payload?.cookies || payload.cookies.length === 0) return;

            // 存为待确认，由用户决定是否应用
            chrome.storage.local.get(["pending_shared_cookies"], (result) => {
                const stored = result["pending_shared_cookies"];
const pending: any[] = Array.isArray(stored) ? stored : [];
                pending.push({
                    domain: payload.domain,
                    cookies: payload.cookies,
                    localStorage: payload.localStorage,
                    fromUserId: payload.fromUserId,
                    receivedAt: Date.now(),
                });
                chrome.storage.local.set({ "pending_shared_cookies": pending });
                chrome.action.setBadgeText({ text: String(pending.length) });
                chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
            });
        });

        this.client.on('cookie-ack', (data) => {
            const payload = data as { domain: string; recipients?: string[]; recipientCount?: number; fromUserName?: string };
            console.log(`[CookieShare] 回执: ${payload.domain}, 接收方 ${payload.recipientCount || payload.recipients?.length || 0} 个`);
        });

        this.client.on('user-list-updated', (data) => {
            const users = (data as UserInfo[]) || [];
            const previousUsers = new Set(this.onlineUsers.map(u => u.userId));
            this.onlineUsers = users;
            console.log('在线用户更新:', this.onlineUsers.length, '人');

            // 对新加入的用户发起 P2P 连接
            if (this.offscreenReady && this.myUserId) {
                for (const user of users) {
                    if (user.userId !== this.myUserId && !previousUsers.has(user.userId)) {
                        this.sendToOffscreen('offscreen:create-peer', { targetUserId: user.userId });
                    }
                }
            }
        });

        // P2P 信令：从 WebSocket 收到后转发给 offscreen
        this.client.on('rtc-offer', (data) => {
            const payload = data as { fromUserId: string; offer: RTCSessionDescriptionInit };
            if (payload?.fromUserId) {
                this.sendToOffscreen('offscreen:handle-signal', {
                    signalType: 'rtc-offer',
                    fromUserId: payload.fromUserId,
                    signalData: payload.offer,
                });
            }
        });

        this.client.on('rtc-answer', (data) => {
            const payload = data as { fromUserId: string; answer: RTCSessionDescriptionInit };
            if (payload?.fromUserId) {
                this.sendToOffscreen('offscreen:handle-signal', {
                    signalType: 'rtc-answer',
                    fromUserId: payload.fromUserId,
                    signalData: payload.answer,
                });
            }
        });

        this.client.on('rtc-ice', (data) => {
            const payload = data as { fromUserId: string; candidate: RTCIceCandidateInit };
            if (payload?.fromUserId) {
                this.sendToOffscreen('offscreen:handle-signal', {
                    signalType: 'rtc-ice',
                    fromUserId: payload.fromUserId,
                    signalData: payload.candidate,
                });
            }
        });
    }

    /**
     * 初始化 offscreen P2P 连接
     */
    private async initOffscreenP2P(): Promise<void> {
        if (!this.myUserId) return;

        await this.ensureOffscreen();
        if (!this.offscreenReady) {
            console.warn('offscreen 文档未就绪，P2P 不可用，仅使用 WebSocket relay');
            return;
        }

        this.sendToOffscreen('offscreen:init', { myUserId: this.myUserId });
    }

    // ── Cookie 操作 ─────────────────────────────────────────────────

    /**
     * 从浏览器收集 Cookie
     */
    private async collectCookies(domain: string): Promise<CookieData[]> {
        // chrome.cookies.getAll 不支持 host:port，去掉端口
        const hostname = domain.replace(/:\d+$/, '');
        const cookies = await chrome.cookies.getAll({ domain: hostname });
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

                // 优先用接收方的域名（含端口），cookie.domain 可能不含端口
                const applyDomain = domain || cookieDomain;
                const isHostPrefixed = cookie.name.startsWith('__Host-');
                const scheme = (cookie.secure || isHostPrefixed) ? 'https' : 'http';

                const setDetails: chrome.cookies.SetDetails = {
                    url: `${scheme}://${applyDomain}${cookie.path || '/'}`,
                    name: cookie.name,
                    value: cookie.value,
                    path: isHostPrefixed ? '/' : (cookie.path || '/'),
                    secure: isHostPrefixed ? true : (cookie.secure ?? true),
                    httpOnly: cookie.httpOnly ?? false,
                    sameSite: (cookie.sameSite as chrome.cookies.SameSiteStatus) || 'lax',
                    expirationDate: cookie.expirationDate,
                };

                // __Host- 前缀 cookie 不能设置 Domain 属性
                if (!isHostPrefixed) {
                    setDetails.domain = cookie.domain;
                }

                await chrome.cookies.set(setDetails);
                successCount++;
            } catch (error) {
                console.warn(`设置 Cookie 失败 [${cookie.name}@${cookie.domain}]:`, error);
            }
        }

        console.log(`成功应用 ${successCount}/${cookies.length} 个 Cookie 到 ${domain}`);
    }
}
