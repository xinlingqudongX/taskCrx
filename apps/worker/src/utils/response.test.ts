import { describe, it, expect } from 'vitest';
import { jsonResponse, errorResponse, healthResponse } from './response';

describe('response utils', () => {
    it('jsonResponse 应该返回 JSON 响应', async () => {
        const res = jsonResponse({ hello: 'world' }, 200);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/json');
        const body = await res.json();
        expect(body).toEqual({ hello: 'world' });
    });

    it('errorResponse 应该返回错误响应', async () => {
        const res = errorResponse('bad request', 400);
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toBe('bad request');
    });

    it('healthResponse 应该返回健康检查响应', async () => {
        const res = healthResponse();
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string; service: string };
        expect(body.status).toBe('ok');
        expect(body.service).toBe('team-session-relay');
    });
});
