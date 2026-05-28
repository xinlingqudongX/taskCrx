/**
 * WebSocket 路由处理
 * 匿名访问：只要 roomId 格式合法即可进入对应 Durable Object 房间
 */

import { healthResponse, errorResponse } from '../utils/response';
import { ROUTES } from '@team-session/shared';

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
}

/** roomId 白名单：字母/数字/下划线/短横线，1-64 位 */
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export async function handleWebSocketRoute(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === ROUTES.HEALTH) {
        return healthResponse();
    }

    // WebSocket 连接
    if (url.pathname === ROUTES.WEBSOCKET) {
        return handleWebSocket(request, env);
    }

    return new Response('Not Found', { status: 404 });
}

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
        return errorResponse('仅支持 GET 请求', 405);
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) {
        return errorResponse('缺少 roomId 参数', 400);
    }
    if (!ROOM_ID_PATTERN.test(roomId)) {
        return errorResponse('roomId 格式无效（仅支持字母数字下划线短横线，1-64 位）', 400);
    }

    // 获取 Durable Object 实例
    const roomStub = env.RELAY_ROOM.get(env.RELAY_ROOM.idFromName(roomId));

    // 转发 WebSocket 请求到 Durable Object（透传所有 header，包括 Cookie）
    const forwardedUrl = new URL(request.url);
    forwardedUrl.pathname = '/ws';

    return roomStub.fetch(new Request(forwardedUrl.toString(), {
        headers: request.headers,
    }));
}
