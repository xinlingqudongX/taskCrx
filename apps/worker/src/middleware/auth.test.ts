import { describe, it, expect } from 'vitest';
import { authenticate, generateToken } from './auth';

describe('auth middleware', () => {
    const secret = 'test-secret';

    describe('generateToken + authenticate', () => {
        it('应该生成并验证有效的 token', () => {
            const token = generateToken('user1', secret);
            const url = new URL('https://example.com/ws?token=' + token + '&userId=user1');
            const request = new Request(url.toString());

            const result = authenticate(request, secret);
            expect(result.valid).toBe(true);
            expect(result.userId).toBe('user1');
        });

        it('应该拒绝缺少 token 的请求', () => {
            const url = new URL('https://example.com/ws?userId=user1');
            const request = new Request(url.toString());

            const result = authenticate(request, secret);
            expect(result.valid).toBe(false);
        });

        it('应该拒绝缺少 userId 的请求', () => {
            const token = generateToken('user1', secret);
            const url = new URL('https://example.com/ws?token=' + token);
            const request = new Request(url.toString());

            const result = authenticate(request, secret);
            expect(result.valid).toBe(false);
        });
    });
});
