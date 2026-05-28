/**
 * RelayRoom Durable Object
 * 管理 WebSocket 房间，维护用户连接和 Cookie 数据共享
 *
 * 匿名身份模型：
 * - 首次连接：服务端生成 sessionId（anon-xxxxxxxx） + 随机昵称
 * - 通过 Set-Cookie 在 WebSocket upgrade 响应里下发，浏览器自动存储
 * - 后续连接浏览器自动带上 cookie，复用同一身份
 * - sessionId 仅用作连接路由 key，不代表"真实身份"
 */

import {
    type RelayMessage,
    type CookieSharePayload,
    type CookieRequestPayload,
    type CookieData,
    type UserInfo,
    createRelayMessage,
    parseRelayMessage,
    ROOM_CONFIG,
    ERROR_CODES,
} from '@team-session/shared';

interface ConnectedUser {
    ws: WebSocket;
    userId: string;
    userName: string;
    connectedAt: number;
}

const SESSION_COOKIE = 'ts_session';
const NAME_COOKIE = 'ts_name';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天
const SESSION_ID_PATTERN = /^anon-[a-f0-9]{8}$/;

export class RelayRoom implements DurableObject {
    private users: Map<string, ConnectedUser> = new Map();
    private cookies: Map<string, CookieData[]> = new Map();

