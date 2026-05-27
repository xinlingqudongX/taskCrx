import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CookieCollectorImpl } from './CookieCollector';

/**
 * CookieCollector单元测试
 * 测试Cookie收集功能的核心逻辑
 */
describe('CookieCollector', () => {
  let collector: CookieCollectorImpl;

  // 创建完整的模拟Cookie数据
  const createMockCookie = (name: string, value: string, domain = '.example.com') => ({
    name,
    value,
    domain,
    path: '/',
    expirationDate: Date.now() / 1000 + 86400,
    httpOnly: false,
    secure: true,
    sameSite: 'lax' as const,
    hostOnly: false,
    session: false,
    storeId: '0',
  });

  beforeEach(() => {
    collector = new CookieCollectorImpl();
    // 模拟Chrome API
    vi.stubGlobal('chrome', {
      cookies: {
        getAll: vi.fn(),
      },
    });
  });

  describe('collectCookies', () => {
    it('应该正常收集Cookie（完整属性）', async () => {
      // 模拟Chrome API返回Cookie数据
      const mockCookies = [
        createMockCookie('session_id', 'abc123'),
        createMockCookie('user_token', 'xyz789'),
      ];

      (chrome.cookies.getAll as any).mockResolvedValue(mockCookies);

      const result = await collector.collectCookies('example.com');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('session_id');
      expect(result[0].value).toBe('abc123');
      expect(result[0].domain).toBe('.example.com');
      expect(result[0].httpOnly).toBe(false);
      expect(result[0].secure).toBe(true);
      expect(chrome.cookies.getAll).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });

    it('应该处理空Cookie情况', async () => {
      // 模拟Chrome API返回空数组
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      const result = await collector.collectCookies('example.com');

      expect(result).toEqual([]);
    });

    it('应该处理特殊字符的Cookie值', async () => {
      // 模拟包含特殊字符的Cookie
      const mockCookies = [
        createMockCookie('data', 'value=with;special&chars'),
        createMockCookie('unicode', '中文测试'),
      ];

      (chrome.cookies.getAll as any).mockResolvedValue(mockCookies);

      const result = await collector.collectCookies('example.com');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('value=with;special&chars');
      expect(result[1].value).toBe('中文测试');
    });

    it('应该规范化域名（移除协议前缀）', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      await collector.collectCookies('https://example.com');

      expect(chrome.cookies.getAll).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });

    it('应该规范化域名（移除路径）', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      await collector.collectCookies('example.com/path/to/page');

      expect(chrome.cookies.getAll).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });

    it('应该规范化域名（转换为小写）', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      await collector.collectCookies('EXAMPLE.COM');

      expect(chrome.cookies.getAll).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });

    it('应该抛出错误当域名为空', async () => {
      await expect(collector.collectCookies('')).rejects.toThrow('域名必须是非空字符串');
    });

    it('应该抛出错误当域名不是字符串', async () => {
      await expect(collector.collectCookies(null as any)).rejects.toThrow('域名必须是非空字符串');
    });

    it('应该处理权限错误', async () => {
      (chrome.cookies.getAll as any).mockRejectedValue(new Error('Permission denied'));

      await expect(collector.collectCookies('example.com')).rejects.toThrow(
        '无法访问域名 example.com 的Cookie：权限不足'
      );
    });

    it('应该处理API调用失败', async () => {
      (chrome.cookies.getAll as any).mockRejectedValue(new Error('API error'));

      await expect(collector.collectCookies('example.com')).rejects.toThrow('API error');
    });
  });

  describe('collectCookiesSimple', () => {
    it('应该返回Cookie键值对（简化版）', async () => {
      const mockCookies = [
        createMockCookie('session_id', 'abc123'),
        createMockCookie('user_token', 'xyz789'),
      ];

      (chrome.cookies.getAll as any).mockResolvedValue(mockCookies);

      const result = await collector.collectCookiesSimple('example.com');

      expect(result).toEqual({
        session_id: 'abc123',
        user_token: 'xyz789',
      });
    });
  });

  describe('hasCookies', () => {
    it('应该在有Cookie时返回true', async () => {
      const mockCookies = [createMockCookie('session_id', 'abc123')];
      (chrome.cookies.getAll as any).mockResolvedValue(mockCookies);

      const result = await collector.hasCookies('example.com');

      expect(result).toBe(true);
    });

    it('应该在没有Cookie时返回false', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      const result = await collector.hasCookies('example.com');

      expect(result).toBe(false);
    });

    it('应该在发生错误时返回false', async () => {
      (chrome.cookies.getAll as any).mockRejectedValue(new Error('API error'));

      const result = await collector.hasCookies('example.com');

      expect(result).toBe(false);
    });

    it('应该在多个Cookie时返回true', async () => {
      const mockCookies = [
        createMockCookie('cookie1', 'value1'),
        createMockCookie('cookie2', 'value2'),
        createMockCookie('cookie3', 'value3'),
      ];
      (chrome.cookies.getAll as any).mockResolvedValue(mockCookies);

      const result = await collector.hasCookies('example.com');

      expect(result).toBe(true);
    });
  });
});
