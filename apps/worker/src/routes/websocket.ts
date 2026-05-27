/**
 * WebSocket 路由处理
 */

import { authenticate } from '../middleware/auth';
import { healthResponse, errorResponse } from '../utils/response';
import { ROUTES } from '@team-session/shared';

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
    AUTH_SECRET: string;
}

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
    // 验证请求方式
    if (request.method !== 'GET') {
        return errorResponse('仅支持 GET 请求', 405);
    }

    // 鉴权
    const auth = authenticate(request, env.AUTH_SECRET);
    if (!auth.valid) {
        return errorResponse(auth.error || '认证失败', 401);
    }

    // 获取房间 ID
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) {
        return errorResponse('缺少 roomId 参数', 400);
    }

    // 获取 Durable Object 实例
    const roomStub = env.RELAY_ROOM.get(env.RELAY_ROOM.idFromName(roomId));

    // 转发 WebSocket 请求到 Durable Object
    const forwardedUrl = new URL(request.url);
    forwardedUrl.pathname = '/ws';

    return roomStub.fetch(new Request(forwardedUrl.toString(), {
        headers: request.headers,
    }));
}
