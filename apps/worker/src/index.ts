/**
 * Team Session Relay Worker 入口
 * 接受插件的 WebSocket 连接，用于 Cookie 共享
 */

import { handleWebSocketRoute } from './routes/websocket';

export { RelayRoom } from './durable-objects/relay-room';

interface Env {
    RELAY_ROOM: DurableObjectNamespace;
    AUTH_SECRET: string;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // 处理 WebSocket 和健康检查路由
        if (url.pathname === '/ws' || url.pathname === '/health') {
            return handleWebSocketRoute(request, env);
        }

        return new Response(JSON.stringify({
            service: 'team-session-relay',
            version: '1.0.0',
            endpoints: {
                websocket: '/ws?token=xxx&userId=xxx&roomId=xxx',
                health: '/health',
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
