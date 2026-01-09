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
    /** 最后执行状态 */
    lastExecutionStatus?: 'success' | 'failed';
    /** 最后执行失败原因 */
    lastExecutionError?: string;
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
    /** 是否收集极光数据信息（包含用户信息和应用列表） */
    collectJiguangData?: boolean;
    /** 是否收集苹果数据信息（包含应用列表和团队信息） */
    collectAppleData?: boolean;
    /** 最大应用数量限制 */
    maxApps?: number;
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
 * 极光推送应用信息（增强版，包含详情）
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
    /** 应用详情信息 */
    detail?: JiguangAppDetail;
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
 * 极光推送数据集合
 * @interface JiguangData
 */
export interface JiguangData {
    /** 用户信息 */
    userInfo: JiguangUserInfo;
    /** 应用列表（包含详情） */
    appList: JiguangAppInfo[];
}

/**
 * 苹果开发者数据集合
 * @interface AppleData
 */
export interface AppleData {
    /** 应用列表 */
    appList: AppleAppInfo[];
    /** Actor列表（团队信息） */
    actorList: AppleActorInfo[];
}

/**
 * 收集到的应用数据
 * @interface CollectedAppData
 */
export interface CollectedAppData {
    /** 极光推送数据 */
    jiguangData?: JiguangData;
    /** 苹果开发者数据 */
    appleData?: AppleData;
    /** 收集时间戳 */
    collectTime: number;
}

/**
 * 苹果开发者应用信息（精简版）
 * @interface AppleAppInfo
 */
export interface AppleAppInfo {
    /** 应用ID */
    id: string;
    /** 应用名称 */
    name: string;
    /** Bundle ID */
    bundleId: string;
    /** SKU */
    sku?: string;
    /** 主要语言 */
    primaryLocale?: string;
}

/**
 * 苹果开发者Actor信息（精简版）
 * @interface AppleActorInfo
 */
export interface AppleActorInfo {
    /** Actor ID */
    id: string;
    /** 角色列表 */
    roles: string[];
    /** 是否当前用户 */
    isCurrent: boolean;
    /** 团队类型 */
    teamType: string;
    /** 团队ID */
    teamId: string;
    /** 开发者团队ID */
    developerTeamId?: string;
    /** 团队名称 */
    teamName?: string;
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
    cookie: Record<string, any>;
    /** 应用数据 */
    content?: CollectedAppData;
    account: string;
    type: string;
}

// ==================== Cookie分享功能类型定义 ====================

/**
 * 完整的Cookie数据接口
 * 包含Chrome Cookie API返回的所有属性
 * @interface FullCookie
 */
export interface FullCookie {
    /** Cookie名称 */
    name: string;
    /** Cookie值 */
    value: string;
    /** Cookie所属域名 */
    domain: string;
    /** Cookie路径 */
    path: string;
    /** 过期时间（Unix时间戳，秒） */
    expirationDate?: number;
    /** 是否仅HTTP访问 */
    httpOnly: boolean;
    /** 是否安全连接 */
    secure: boolean;
    /** SameSite策略 */
    sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
    /** 是否为主机专用Cookie */
    hostOnly?: boolean;
    /** 是否为会话Cookie */
    session?: boolean;
    /** 存储ID */
    storeId?: string;
}

/**
 * 分享数据接口
 * @interface ShareData
 */
export interface ShareData {
    /** 版本号 */
    version: string;
    /** 域名 */
    domain: string;
    /** Cookie数据（完整Cookie数组） */
    cookies: FullCookie[];
    /** 时间戳 */
    timestamp: number;
    /** 数据校验和 */
    checksum: string;
}

/**
 * 导出文件元数据接口
 * @interface ExportFileMetadata
 */
export interface ExportFileMetadata {
    /** 文件名 */
    filename: string;
    /** 数据大小 */
    dataSize: number;
    /** 压缩算法 */
    compression: 'zlib' | 'none';
}

/**
 * Cookie收集器接口
 * @interface CookieCollector
 */
export interface CookieCollector {
    /**
     * 收集指定域名的所有Cookie（完整属性）
     * @param domain - 域名
     * @returns Promise<FullCookie[]> 完整Cookie数组
     */
    collectCookies(domain: string): Promise<FullCookie[]>;

