import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WSClient } from './ws-client';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // 模拟异步连接建立
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }
}

describe('WSClient', () => {
  let client: WSClient;
  const defaultConfig = {
    serverUrl: 'wss://test.workers.dev',
    roomId: 'test-room',
    heartbeatInterval: 30000,
    reconnectInterval: 1000,
    maxReconnectAttempts: 3,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isConnected', () => {
    it('未连接时返回 false', () => {
      client = new WSClient(defaultConfig);
      expect(client.isConnected).toBe(false);
    });

    it('连接建立后返回 true', async () => {
      client = new WSClient(defaultConfig);
      client.connect();

      // 推进定时器让 WebSocket.onopen 触发
      await vi.advanceTimersByTimeAsync(20);

      expect(client.isConnected).toBe(true);
    });
  });

  describe('connect 单例行为', () => {
    it('已连接时重复调用 connect 不创建新 WebSocket', async () => {
      client = new WSClient(defaultConfig);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      expect(client.isConnected).toBe(true);

      // 记录当前 WebSocket 实例
      const connectedHandler = vi.fn();
      client.on('connected', connectedHandler);

      // 再次调用 connect — 应该是 no-op
      client.connect();

      // 不应该触发新的 connected 事件
      expect(connectedHandler).not.toHaveBeenCalled();
    });

    it('断开后可以重新连接', async () => {
      client = new WSClient(defaultConfig);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      expect(client.isConnected).toBe(true);

      client.disconnect();
      expect(client.isConnected).toBe(false);

      // 重新连接
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      expect(client.isConnected).toBe(true);
    });
  });

  describe('destroy', () => {
    it('destroy 后不再自动重连', async () => {
      client = new WSClient(defaultConfig);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      client.destroy();

      // 模拟连接断开
      const connectedHandler = vi.fn();
      client.on('connected', connectedHandler);

      // 推进时间，不应该触发重连
      await vi.advanceTimersByTimeAsync(10000);

      expect(connectedHandler).not.toHaveBeenCalled();
    });
  });
});
