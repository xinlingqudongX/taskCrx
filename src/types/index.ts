// src/types/index.ts

/**
 * 任务配置接口
 * @interface Task
 */
export interface Task {
    /** 任务唯一标识 */
    id: string;
    /** 关联的域名 */
    domain: string;
    /** 任务名称 */
    name: string;
    /** Cron表达式 */
    cron: string;
    /** 目标API地址 */
    targetUrl: string;
    /** 请求头信息 */
    headers: Record<string, string>;
    /** 是否启用 */
    enabled: boolean;
    /** 并发数量 */
    concurrent?: number;
    /** 最后执行时间 */
    lastRun?: number;
    /** 是否包含应用数据 */
    includeAppData?: boolean;
    /** 应用数据配置 */
    appDataConfig?: AppDataConfig;
}

/**
 * 域名类型定义
 */
export type Domain = string;

/**
 * 应用数据配置接口
 * @interface AppDataConfig
 */
export interface AppDataConfig {
    /** 是否收集用户信息 */
    collectUserInfo: boolean;
    /** 是否收集应用列表 */
    collectAppList: boolean;
    /** 最大应用数量 */
    maxApps?: number;
    /** 是否收集苹果开发者应用 */
    collectAppleApps?: boolean;
    /** 苹果应用最大数量 */
    maxAppleApps?: number;
}

/**
 * 极光推送应用详情信息
 * @interface JiguangAppDetail
 */
export interface JiguangAppDetail {
    /** 应用名称 */
    name: string;
    /** 应用图标URL */
    icon: string;
    /** 应用密钥 */
    key: string;
    /** API主密钥 */
    apiMasterSecret: string;
    /** 位置/地区 */
    location: string;
    /** 应用分类 */
    appCategory: number;
    /** 应用分类ID */
    appCategoryId: string;
    /** 应用分类内容 */
    appCategoryContent: string;
    /** 应用包名 (Android) */
    appPackage: string;
    /** 包标识符 (iOS) */
    bundleId: string;
    /** 应用描述 */
    appDescription: string | null;
    /** 最后更新时间 */
    lastUpdateTime: string;
    /** 创建时间 */
    createTime: string;
    /** 是否为演示应用 */
    demo: boolean;
}

/**
 * 极光推送应用分组信息
 * @interface JiguangAppGroup
 */
export interface JiguangAppGroup {
    /** 应用分组密钥 */
    appGroupKey: string;
    /** 应用分组名称 */
    appGroupName: string;
}

/**
 * 极光推送应用信息
 * @interface JiguangAppInfo
 */
export interface JiguangAppInfo {
    /** 应用ID */
    appId: string | null;
    /** 应用密钥 */
    appKey: string;
    /** 应用名称 */
    name: string;
    /** 包名 */
    pkg: string;
    /** 支持平台 (a=Android, i=iOS, q=Quick App) */
    platform: string;
    /** 是否为VIP应用 (0=否, 1=是) */
    isVipApp: number;
    /** 应用图标URL */
    icon: string;
    /** VIP截止时间戳 */
    vipDeadLineTime: number;
    /** 创建时间戳 */
    createTime: number;
    /** 默认微信小程序 */
    defaultWxApp: any | null;
    /** 是否为演示应用 */
    demo: boolean;
}

/**
 * 极光推送应用列表响应数据
 * @interface JiguangAppListResponse
 */
export interface JiguangAppListResponse {
    /** 应用分组列表 */
    appGroups: JiguangAppGroup[];
    /** 应用列表 */
    apps: JiguangAppInfo[];
    /** 当前服务器时间戳 */
    currentTime: number;
}

/**
 * 极光推送用户信息
 * @interface JiguangUserInfo
 */
export interface JiguangUserInfo {
    /** 开发者信息 */
    dev: {
        /** 用户ID */
        id: number;
        /** 用户名 */
        username: string;
        /** 邮箱地址 */
        email: string;
        /** 联系人 */
        contacter: string;
        /** QQ号 */
        qq: string | null;
        /** 手机号 */
        mobile: string;
        /** 公司名称 */
        companyName: string;
        /** 注册日期时间戳 */
        regDate: number;
        /** 父级ID */
        parentId: number;
        /** 父级名称 */
        parentName: string;
        /** 付费比率 */
        payRate: number;
        /** 开发者密钥 */
        devKey: string;
        /** 开发者密钥Secret */
        devSecret: string;
        /** 注册来源 */
        registerSource: string | null;
        /** VIP创建时间 */
        vipCreateTime: number | null;
        /** VIP截止时间 */
        vipDeadlineTime: number | null;
        /** 当前时间戳 */
        currentTime: number;
        /** 应用密钥数量 */
        appKeyCount: number;
    };
    /** 未读消息数量 */
    unreadCount: number;
    /** 是否为子用户 */
    isSubUser: boolean;
    /** 认证类型 */
    authType: number;
    /** 职位角色 */
    position: string;
    /** 子账户VIP状态 */
    subAccountVIP: number;
}

