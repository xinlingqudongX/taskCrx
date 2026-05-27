// src/utils/chatgpt-collector.ts
// ChatGPT数据收集器，用于收集ChatGPT的会话和用户信息

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