    constructor(private ctx: DurableObjectState, private env: Env) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/ws') {
            return this.handleWebSocket(request);
        }

        if (url.pathname === '/users') {
            return new Response(JSON.stringify(this.getUserList()), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response('Not Found', { status: 404 });
    }

    private handleWebSocket(request: Request): Response {
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader !== 'websocket') {
            return new Response('Expected WebSocket', { status: 400 });
        }

        // 从 cookie 恢复身份，没有就生成
        const cookies = parseCookies(request.headers.get('Cookie') || '');
        let sessionId = cookies[SESSION_COOKIE];
        let userName = cookies[NAME_COOKIE] ? safeDecode(cookies[NAME_COOKIE]) : '';

        const isNew = !sessionId || !SESSION_ID_PATTERN.test(sessionId) || !userName;
        if (isNew) {
            sessionId = `anon-${randomHex(8)}`;
            userName = randomNickname();
        }

        // 同一 sessionId 已在房间：踢掉旧连接（避免一个身份多个 socket）
        const existing = this.users.get(sessionId);
        if (existing) {
            try { existing.ws.close(1000, '同一身份在新会话上连入'); } catch {}
            this.users.delete(sessionId);
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.handleSession(server, sessionId, userName);

        const headers = new Headers();
        if (isNew) {
            // 检测当前请求是否为 https，决定 Secure 属性
            // 跨站场景必须 SameSite=None; Secure
            const isHttps = new URL(request.url).protocol === 'https:';
            const secureAttrs = isHttps ? '; Secure; SameSite=None' : '; SameSite=Lax';
            headers.append(
                'Set-Cookie',
                `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly${secureAttrs}`,
            );
            headers.append(
                'Set-Cookie',
                `${NAME_COOKIE}=${encodeURIComponent(userName)}; Path=/; Max-Age=${COOKIE_MAX_AGE}${secureAttrs}`,
            );
        }

        return new Response(null, {
            status: 101,
            webSocket: client,
            headers,
        });
    }

    private handleSession(ws: WebSocket, sessionId: string, userName: string): void {
        ws.accept();

        // 立刻把分配的身份发回客户端（无需等 join）
        this.send(ws, createRelayMessage('assigned', { userId: sessionId, userName }, 'server'));

        // 默认即视为加入房间
        this.handleJoin(ws, sessionId, userName);

        ws.addEventListener('message', (event) => {
            try {
                const msg = parseRelayMessage(event.data as string);
                if (!msg) {
                    this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '消息格式无效');
                    return;
                }
                this.handleMessage(ws, msg, sessionId);
            } catch (err) {
                this.sendError(ws, ERROR_CODES.INTERNAL_ERROR, '消息处理失败');
            }
        });

        ws.addEventListener('close', () => {
            this.handleDisconnect(sessionId);
        });

        ws.addEventListener('error', () => {
            this.handleDisconnect(sessionId);
        });
    }

    private handleMessage(ws: WebSocket, msg: RelayMessage, sessionId: string): void {
        switch (msg.type) {
            case 'join':
                // 客户端可能仍会发 join，幂等处理（身份以服务端为准）
                this.send(ws, createRelayMessage('join', {
                    success: true,
                    userId: sessionId,
                    users: this.getUserList(),
                }, 'server'));
                break;
            case 'leave':
                this.handleLeave(sessionId);
                break;
            case 'cookie-share':
                this.handleCookieShare(sessionId, msg.payload as CookieSharePayload);
                break;
            case 'cookie-request':
                this.handleCookieRequest(ws, sessionId, msg.payload as CookieRequestPayload);
                break;
            case 'cookie-ack':
                this.handleCookieAck(sessionId, msg.payload as { domain: string; fromUserId: string });
                break;
            case 'ping':
                this.send(ws, createRelayMessage('pong', {}, 'server'));
                break;
            case 'rtc-offer':
            case 'rtc-answer':
            case 'rtc-ice':
                this.handleSignaling(sessionId, msg);
                break;
            default:
                this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, `未知消息类型: ${msg.type}`);
        }
    }

    private handleJoin(ws: WebSocket, sessionId: string, userName: string): void {
        if (this.users.size >= ROOM_CONFIG.MAX_USERS_PER_ROOM) {
            this.sendError(ws, ERROR_CODES.ROOM_FULL, '房间已满');
            try { ws.close(1013, '房间已满'); } catch {}
            return;
        }

        this.users.set(sessionId, {
            ws,
            userId: sessionId,
            userName,
            connectedAt: Date.now(),
        });

        // 发送 join 确认
        this.send(ws, createRelayMessage('join', {
            success: true,
            userId: sessionId,
            users: this.getUserList(),
        }, 'server'));

        // 广播用户列表更新（含本人加入事件）
        this.broadcast(createRelayMessage('user-list', {
            users: this.getUserList(),
        }, 'server'), sessionId);

        console.log(`用户 ${sessionId}(${userName}) 加入房间，当前 ${this.users.size} 人`);
    }

    private handleLeave(sessionId: string): void {
        if (this.users.delete(sessionId)) {
            this.broadcast(createRelayMessage('user-list', {
                users: this.getUserList(),
            }, 'server'));
            console.log(`用户 ${sessionId} 离开房间`);
        }
    }

    private handleCookieShare(senderId: string, payload: CookieSharePayload): void {
        const { domain, cookies } = payload;

        if (!domain || !cookies || !Array.isArray(cookies)) {
            const sender = this.users.get(senderId);
            if (sender) this.sendError(sender.ws, ERROR_CODES.INVALID_MESSAGE, 'Cookie 数据格式无效');
            return;
        }

        const dataSize = JSON.stringify(cookies).length;
        if (dataSize > ROOM_CONFIG.MAX_COOKIE_SIZE) {
            const sender = this.users.get(senderId);
            if (sender) this.sendError(sender.ws, ERROR_CODES.COOKIE_TOO_LARGE, 'Cookie 数据过大');
            return;
        }

        this.cookies.set(domain, cookies);

        // 广播并收集接收方 ID
        const msg = createRelayMessage('cookie-share', {
            domain,
            cookies,
            fromUserId: senderId,
        }, senderId);
        const data = JSON.stringify(msg);
        const recipientIds: string[] = [];
        for (const [userId, user] of this.users) {
            if (userId !== senderId) {
                try {
                    user.ws.send(data);
                    recipientIds.push(userId);
                } catch {
                    this.users.delete(userId);
                }
            }
        }

        const sender = this.users.get(senderId);
        console.log(`用户 ${senderId} 共享了 ${domain} 的 ${cookies.length} 个 Cookie，接收方: [${recipientIds.join(', ')}]`);

        // 通知发送方广播结果
        if (sender) {
            this.send(sender.ws, createRelayMessage('cookie-ack', {
                domain,
                cookieCount: cookies.length,
                recipients: recipientIds,
                recipientCount: recipientIds.length,
            }, 'server'));
        }
    }

    private handleCookieAck(senderId: string, payload: { domain: string; fromUserId: string }): void {
        const { domain, fromUserId } = payload;
        const recipient = this.users.get(senderId);
        const originalSender = this.users.get(fromUserId);
        if (recipient && originalSender) {
            this.send(originalSender.ws, createRelayMessage('cookie-ack', {
                domain,
                cookieCount: 0,
                fromUserId: senderId,
                fromUserName: recipient.userName,
                recipients: [senderId],
                recipientCount: 1,
            }, senderId));
            console.log(`用户 ${senderId}(${recipient.userName}) 确认收到 ${domain} 的 Cookie`);
        }
    }

    private handleCookieRequest(ws: WebSocket, senderId: string, payload: CookieRequestPayload): void {
        const { domain, targetUserId } = payload;

        if (!domain) {
            this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '缺少 domain 参数');
            return;
        }

        const cookies = this.cookies.get(domain);

        if (cookies) {
            this.send(ws, createRelayMessage('cookie-response', {
                domain,
                cookies,
                success: true,
            }, 'server'));
        } else if (targetUserId) {
            const targetUser = this.users.get(targetUserId);
            if (targetUser) {
                this.send(targetUser.ws, createRelayMessage('cookie-request', {
                    domain,
                    fromUserId: senderId,
                }, 'server'));
            }
        } else {
            this.send(ws, createRelayMessage('cookie-response', {
                domain,
                cookies: [],
                success: false,
                error: '没有找到该域名的 Cookie 数据',
            }, 'server'));
        }
    }

    private handleSignaling(senderId: string, msg: RelayMessage): void {
        const payload = msg.payload as { targetUserId: string };
        const sender = this.users.get(senderId);
        if (!payload?.targetUserId) {
            if (sender) this.sendError(sender.ws, ERROR_CODES.INVALID_MESSAGE, '缺少 targetUserId');
            return;
        }

        const targetUser = this.users.get(payload.targetUserId);
        if (!targetUser) {
            if (sender) this.sendError(sender.ws, ERROR_CODES.USER_NOT_FOUND, '目标用户不在线');
            return;
        }

        this.send(targetUser.ws, createRelayMessage(msg.type, {
            ...payload,
            fromUserId: senderId,
        }, senderId));
    }

    private handleDisconnect(sessionId: string): void {
        if (this.users.delete(sessionId)) {
            this.broadcast(createRelayMessage('user-list', {
                users: this.getUserList(),
            }, 'server'));
            console.log(`用户 ${sessionId} 断开连接`);
        }
    }

    private getUserList(): UserInfo[] {
        return Array.from(this.users.values()).map((u) => ({
            userId: u.userId,
            userName: u.userName,
            connectedAt: u.connectedAt,
        }));
    }

    private send(ws: WebSocket, msg: RelayMessage): void {
        try {
            ws.send(JSON.stringify(msg));
        } catch {
            // 连接可能已关闭
        }
    }

    private sendError(ws: WebSocket, code: string, message: string): void {
        this.send(ws, createRelayMessage('error', { code, message }, 'server'));
    }

    private broadcast(msg: RelayMessage, excludeUserId?: string): void {
        const data = JSON.stringify(msg);
        for (const [userId, user] of this.users) {
            if (userId !== excludeUserId) {
                try {
                    user.ws.send(data);
                } catch {
                    this.users.delete(userId);
                }
            }
        }
    }
}

// ==================== 辅助工具 ====================

function parseCookies(header: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) out[k] = v;
    }
    return out;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return '';
    }
}

function randomHex(byteLen: number): string {
    const buf = new Uint8Array(byteLen);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

const NICKNAME_ANIMALS = [
    '蓝鲸', '红狐', '银狼', '黑豹', '金雕', '青蛇',
    '白鹿', '紫雀', '橙猫', '碧鹰', '灰熊', '雪兔',
];

function randomNickname(): string {
    const animal = NICKNAME_ANIMALS[Math.floor(Math.random() * NICKNAME_ANIMALS.length)];
    const num = Math.floor(Math.random() * 900 + 100);
    return `${animal}-${num}`;
}

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
}
