/**
 * WebSocket 中继消息协议定义
 * 插件与 Worker 之间的通信协议
 */

export type RelayMessageType =
    | 'assigned'       // 服务端分配匿名身份（连接建立后第一条）
    | 'join'           // 加入房间
    | 'leave'          // 离开房间
    | 'cookie-share'   // 共享 Cookie
    | 'cookie-ack'     // Cookie 共享回执
    | 'cookie-request' // 请求 Cookie
    | 'cookie-response' // Cookie 响应
    | 'user-list'      // 用户列表更新
    | 'ping'           // 心跳
    | 'pong'           // 心跳响应
    | 'error'          // 错误消息
    | 'rtc-offer'      // WebRTC Offer 信令
    | 'rtc-answer'     // WebRTC Answer 信令
    | 'rtc-ice';       // WebRTC ICE Candidate 信令

/** 服务端分配的匿名身份 payload */
export interface AssignedPayload {
    userId: string;
    userName: string;
}

export interface RelayMessage {
    type: RelayMessageType;
    payload: unknown;
    sender?: string;
    timestamp: number;
}

export interface JoinPayload {
    roomId: string;
    /** 已废弃：userId 由服务端分配，客户端发送时被忽略 */
    userId?: string;
    /** 已废弃：userName 由服务端分配 */
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

export interface CookieAckPayload {
    domain: string;
    cookieCount: number;
    fromUserId: string;
    fromUserName: string;
}

export interface ErrorPayload {
    code: string;
    message: string;
}

export interface RTCOfferPayload {
    targetUserId: string;
    offer: RTCSessionDescriptionInit;
}

export interface RTCAnswerPayload {
    targetUserId: string;
    answer: RTCSessionDescriptionInit;
}

export interface RTCIcePayload {
    targetUserId: string;
    candidate: RTCIceCandidateInit;
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
