// src/utils/app-collector.ts
// 应用数据收集器，用于收集极光推送相关的应用信息

import type {
    JiguangUserInfo,
    JiguangAppInfo,
    JiguangAppGroup,
    JiguangAppDetail,
    JiguangAppListResponse,
    AppleAppInfo,
    AppleAppListResponse,
} from "../types/index";

/**
 * 应用收集器配置接口
 * @interface AppCollectorConfig
 */
export interface AppCollectorConfig {
    /** 授权令牌 */
    authorization?: string;
    /** API基础URL */
    baseUrl: string;
    /** 用户ID */
    userId?: string;
}

/**
 * 应用数据收集器类
 * 用于从极光推送 API 收集应用信息和用户信息
 * @class AppCollector
 */
export class AppCollector {
    /** 收集器配置 */
    private config: AppCollectorConfig;
    /** 默认请求头 */
    private defaultHeaders: Record<string, string>;

    /**
     * 构造函数
     * @param {AppCollectorConfig} config - 收集器配置
     */
    constructor(config: AppCollectorConfig) {
        this.config = config;
        this.defaultHeaders = {
            accept: "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            "cache-control": "no-cache",
            "content-type": "application/json",
        };

        if (config.authorization) {
            this.defaultHeaders.authorization = `Bearer ${config.authorization}`;
        }
    }

