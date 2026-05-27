/**
 * HTTP 响应工具函数
 */

export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ error: message }, status);
}

export function healthResponse(): Response {
    return jsonResponse({
        status: 'ok',
        timestamp: Date.now(),
        service: 'team-session-relay',
    });
}
