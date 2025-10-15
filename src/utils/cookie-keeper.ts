// src/utils/cookie-keeper.ts
// Cookie保活管理器，用于保持Apple和JiGuang的cookie有效性

import {
    getJiguangTokenFromCookie,
    getAppleCookiesFromBrowser,
} from "./app-collector";

/**
 * Cookie保活配置接口
 */
interface KeepAliveConfig {
    /** 保活间隔（毫秒），默认15分钟 */
    interval?: number;
    /** 是否启用极光保活 */
    enableJiguang?: boolean;
    /** 是否启用苹果保活 */
    enableApple?: boolean;
    /** 保活请求超时时间（毫秒） */
    timeout?: number;
}

/**
 * Cookie保活管理器
 * 通过定期发送轻量级请求来保持会话活跃，防止cookie过期
 */
export class CookieKeeper {
    private config: Required<KeepAliveConfig>;
    private timers: Map<string, number> = new Map();
    private isRunning = false;

    constructor(config: KeepAliveConfig = {}) {
        this.config = {
            interval: config.interval || 15 * 60 * 1000, // 15分钟
            enableJiguang: config.enableJiguang ?? true,
            enableApple: config.enableApple ?? true,
            timeout: config.timeout || 10000, // 10秒超时
        };
    }

    /**
     * 启动cookie保活服务
     */
    start(): void {
        if (this.isRunning) {
            console.warn("Cookie保活服务已在运行");
            return;
        }

        this.isRunning = true;
        console.log(
            "启动Cookie保活服务，间隔:",
            this.config.interval / 1000,
            "秒"
        );

        if (this.config.enableJiguang) {
            this.startJiguangKeepAlive();
        }

        if (this.config.enableApple) {
            this.startAppleKeepAlive();
        }
    }

    /**
     * 停止cookie保活服务
     */
    stop(): void {
        this.isRunning = false;
        this.timers.forEach((timerId) => {
            clearInterval(timerId);
        });
        this.timers.clear();
        console.log("Cookie保活服务已停止");
    }

    /**
     * 启动极光推送cookie保活
     */
    private startJiguangKeepAlive(): void {
        const keepAlive = async () => {
            try {
                const result = await this.pingJiguangService();
                const status = result ? "✓" : "✗";
                console.log(
                    `[${new Date().toLocaleTimeString()}] 极光保活 ${status}`
                );
            } catch (error) {
                console.error("极光保活失败:", error);
            }
        };

        // 立即执行一次
        keepAlive();

        // 定期执行
        const timerId = setInterval(keepAlive, this.config.interval);
        this.timers.set("jiguang", timerId as unknown as number);
    }

    /**
     * 启动苹果开发者cookie保活
     */
    private startAppleKeepAlive(): void {
        const keepAlive = async () => {
            try {
                const result = await this.pingAppleService();
                const status = result ? "✓" : "✗";
                console.log(
                    `[${new Date().toLocaleTimeString()}] 苹果保活 ${status}`
                );
            } catch (error) {
                console.error("苹果保活失败:", error);
            }
        };

        // 立即执行一次
        keepAlive();

        // 定期执行
        const timerId = setInterval(keepAlive, this.config.interval);
        this.timers.set("apple", timerId as unknown as number);
    }