    /**
     * 获取应用信息列表（旧版API）
     * @param {number} pageIndex - 页码，默认为1
     * @param {number} pageSize - 每页数量，默认为10
     * @param {string} searchKey - 搜索关键词，默认为空
     * @returns {Promise<{success: boolean, data?: {list: JiguangAppInfo[], total: number}, error?: string}>} 返回结果
     */
    async getAppInfoList(
        pageIndex: number = 1,
        pageSize: number = 10,
        searchKey: string = ""
    ): Promise<{
        success: boolean;
        data?: {
            list: JiguangAppInfo[];
            total: number;
        };
        error?: string;
    }> {
        try {
            const url = `${
                this.config.baseUrl
            }/v1/portal-appdev/app/getAppInfoList?pageIndex=${pageIndex}&pageSize=${pageSize}&searchKey=${encodeURIComponent(
                searchKey
            )}`;

            const response = await fetch(url, {
                method: "GET",
                headers: this.defaultHeaders,
                mode: "cors",
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }

            const data = await response.json();
            return {
                success: true,
                data: data,
            };
        } catch (error) {
            console.error("获取应用信息失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 获取应用列表（新版API结构）
     * @returns {Promise<{success: boolean, data?: JiguangAppListResponse, error?: string}>} 返回结果
     */
    async getAppList(): Promise<{
        success: boolean;
        data?: JiguangAppListResponse;
        error?: string;
    }> {
        try {
            let url = `${this.config.baseUrl}/v1/portal/devs/${this.config.userId}/appInfo`;
            const params = new URLSearchParams({
                pageIndex: "1",
                pageSize: "100",
                searchKey: "",
            });
            url += "?" + params.toString();
            const response = await fetch(url, {
                method: "GET",
                headers: this.defaultHeaders,
                mode: "cors",
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }

            const data = await response.json();
            return {
                success: true,
                data: data,
            };
        } catch (error) {
            console.error("获取应用列表失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 获取应用详情信息
     * @param {string} appKey - 应用密钥
     * @returns {Promise<{success: boolean, data?: JiguangAppDetail, error?: string}>} 返回结果
     */
    async getAppDetail(appKey: string): Promise<{
        success: boolean;
        data?: JiguangAppDetail;
        error?: string;
    }> {
        try {
            const url = `${this.config.baseUrl}/v1/portal-appdev/v2/app/${appKey}/info`;

            const response = await fetch(url, {
                method: "GET",
                headers: this.defaultHeaders,
                mode: "cors",
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }

            const data = await response.json();
            return {
                success: true,
                data: data,
            };
        } catch (error) {
            console.error("获取应用详情失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 批量获取应用详情信息
     * @param {string[]} appKeys - 应用密钥列表
     * @returns {Promise<{success: boolean, data?: JiguangAppDetail[], error?: string}>} 返回结果
     */
    async getAppDetails(appKeys: string[]): Promise<{
        success: boolean;
        data?: JiguangAppDetail[];
        error?: string;
    }> {
        try {
            const detailPromises = appKeys.map((appKey) =>
                this.getAppDetail(appKey)
            );
            const results = await Promise.all(detailPromises);

            const successfulResults: JiguangAppDetail[] = [];
            const errors: string[] = [];

            results.forEach((result, index) => {
                if (result.success && result.data) {
                    successfulResults.push(result.data);
                } else {
                    errors.push(`应用 ${appKeys[index]}: ${result.error}`);
                }
            });

            if (errors.length > 0) {
                console.warn("部分应用详情获取失败:", errors);
            }

            return {
                success: true,
                data: successfulResults,
                error:
                    errors.length > 0
                        ? `部分失败: ${errors.join("; ")}`
                        : undefined,
            };
        } catch (error) {
            console.error("批量获取应用详情失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 获取用户账号信息
     * @param {string} userId - 用户ID，可选，默认使用配置中的userId
     * @returns {Promise<{success: boolean, data?: JiguangUserInfo, error?: string}>} 返回结果
     */
    async getUserInfo(userId?: string): Promise<{
        success: boolean;
        data?: JiguangUserInfo;
        error?: string;
    }> {
        try {
            const uid = userId || this.config.userId;
            if (!uid) {
                throw new Error("用户ID未配置");
            }

            const url = `${this.config.baseUrl}/v1/portal/devs/${uid}/userInfo`;

            const response = await fetch(url, {
                method: "GET",
                headers: this.defaultHeaders,
                mode: "cors",
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }

            const data = await response.json();
            return {
                success: true,
                data: data,
            };
        } catch (error) {
            console.error("获取用户信息失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 收集所有应用数据（新版）
     * 并行获取用户信息和应用列表，支持新的API结构
     * @param {boolean} includeDetails - 是否包含应用详情信息，默认为false
     * @returns {Promise<{success: boolean, data?: {userInfo: JiguangUserInfo, appListData: JiguangAppListResponse, appList: JiguangAppInfo[], appGroups: JiguangAppGroup[], appDetails?: JiguangAppDetail[], collectTime: number}, error?: string}>} 返回结果
     */
    async collectAllAppData(includeDetails: boolean = false): Promise<{
        success: boolean;
        data?: {
            userInfo: JiguangUserInfo;
            appListData: JiguangAppListResponse;
            appList: JiguangAppInfo[];
            appGroups: JiguangAppGroup[];
            appDetails?: JiguangAppDetail[];
            collectTime: number;
        };
        error?: string;
    }> {
        try {
            const [userResult, appListResult] = await Promise.all([
                this.getUserInfo(),
                this.getAppList(),
            ]);

            if (!userResult.success) {
                throw new Error(`获取用户信息失败: ${userResult.error}`);
            }

            if (!appListResult.success) {
                throw new Error(`获取应用列表失败: ${appListResult.error}`);
            }

            const appListData = appListResult.data!;
            let appDetails: JiguangAppDetail[] | undefined;

            if (includeDetails && appListData.apps.length > 0) {
                const appKeys = appListData.apps.map((app) => app.appKey);
                const detailsResult = await this.getAppDetails(appKeys);

                if (detailsResult.success) {
                    appDetails = detailsResult.data;
                    if (detailsResult.error) {
                        console.warn(
                            "部分应用详情获取失败:",
                            detailsResult.error
                        );
                    }
                } else {
                    console.error("获取应用详情失败:", detailsResult.error);
                }
            }

            const result: any = {
                userInfo: userResult.data!,
                appListData: appListData,
                appList: appListData.apps,
                appGroups: appListData.appGroups,
                collectTime: Date.now(),
            };

            if (appDetails) {
                result.appDetails = appDetails;
            }

            return {
                success: true,
                data: result,
            };
        } catch (error) {
            console.error("收集应用数据失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 更新授权令牌
     * @param {string} token - 新的授权令牌
     */
    updateAuthorization(token: string) {
        this.config.authorization = token;
        this.defaultHeaders.authorization = `Bearer ${token}`;
    }

    /**
     * 更新用户ID
     * @param {string} userId - 新的用户ID
     */
    updateUserId(userId: string) {
        this.config.userId = userId;
    }
}

/**
 * 从 Cookie 获取极光推送的令牌
 * 使用 chrome.cookies.get Promise API
 * @param {string} domain - 域名，默认为极光推送域名
 * @returns {Promise<string | null>} 返回令牌或null
 */
export async function getJiguangTokenFromCookie(
    domain: string = ".jiguang.cn"
): Promise<string | null> {
    try {
        const cookie = await chrome.cookies.get({
            url: `https://www.jiguang.cn`,
            name: "Jtoken",
        });

        return cookie?.value || null;
    } catch (error) {
        console.error("获取 Jtoken Cookie 失败:", error);
        return null;
    }
}

/**
 * 从 Cookie 获取苹果开发者的认证信息
 * 使用 chrome.cookies.getAll Promise API
 * @param {string} domain - 域名，默认为苹果开发者域名
 * @returns {Promise<Record<string, string> | null>} 返回所有相关Cookie或null
 */
export async function getAppleCookiesFromBrowser(
    domain: string = "appstoreconnect.apple.com"
): Promise<Record<string, string> | null> {
    try {
        const cookies = await chrome.cookies.getAll({
            domain: domain,
        });

        if (!cookies || cookies.length === 0) {
            return null;
        }

        // 将cookies数组转换为键值对对象
        const cookieObj: Record<string, string> = {};
        cookies.forEach((cookie) => {
            cookieObj[cookie.name] = cookie.value;
        });

        return cookieObj;
    } catch (error) {
        console.error("获取苹果开发者 Cookie 失败:", error);
        return null;
    }
}

/**
 * 苹果开发者应用收集器类
 * 用于从苹果 App Store Connect API 收集应用信息
 * @class AppleAppCollector
 */
export class AppleAppCollector {
    /** 默认请求头 */
    private defaultHeaders: Record<string, string>;
    /** 基础URL */
    private baseUrl: string;

    /**
     * 构造函数
     * @param {Record<string, string>} cookies - 苹果开发者Cookie
     * @param {string} csrfToken - CSRF令牌
     */
    constructor(cookies: Record<string, string>, csrfToken: string) {
        this.baseUrl = "https://appstoreconnect.apple.com";
        this.defaultHeaders = {
            accept: "application/vnd.api+json",
            "content-type": "application/vnd.api+json",
            "x-csrf-itc": csrfToken,
        };

        // 将cookies转换为Cookie字符串
        const cookieString = Object.entries(cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join("; ");

        this.defaultHeaders["cookie"] = cookieString;
    }

    /**
     * 获取苹果开发者应用列表
     * @param {number} limit - 限制数量，默认为200
     * @param {number} limitDisplayableVersions - 可显示版本限制，默认为20
     * @returns {Promise<{success: boolean, data?: AppleAppListResponse, error?: string}>} 返回结果
     */
    async getAppList(
        limit: number = 200,
        limitDisplayableVersions: number = 20
    ): Promise<{
        success: boolean;
        data?: AppleAppListResponse;
        error?: string;
    }> {
        try {
            const url = `${this.baseUrl}/iris/v1/apps?include=displayableVersions&limit=${limit}&limit[displayableVersions]=${limitDisplayableVersions}`;

            const response = await fetch(url, {
                method: "GET",
                headers: this.defaultHeaders,
                mode: "cors",
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }

            const data = await response.json();
            return {
                success: true,
                data: data,
            };
        } catch (error) {
            console.error("获取苹果应用列表失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }

    /**
     * 收集所有苹果应用数据
     * @param {number} maxApps - 最大应用数量，默认为200
     * @returns {Promise<{success: boolean, data?: {appleAppList: AppleAppInfo[], appleAppListData: AppleAppListResponse, collectTime: number}, error?: string}>} 返回结果
     */
    async collectAllAppData(maxApps: number = 200): Promise<{
        success: boolean;
        data?: {
            appleAppList: AppleAppInfo[];
            appleAppListData: AppleAppListResponse;
            collectTime: number;
        };
        error?: string;
    }> {
        try {
            const result = await this.getAppList(maxApps);

            if (!result.success || !result.data) {
                throw new Error(`获取应用列表失败: ${result.error}`);
            }

            const appListData = result.data;
            let appList = appListData.data || [];

            // 限制应用数量
            if (appList.length > maxApps) {
                appList = appList.slice(0, maxApps);
            }

            return {
                success: true,
                data: {
                    appleAppList: appList,
                    appleAppListData: appListData,
                    collectTime: Date.now(),
                },
            };
        } catch (error) {
            console.error("收集苹果应用数据失败:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "未知错误",
            };
        }
    }
}

/**
 * 每次调用时都会重新从 cookie 获取最新的token
 * @param {number} pageIndex - 页码，默认为1
 * @param {number} pageSize - 每页数量，默认为10
 * @param {string} searchKey - 搜索关键词，默认为空
 * @returns {Promise<{success: boolean, data?: {list: JiguangAppInfo[], total: number}, error?: string}>} 返回结果
 */
export async function collectAppInfoList(
    pageIndex: number = 1,
    pageSize: number = 10,
    searchKey: string = ""
): Promise<{
    success: boolean;
    data?: {
        list: JiguangAppInfo[];
        total: number;
    };
    error?: string;
}> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            return {
                success: false,
                error: "未找到有效的授权令牌（从 Cookie 获取）",
            };
        }

        const collector = new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: "783922",
        });

        return await collector.getAppInfoList(pageIndex, pageSize, searchKey);
    } catch (error) {
        console.error("收集应用信息列表失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 实时获取应用列表
 * 每次调用时都会重新从 cookie 获取最新的token
 * @returns {Promise<{success: boolean, data?: JiguangAppListResponse, error?: string}>} 返回结果
 */
export async function collectAppList(): Promise<{
    success: boolean;
    data?: JiguangAppListResponse;
    error?: string;
}> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            return {
                success: false,
                error: "未找到有效的授权令牌（从 Cookie 获取）",
            };
        }

        const collector = new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: "783922",
        });

        return await collector.getAppList();
    } catch (error) {
        console.error("收集应用列表失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 实时获取应用详情信息
 * 每次调用时都会重新从 cookie 获取最新的token
 * @param {string} appKey - 应用密钥
 * @returns {Promise<{success: boolean, data?: JiguangAppDetail, error?: string}>} 返回结果
 */
export async function collectAppDetail(appKey: string): Promise<{
    success: boolean;
    data?: JiguangAppDetail;
    error?: string;
}> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            return {
                success: false,
                error: "未找到有效的授权令牌（从 Cookie 获取）",
            };
        }

        const collector = new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: "783922",
        });

        return await collector.getAppDetail(appKey);
    } catch (error) {
        console.error("收集应用详情失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 实时批量获取应用详情信息
 * 每次调用时都会重新从 cookie 获取最新的token
 * @param {string[]} appKeys - 应用密钥列表
 * @returns {Promise<{success: boolean, data?: JiguangAppDetail[], error?: string}>} 返回结果
 */
export async function collectAppDetails(appKeys: string[]): Promise<{
    success: boolean;
    data?: JiguangAppDetail[];
    error?: string;
}> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            return {
                success: false,
                error: "未找到有效的授权令牌（从 Cookie 获取）",
            };
        }

        const collector = new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: "783922",
        });

        return await collector.getAppDetails(appKeys);
    } catch (error) {
        console.error("批量收集应用详情失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 实时获取用户账号信息
 * 每次调用时都会重新从 cookie 获取最新的token
 * @param {string} userId - 用户ID，可选，默认使用"783922"
 * @returns {Promise<{success: boolean, data?: JiguangUserInfo, error?: string}>} 返回结果
 */
export async function collectUserInfo(userId: string = "783922"): Promise<{
    success: boolean;
    data?: JiguangUserInfo;
    error?: string;
}> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            return {
                success: false,
                error: "未找到有效的授权令牌（从 Cookie 获取）",
            };
        }

        const collector = new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: userId,
        });

        return await collector.getUserInfo();
    } catch (error) {
        console.error("收集用户信息失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 实时收集苹果开发者应用列表
 * 每次调用时都会重新从 cookie 获取最新的认证信息
 * @param {number} maxApps - 最大应用数量，默认为200
 * @returns {Promise<{success: boolean, data?: {appleAppList: AppleAppInfo[], appleAppListData: AppleAppListResponse, collectTime: number}, error?: string}>} 返回结果
 */
export async function collectAppleAppList(maxApps: number = 200): Promise<{
    success: boolean;
    data?: {
        appleAppList: AppleAppInfo[];
        appleAppListData: AppleAppListResponse;
        collectTime: number;
    };
    error?: string;
}> {
    try {
        // 获取苹果开发者Cookie和CSRF Token
        const cookies = await getAppleCookiesFromBrowser();

        if (!cookies) {
            return {
                success: false,
                error: "未找到有效的苹果开发者认证信息（从 Cookie 获取）",
            };
        }

        const collector = new AppleAppCollector(cookies, "[asc-ui]");
        return await collector.collectAllAppData(maxApps);
    } catch (error) {
        console.error("收集苹果应用列表失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 实时收集所有应用数据
/**
 * 实时收集所有应用数据
 * 每次调用时都会重新从 cookie 获取最新的token，并行获取用户信息和应用列表
 * @param {boolean} includeDetails - 是否包含应用详情信息，默认为false
 * @param {string} userId - 用户ID，可选，默认使用"783922"
 * @param {boolean} includeAppleApps - 是否包含苹果应用数据，默认为false
 * @param {number} maxAppleApps - 苹果应用最大数量，默认为200
 * @returns {Promise<{success: boolean, data?: {userInfo: JiguangUserInfo, appListData: JiguangAppListResponse, appList: JiguangAppInfo[], appGroups: JiguangAppGroup[], appDetails?: JiguangAppDetail[], appleAppList?: AppleAppInfo[], appleAppListData?: AppleAppListResponse, collectTime: number}, error?: string}>} 返回结果
 */
export async function collectAllAppData(
    includeDetails: boolean = false,
    userId: string = "783922",
    includeAppleApps: boolean = false,
    maxAppleApps: number = 200
): Promise<{
    success: boolean;
    data?: {
        userInfo: JiguangUserInfo;
        appListData: JiguangAppListResponse;
        appList: JiguangAppInfo[];
        appGroups: JiguangAppGroup[];
        appDetails?: JiguangAppDetail[];
        appleAppList?: AppleAppInfo[];
        appleAppListData?: AppleAppListResponse;
        collectTime: number;
    };
    error?: string;
}> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            return {
                success: false,
                error: "未找到有效的授权令牌（从 Cookie 获取）",
            };
        }

        const collector = new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: userId,
        });

        // 清单收集任务
        const tasks: Promise<any>[] = [];

        // 添加极光推送数据收集任务
        tasks.push(collector.collectAllAppData(includeDetails));

        // 如果需要收集苹果应用数据，添加相应任务
        if (includeAppleApps) {
            tasks.push(collectAppleAppList(maxAppleApps));
        }

        // 并行执行所有收集任务
        const results = await Promise.allSettled(tasks);

        // 处理极光推送数据结果
        const jiguangResult = results[0] as PromiseSettledResult<any>;
        if (
            jiguangResult.status === "rejected" ||
            !jiguangResult.value.success
        ) {
            const error =
                jiguangResult.status === "rejected"
                    ? jiguangResult.reason
                    : jiguangResult.value.error;
            throw new Error(`极光推送数据收集失败: ${error}`);
        }

        const result: any = {
            ...jiguangResult.value.data,
            collectTime: Date.now(),
        };

        // 处理苹果应用数据结果
        if (includeAppleApps && results.length > 1) {
            const appleResult = results[1] as PromiseSettledResult<any>;
            if (
                appleResult.status === "fulfilled" &&
                appleResult.value.success &&
                appleResult.value.data
            ) {
                result.appleAppList = appleResult.value.data.appleAppList;
                result.appleAppListData =
                    appleResult.value.data.appleAppListData;
                console.log(
                    "成功收集苹果应用数据",
                    appleResult.value.data.appleAppList.length,
                    "个应用"
                );
            } else {
                const error =
                    appleResult.status === "rejected"
                        ? appleResult.reason
                        : appleResult.value.error;
                console.warn("苹果应用数据收集失败:", error);
            }
        }

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        console.error("收集所有应用数据失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 创建应用收集器实例
 * 使用指定的token创建收集器，主要用于需要复用收集器的场景
 * @param {string} token - 授权令牌
 * @param {string} userId - 用户ID，默认为"783922"
 * @returns {AppCollector} 返回收集器实例
 */
export function createAppCollector(
    token: string,
    userId: string = "783922"
): AppCollector {
    return new AppCollector({
        authorization: token,
        baseUrl: "https://api.srv.jpush.cn",
        userId: userId,
    });
}

/**
 * 创建默认的应用收集器实例
 * 自动从 Cookie 中获取 Jtoken 并初始化收集器
 * @deprecated 推荐使用 collectXXX 系列函数，它们会实时获取token
 * @returns {Promise<AppCollector | null>} 返回收集器实例或null
 */
export async function createDefaultAppCollector(): Promise<AppCollector | null> {
    try {
        const token = await getJiguangTokenFromCookie();
        if (!token) {
            console.warn("未找到 Jtoken（从 Cookie 获取），无法创建应用收集器");
            return null;
        }

        return new AppCollector({
            authorization: token,
            baseUrl: "https://api.srv.jpush.cn",
            userId: "783922",
        });
    } catch (error) {
        console.error("创建应用收集器失败:", error);
        return null;
    }
}