/**
 * 收集到的应用数据
 * @interface CollectedAppData
 */
export interface CollectedAppData {
    /** 用户信息 */
    userInfo?: JiguangUserInfo;
    /** 应用列表响应数据 */
    appListData?: JiguangAppListResponse;
    /** 应用列表 (为了向后兼容) */
    appList?: JiguangAppInfo[];
    /** 应用分组列表 */
    appGroups?: JiguangAppGroup[];
    /** 应用详情列表 */
    appDetails?: JiguangAppDetail[];
    /** 苹果开发者应用列表 */
    appleAppList?: AppleAppInfo[];
    /** 苹果开发者应用响应数据 */
    appleAppListData?: AppleAppListResponse;
    /** 网页localStorage数据 */
    localStorage?: Record<string, any>;
    /** 收集时间戳 */
    collectTime: number;
    /** 数据源标识 */
    source: "jiguang" | "apple" | "mixed";
}

/**
 * 苹果开发者应用信息
 * @interface AppleAppInfo
 */
export interface AppleAppInfo {
    /** 应用类型 */
    type: string;
    /** 应用ID */
    id: string;
    /** 应用属性（可选，某些API响应中可能不包含） */
    attributes?: {
        /** 应用名称 */
        name?: string;
        /** Bundle ID */
        bundleId?: string;
        /** SKU */
        sku?: string;
        /** 主要语言 */
        primaryLocale?: string;
        /** 是否可移除 */
        isOrEverWasMadeForKids?: boolean;
        /** 订阅状态信息 */
        subscriptionStatusUrl?: string;
        /** 订阅状态URL版本 */
        subscriptionStatusUrlVersion?: string;
        /** 订阅状态URL共享密钥 */
        subscriptionStatusUrlForSandbox?: string;
        /** 订阅状态URL沙盒版本 */
        subscriptionStatusUrlVersionForSandbox?: string;
        /** 可用领土 */
        availableInNewTerritories?: boolean;
        /** 内容权限声明 */
        contentRightsDeclaration?: string;
    };
    /** 关联关系 */
    relationships?: {
        /** 审核提交 */
        reviewSubmissions?: {
            /** 元数据 */
            meta?: {
                /** 分页信息 */
                paging: {
                    /** 限制 */
                    limit: number;
                };
            };
            /** 数据 */
            data?: Array<{
                /** 类型 */
                type: string;
                /** ID */
                id: string;
            }>;
            /** 链接 */
            links?: {
                /** 自链接 */
                self: string;
                /** 相关链接 */
                related: string;
            };
        };
        /** 可显示版本（保留向后兼容） */
        displayableVersions?: {
            /** 链接 */
            links?: {
                /** 自链接 */
                self: string;
                /** 相关链接 */
                related: string;
            };
            /** 元数据 */
            meta?: {
                /** 分页信息 */
                paging: {
                    /** 总数 */
                    total: number;
                    /** 限制 */
                    limit: number;
                };
            };
            /** 数据 */
            data?: Array<{
                /** 类型 */
                type: string;
                /** ID */
                id: string;
            }>;
        };
    };
    /** 链接 */
    links: {
        /** 自链接 */
        self: string;
    };
}

/**
 * 苹果开发者审核提交信息
 * @interface AppleReviewSubmission
 */
export interface AppleReviewSubmission {
    /** 类型 */
    type: string;
    /** 审核提交ID */
    id: string;
    /** 属性 */
    attributes: {
        /** 平台 */
        platform: string;
        /** 提交日期 */
        submittedDate: string | null;
        /** 状态 */
        state: string;
    };
    /** 关联关系 */
    relationships?: {
        /** 项目 */
        items?: {
            /** 链接 */
            links: {
                /** 自链接 */
                self: string;
                /** 相关链接 */
                related: string;
            };
        };
    };
    /** 链接 */
    links: {
        /** 自链接 */
        self: string;
    };
}

/**
 * 苹果开发者应用列表响应数据
 * @interface AppleAppListResponse
 */
export interface AppleAppListResponse {
    /** 应用数据列表 */
    data: AppleAppInfo[];
    /** 包含的相关数据（如审核提交信息等） */
    included?: AppleReviewSubmission[];
    /** 链接信息 */
    links: {
        /** 自链接 */
        self: string;
        /** 首页链接 */
        first?: string;
        /** 下一页链接 */
        next?: string;
    };
    /** 元数据 */
    meta: {
        /** 分页信息 */
        paging: {
            /** 总数 */
            total: number;
            /** 限制 */
            limit: number;
        };
    };
}

/**
 * 扩展的任务执行数据，包含应用信息
 * @interface TaskExecutionData
 */
export interface TaskExecutionData {
    /** 任务ID */
    taskId: string;
    /** 执行时间戳 */
    timestamp: number;
    /** Cookie数据 */
    cookies: Record<string, any>;
    /** 应用数据 */
    appData?: CollectedAppData;
}
