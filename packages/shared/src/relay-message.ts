/**
 * WebSocket 中继消息协议定义
 * 插件与 Worker 之间的通信协议
 */

export type RelayMessageType =
    | 'join'           // 加入房间
    | 'leave'          // 离开房间
    | 'cookie-share'   // 共享 Cookie
    | 'cookie-request' // 请求 Cookie
    | 'cookie-response' // Cookie 响应
    | 'user-list'      // 用户列表更新
    | 'ping'           // 心跳
    | 'pong'           // 心跳响应
    | 'error';         // 错误消息

export interface RelayMessage {
    type: RelayMessageType;
    payload: unknown;
    sender?: string;
    timestamp: number;
}

export interface JoinPayload {
    roomId: string;
    userId: string;
    userName?: string;
}

export interface CookieSharePayload {
    domain: string;
    cookies: CookieData[];
}

export interface CookieData {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
    expirationDate?: number;
}

export interface CookieRequestPayload {
    domain: string;
    targetUserId?: string;
}

export interface CookieResponsePayload {
    domain: string;
    cookies: CookieData[];
    fromUserId: string;
    success: boolean;
    error?: string;
}

export interface UserListPayload {
    users: UserInfo[];
}

export interface UserInfo {
    userId: string;
    userName?: string;
    connectedAt: number;
}

export interface ErrorPayload {
    code: string;
    message: string;
}

/**
 * 创建中继消息
 */
export function createRelayMessage(
    type: RelayMessageType,
    payload: unknown,
    sender?: string
): RelayMessage {
    return {
        type,
        payload,
        sender,
        timestamp: Date.now(),
    };
}

/**
 * 解析中继消息
 */
export function parseRelayMessage(data: string): RelayMessage | null {
    try {
        const msg = JSON.parse(data);
        if (!msg.type || typeof msg.timestamp !== 'number') {
            return null;
        }
        return msg as RelayMessage;
    } catch {
        return null;
    }
}