    /**
     * 极光推送保活ping
     * 发送轻量级请求保持会话活跃
     */
    private async pingJiguangService(): Promise<boolean> {
        try {
            const token = await getJiguangTokenFromCookie();
            if (!token) {
                console.warn("极光token不存在，跳过保活");
                return false;
            }

            // 使用Authorization header的方式请求，保持与真实API调用一致
            const response = await fetch(
                "https://api.srv.jpush.cn/v1/portal/devs/783922/userInfo",
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${token}`,
                        "cache-control": "no-cache",
                        "content-type": "application/json",
                    },
                    referrer: "https://www.jiguang.cn/",
                    mode: "cors",
                    credentials: "include",
                }
            );

            // 检查响应状态和内容
            if (response.ok) {
                const data = await response.json();
                // 如果返回有效的用户数据，说明token有效
                return data && data.dev && data.dev.id;
            }

            return false;
        } catch (error) {
            console.error("极光保活请求失败:", error);
            return false;
        }
    }

    /**
     * 苹果开发者保活ping
     * 发送轻量级请求保持会话活跃
     */
    private async pingAppleService(): Promise<boolean> {
        try {
            const cookies = await getAppleCookiesFromBrowser();
            if (!cookies) {
                console.warn("苹果cookie不存在，跳过保活");
                return false;
            }

            // 将cookie对象转换为字符串
            const cookieString = Object.entries(cookies)
                .map(([name, value]) => `${name}=${value}`)
                .join("; ");

            // 使用简单的会话状态检查接口作为保活请求
            const response = await fetch(
                "https://appstoreconnect.apple.com/olympus/v1/session",
                {
                    method: "GET",
                    headers: {
                        accept: "application/json",
                        cookie: cookieString,
                    },
                    mode: "cors",
                }
            );

            return response.ok;
        } catch (error) {
            console.error("苹果保活请求失败:", error);
            return false;
        }
    }

    /**
     * 检查cookie有效性
     */
    async checkCookieValidity(): Promise<{
        jiguang: boolean;
        apple: boolean;
    }> {
        const [jiguangValid, appleValid] = await Promise.all([
            this.pingJiguangService(),
            this.pingAppleService(),
        ]);

        return {
            jiguang: jiguangValid,
            apple: appleValid,
        };
    }

    /**
     * 手动触发保活
     */
    async manualKeepAlive(): Promise<{
        jiguang: boolean;
        apple: boolean;
    }> {
        console.log("执行手动cookie保活...");
        return await this.checkCookieValidity();
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<KeepAliveConfig>): void {
        Object.assign(this.config, newConfig);

        if (this.isRunning) {
            console.log("配置已更新，重启保活服务");
            this.stop();
            this.start();
        }
    }

    /**
     * 获取当前状态
     */
    getStatus(): {
        isRunning: boolean;
        config: Required<KeepAliveConfig>;
        activeTimers: string[];
    } {
        return {
            isRunning: this.isRunning,
            config: { ...this.config },
            activeTimers: Array.from(this.timers.keys()),
        };
    }
}

// 全局实例
export const cookieKeeper = new CookieKeeper();

/**
 * 自动cookie刷新策略
 * 在检测到cookie失效时尝试引导用户刷新
 */
export class CookieRefreshStrategy {
    /**
     * 检测cookie失效并处理
     */
    static async handleExpiredCookie(
        service: "jiguang" | "apple"
    ): Promise<void> {
        const serviceNames = {
            jiguang: "极光推送",
            apple: "苹果开发者",
        };

        const urls = {
            jiguang: "https://www.jiguang.cn/accounts/login",
            apple: "https://appstoreconnect.apple.com",
        };

        console.warn(`${serviceNames[service]}的cookie已失效`);

        // 发送通知提醒用户
        chrome.notifications.create("", {
            type: "basic",
            title: "Cookie过期提醒",
            message: `${serviceNames[service]}的登录已过期，请重新登录以继续使用服务。`,
            iconUrl: "/icons/icon48.png",
        });

        // 创建新标签页引导用户登录
        chrome.tabs.create({
            url: urls[service],
            active: true,
        });
    }

    /**
     * 智能cookie刷新
     * 检查所有服务的cookie状态并处理过期的cookie
     */
    static async smartRefresh(): Promise<{
        jiguang: "valid" | "expired" | "refreshed";
        apple: "valid" | "expired" | "refreshed";
    }> {
        const keeper = new CookieKeeper();
        const validity = await keeper.checkCookieValidity();

        const result = {
            jiguang: validity.jiguang
                ? ("valid" as const)
                : ("expired" as const),
            apple: validity.apple ? ("valid" as const) : ("expired" as const),
        };

        // 处理过期的cookie
        if (!validity.jiguang) {
            await this.handleExpiredCookie("jiguang");
        }

        if (!validity.apple) {
            await this.handleExpiredCookie("apple");
        }

        return result;
    }
}
