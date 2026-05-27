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
