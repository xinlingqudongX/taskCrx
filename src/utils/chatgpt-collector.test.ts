import { describe, it, expect, vi, beforeEach } from "vitest";

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

    it("应返回null当cookie出错时", async () => {
        mockCookiesGet.mockRejectedValue(new Error("cookie error"));
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
        expect(result.error).toContain("未能收集到任何ChatGPT数据");
    });

    it("getUserInfo应正确解析用户信息", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    accounts: {
                        default: {
                            user: {
                                id: "user-123",
                                name: "Test User",
                                email: "test@example.com",
                                image: "https://example.com/avatar.png",
                            },
                        },
                    },
                }),
        });
        const { ChatGPTDataCollector } = await import("./chatgpt-collector");
        const collector = new ChatGPTDataCollector("fake-token");
        const result = await collector.getUserInfo();
        expect(result.success).toBe(true);
        expect(result.data?.id).toBe("user-123");
        expect(result.data?.name).toBe("Test User");
        expect(result.data?.email).toBe("test@example.com");
    });

    it("getConversations应正确解析会话列表", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    items: [
                        {
                            id: "conv-1",
                            title: "测试会话",
                            create_time: "2024-01-01T00:00:00Z",
                            update_time: "2024-01-02T00:00:00Z",
                            default_model_slug: "gpt-4",
                        },
                    ],
                }),
        });
        const { ChatGPTDataCollector } = await import("./chatgpt-collector");
        const collector = new ChatGPTDataCollector("fake-token");
        const result = await collector.getConversations();
        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data![0].id).toBe("conv-1");
        expect(result.data![0].title).toBe("测试会话");
        expect(result.data![0].model).toBe("gpt-4");
    });

    it("getConversations应在HTTP错误时返回失败", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
        });
        const { ChatGPTDataCollector } = await import("./chatgpt-collector");
        const collector = new ChatGPTDataCollector("fake-token");
        const result = await collector.getConversations();
        expect(result.success).toBe(false);
        expect(result.error).toContain("HTTP 401");
    });

    it("collectAll应返回收集时间", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    accounts: {
                        default: {
                            user: { id: "u1", name: "U", email: "u@e.com" },
                        },
                    },
                    items: [],
                }),
        });
        const { ChatGPTDataCollector } = await import("./chatgpt-collector");
        const collector = new ChatGPTDataCollector("fake-token");
        const result = await collector.collectAll();
        expect(result.success).toBe(true);
        expect(result.data?.collectTime).toBeTypeOf("number");
        expect(result.data?.collectTime).toBeGreaterThan(0);
    });
});
