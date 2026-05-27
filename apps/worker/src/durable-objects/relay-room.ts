/**
 * RelayRoom Durable Object
 * 管理 WebSocket 房间，维护用户连接和 Cookie 数据共享
 */

import {
    type RelayMessage,
    type JoinPayload,
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
    userName?: string;
    connectedAt: number;
}

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

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        this.handleSession(server);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    private handleSession(ws: WebSocket): void {
        ws.accept();

        ws.addEventListener('message', (event) => {
            try {
                const msg = parseRelayMessage(event.data as string);
                if (!msg) {
                    this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '消息格式无效');
                    return;
                }
                this.handleMessage(ws, msg);
            } catch (err) {
                this.sendError(ws, ERROR_CODES.INTERNAL_ERROR, '消息处理失败');
            }
        });

        ws.addEventListener('close', () => {
            this.handleDisconnect(ws);
        });

        ws.addEventListener('error', () => {
            this.handleDisconnect(ws);
        });
    }

    private handleMessage(ws: WebSocket, msg: RelayMessage): void {
        switch (msg.type) {
            case 'join':
                this.handleJoin(ws, msg.payload as JoinPayload);
                break;
            case 'leave':
                this.handleLeave(ws);
                break;
            case 'cookie-share':
                this.handleCookieShare(ws, msg.payload as CookieSharePayload);
                break;
            case 'cookie-request':
                this.handleCookieRequest(ws, msg.payload as CookieRequestPayload);
                break;
            case 'ping':
                this.send(ws, createRelayMessage('pong', {}, 'server'));
                break;
            default:
                this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, `未知消息类型: ${msg.type}`);
        }
    }

    private handleJoin(ws: WebSocket, payload: JoinPayload): void {
        const { roomId, userId, userName } = payload;

        if (!userId || !roomId) {
            this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, '缺少 userId 或 roomId');
            return;
        }

        if (this.users.size >= ROOM_CONFIG.MAX_USERS_PER_ROOM) {
            this.sendError(ws, ERROR_CODES.ROOM_FULL, '房间已满');
            return;
        }

        const user: ConnectedUser = {
            ws,
            userId,
            userName,
            connectedAt: Date.now(),
        };

        this.users.set(userId, user);

        // 发送确认和用户列表
        this.send(ws, createRelayMessage('join', {
            success: true,
            userId,
            users: this.getUserList(),
        }, 'server'));

        // 广播用户列表更新
        this.broadcast(createRelayMessage('user-list', {
            users: this.getUserList(),
        }, 'server'), userId);

        console.log(`用户 ${userId} 加入房间，当前 ${this.users.size} 人`);
    }

    private handleLeave(ws: WebSocket): void {
        let leftUserId: string | undefined;

        for (const [userId, user] of this.users) {
            if (user.ws === ws) {
                leftUserId = userId;
                break;
            }
        }

        if (leftUserId) {
            this.users.delete(leftUserId);
            this.broadcast(createRelayMessage('user-list', {
                users: this.getUserList(),
            }, 'server'));
            console.log(`用户 ${leftUserId} 离开房间`);
        }
    }

    private handleCookieShare(ws: WebSocket, payload: CookieSharePayload): void {
        const { domain, cookies } = payload;

        if (!domain || !cookies || !Array.isArray(cookies)) {
            this.sendError(ws, ERROR_CODES.INVALID_MESSAGE, 'Cookie 数据格式无效');
            return;
        }

        const dataSize = JSON.stringify(cookies).length;
        if (dataSize > ROOM_CONFIG.MAX_COOKIE_SIZE) {
            this.sendError(ws, ERROR_CODES.COOKIE_TOO_LARGE, 'Cookie 数据过大');
            return;
        }

        // 查找发送者
        let senderId = 'unknown';
        for (const [userId, user] of this.users) {
            if (user.ws === ws) {
                senderId = userId;
                break;
            }
        }

        // 存储 cookie
        this.cookies.set(domain, cookies);

        // 广播给其他用户
        this.broadcast(createRelayMessage('cookie-share', {
            domain,
            cookies,
            fromUserId: senderId,
        }, senderId), senderId);

        console.log(`用户 ${senderId} 共享了 ${domain} 的 ${cookies.length} 个 Cookie`);
    }

    private handleCookieRequest(ws: WebSocket, payload: CookieRequestPayload): void {
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
                    fromUserId: Array.from(this.users.entries())
                        .find(([, u]) => u.ws === ws)?.[0],
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

    private handleDisconnect(ws: WebSocket): void {
        for (const [userId, user] of this.users) {
            if (user.ws === ws) {
                this.users.delete(userId);
                this.broadcast(createRelayMessage('user-list', {
                    users: this.getUserList(),
                }, 'server'));
                console.log(`用户 ${userId} 断开连接`);
                break;
            }
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

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
    AUTH_SECRET: string;
}
