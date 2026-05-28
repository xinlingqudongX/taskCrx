/**
 * WebSocket 消息处理器
 * 将接收到的 Cookie 数据同步到 Chrome 浏览器
 */

import type { CookieData, UserInfo, AssignedPayload } from '@team-session/shared';
import { WSClient, type WSClientConfig } from './ws-client';
import { PeerManager } from './peer-manager';

export interface WSHandlerConfig extends WSClientConfig {
    autoApplyCookies?: boolean;
}

export class WSMessageHandler {
    private client: WSClient;
    private config: WSHandlerConfig;
    private onlineUsers: UserInfo[] = [];
    private peerManager: PeerManager | null = null;
    /** 服务端分配的本人 userId（连接前为 null） */
    private myUserId: string | null = null;
    private myUserName: string | null = null;

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
        if (this.peerManager) {
            this.peerManager.destroy();
            this.peerManager = null;
        }
        this.client.destroy();
    }

    /**
     * 共享指定域名的 Cookie
     */
    async shareDomainCookies(domain: string): Promise<void> {
        try {
            const cookies = await this.collectCookies(domain);
            const payload = { type: 'cookie-share', domain, cookies };

            // 优先通过 P2P 发送
            if (this.peerManager) {
                const connectedPeers = this.peerManager.getConnectedPeerIds();
                if (connectedPeers.length > 0) {
                    this.peerManager.broadcastData(payload);
                    console.log(`已通过 P2P 共享 ${domain} 的 ${cookies.length} 个 Cookie 给 ${connectedPeers.length} 个 peer`);
                }
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

    private setupListeners(): void {
        // 服务端分配身份：先于 user-list-updated 触发，PeerManager 在这里初始化
        this.client.on('assigned', (data) => {
            const payload = data as AssignedPayload;
            this.myUserId = payload.userId;
            this.myUserName = payload.userName;
            this.initPeerManager();
        });

        // 重连时连接断开但身份保留，下一次 'assigned' 会更新
        this.client.on('disconnected', () => {
            // 清理 P2P 连接，待重连后重建
            if (this.peerManager) {
                this.peerManager.destroy();
                this.peerManager = null;
            }
        });

        this.client.on('cookie-received', (data) => {
            const payload = data as { domain: string; cookies: CookieData[]; fromUserId?: string };
            console.log(`[CookieShare] 收到 ${payload?.fromUserId || 'unknown'} 共享的 ${payload?.domain} Cookie: ${payload?.cookies?.length || 0} 个`);
            if (payload?.cookies && this.config.autoApplyCookies !== false) {
                this.applyCookies(payload.domain, payload.cookies);
            }
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

            // 对新加入的用户发起 P2P 连接（本人 userId 已分配 + peerManager 已就绪时）
            if (this.peerManager && this.myUserId) {
                for (const user of users) {
                    if (user.userId !== this.myUserId && !previousUsers.has(user.userId)) {
                        this.peerManager.createPeer(user.userId);
                    }
                }
            }
        });

        // P2P 信令处理
        this.client.on('rtc-offer', (data) => {
            const payload = data as { fromUserId: string; offer: RTCSessionDescriptionInit };
            if (payload?.fromUserId && this.peerManager) {
                this.peerManager.handleSignal('rtc-offer', payload.fromUserId, payload.offer);
            }
        });

        this.client.on('rtc-answer', (data) => {
            const payload = data as { fromUserId: string; answer: RTCSessionDescriptionInit };
            if (payload?.fromUserId && this.peerManager) {
                this.peerManager.handleSignal('rtc-answer', payload.fromUserId, payload.answer);
            }
        });

        this.client.on('rtc-ice', (data) => {
            const payload = data as { fromUserId: string; candidate: RTCIceCandidateInit };
            if (payload?.fromUserId && this.peerManager) {
                this.peerManager.handleSignal('rtc-ice', payload.fromUserId, payload.candidate);
            }
        });
    }

    private initPeerManager(): void {
        if (this.peerManager || !this.myUserId) return;

        this.peerManager = new PeerManager(
            this.myUserId,
            (type, targetUserId, signalData) => {
                if (type === 'rtc-offer') {
                    this.client.sendRTCOffer(targetUserId, signalData as RTCSessionDescriptionInit);
                } else if (type === 'rtc-answer') {
                    this.client.sendRTCAnswer(targetUserId, signalData as RTCSessionDescriptionInit);
                } else if (type === 'rtc-ice') {
                    this.client.sendRTCIce(targetUserId, signalData as RTCIceCandidateInit);
                }
            },
        );

        this.peerManager.on('peer-connected', (userId: string) => {
            console.log('P2P 连接建立:', userId);
        });

        this.peerManager.on('peer-disconnected', (userId: string) => {
            console.log('P2P 连接断开:', userId);
        });

        this.peerManager.on('peer-data', (payload: { userId: string; data: unknown }) => {
            const p2pData = payload.data as { type: string; domain: string; cookies: CookieData[] };
            if (p2pData?.type === 'cookie-share' && p2pData?.cookies) {
                if (this.config.autoApplyCookies !== false) {
                    this.applyCookies(p2pData.domain, p2pData.cookies);
                }
            }
        });

        this.peerManager.on('peer-error', (payload: { userId: string; error: unknown }) => {
            console.warn('P2P 错误:', payload.userId, payload.error);
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