    /**
     * 收集指定域名的Cookie键值对（简化版）
     * @param domain - 域名
     * @returns Promise<Record<string, string>> Cookie键值对
     */
    collectCookiesSimple(domain: string): Promise<Record<string, string>>;

    /**
     * 检查域名是否有Cookie
     * @param domain - 域名
     * @returns Promise<boolean>
     */
    hasCookies(domain: string): Promise<boolean>;
}

/**
 * Cookie序列化器接口
 * @interface CookieSerializer
 */
export interface CookieSerializer {
    /**
     * 序列化Cookie数据为JSON字符串
     * @param cookies - 完整Cookie数组
     * @param domain - 域名
     * @returns string JSON字符串
     */
    serialize(cookies: FullCookie[], domain: string): string;

    /**
     * 反序列化JSON字符串为Cookie数据
     * @param jsonString - JSON字符串
     * @returns { domain: string, cookies: FullCookie[] }
     */
    deserialize(jsonString: string): { domain: string; cookies: FullCookie[] };

    /**
     * 压缩序列化数据
     * @param data - 序列化后的数据
     * @returns Uint8Array 压缩后的二进制数据
     */
    compress(data: string): Uint8Array;

    /**
     * 解压缩数据
     * @param compressedData - 压缩后的二进制数据
     * @returns string 解压后的字符串
     */
    decompress(compressedData: Uint8Array): string;
}

/**
 * Cookie文件导出器接口
 * @interface CookieFileExporter
 */
export interface CookieFileExporter {
    /**
     * 导出Cookie数据为文件
     * @param cookies - 完整Cookie数组
     * @param domain - 域名
     * @returns { filename: string, blob: Blob, dataSize: number } 导出的文件信息
     */
    export(cookies: FullCookie[], domain: string): { filename: string; blob: Blob; dataSize: number };

    /**
     * 触发文件下载
     * @param exportedFile - 导出的文件信息
     */
    download(exportedFile: { filename: string; blob: Blob }): void;

    /**
     * 获取文件扩展名
     * @returns string 文件扩展名
     */
    getFileExtension(): string;
}

/**
 * Cookie文件导入器接口
 * @interface CookieFileImporter
 */
export interface CookieFileImporter {
    /**
     * 从文件导入Cookie数据
     * @param file - 文件对象
     * @returns Promise<{ domain: string, cookies: FullCookie[], cookieCount: number }> 导入结果
     */
    import(file: File): Promise<{ domain: string; cookies: FullCookie[]; cookieCount: number }>;

    /**
     * 从Base64字符串导入Cookie数据
     * @param base64String - Base64编码的数据
     * @returns { domain: string, cookies: FullCookie[], cookieCount: number } 导入结果
     */
    importFromBase64(base64String: string): { domain: string; cookies: FullCookie[]; cookieCount: number };

    /**
     * 获取支持的文件扩展名
     * @returns string[] 支持的扩展名列表
     */
    getSupportedExtensions(): string[];
}

/**
 * Cookie分享服务接口
 * @interface CookieSharingService
 */
export interface CookieSharingService {
    /**
     * 生成分享文件
     * @param domain - 域名
     * @returns Promise<{ file: { filename: string, blob: Blob, dataSize: number }, dataSize: number }>
     */
    generateShareFile(domain: string): Promise<{ file: { filename: string; blob: Blob; dataSize: number }; dataSize: number }>;

    /**
     * 下载分享文件
     * @param domain - 域名
     * @returns Promise<{ filename: string, dataSize: number }>
     */
    downloadShareFile(domain: string): Promise<{ filename: string; dataSize: number }>;

    /**
     * 从文件导入Cookie数据
     * @param file - 文件对象
     * @returns Promise<{ domain: string, cookieCount: number }>
     */
    importFromFile(file: File): Promise<{ domain: string; cookieCount: number }>;

    /**
     * 从Base64字符串导入Cookie数据
     * @param base64Data - Base64编码的数据
     * @returns Promise<{ domain: string, cookieCount: number }>
     */
    importFromBase64(base64Data: string): Promise<{ domain: string; cookieCount: number }>;

    /**
     * 设置Cookie（完整属性）
     * @param domain - 域名
     * @param cookies - 完整Cookie数组
     * @returns Promise<void>
     */
    setCookies(domain: string, cookies: FullCookie[]): Promise<void>;
}
