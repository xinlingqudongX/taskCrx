import { describe, it, expect } from 'vitest';
import { createRelayMessage, parseRelayMessage } from './relay-message';

describe('relay-message', () => {
    describe('createRelayMessage', () => {
        it('应该创建包含正确字段的消息', () => {
            const msg = createRelayMessage('ping', { test: true }, 'user1');
            expect(msg.type).toBe('ping');
            expect(msg.payload).toEqual({ test: true });
            expect(msg.sender).toBe('user1');
            expect(typeof msg.timestamp).toBe('number');
        });

        it('sender 应该可选', () => {
            const msg = createRelayMessage('pong', {});
            expect(msg.sender).toBeUndefined();
        });
    });

    describe('parseRelayMessage', () => {
        it('应该正确解析有效消息', () => {
            const original = createRelayMessage('join', { roomId: 'test' });
            const parsed = parseRelayMessage(JSON.stringify(original));
            expect(parsed).not.toBeNull();
            expect(parsed!.type).toBe('join');
            expect(parsed!.payload).toEqual({ roomId: 'test' });
        });

        it('应该返回 null 对于无效 JSON', () => {
            expect(parseRelayMessage('not json')).toBeNull();
        });

        it('应该返回 null 对于缺少 type 的消息', () => {
            expect(parseRelayMessage(JSON.stringify({ timestamp: 123 }))).toBeNull();
        });

        it('应该返回 null 对于缺少 timestamp 的消息', () => {
            expect(parseRelayMessage(JSON.stringify({ type: 'ping' }))).toBeNull();
        });
    });
});
