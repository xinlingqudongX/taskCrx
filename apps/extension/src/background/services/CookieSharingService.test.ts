import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CookieSharingServiceImpl } from './CookieSharingService';
import { CookieCollectorImpl } from './CookieCollector';
import { CookieSerializerImpl } from './CookieSerializer';
import { FullCookie } from '../types/index';

/**
 * CookieSharingService单元测试
 * 测试Cookie文件分享和导入的完整流程
 */

// 创建完整Cookie对象的辅助函数
const createFullCookie = (name: string, value: string, domain = '.example.com'): FullCookie => ({
  name,
  value,
  domain,
  path: '/',
  expirationDate: Date.now() / 1000 + 86400,
  httpOnly: false,
  secure: true,
  sameSite: 'lax',
  hostOnly: false,
  session: false,
  storeId: '0',
});

describe('CookieSharingService', () => {
  let service: CookieSharingServiceImpl;

  beforeEach(() => {
    // 创建服务实例
    service = new CookieSharingServiceImpl();

    // 模拟Chrome API
    vi.stubGlobal('chrome', {
      cookies: {
        getAll: vi.fn(),
        set: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateShareFile', () => {
    it('应该成功生成分享文件', async () => {
      // 模拟Chrome API返回Cookie
      (chrome.cookies.getAll as any).mockResolvedValue([
        { name: 'session_id', value: 'abc123', domain: '.example.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax', hostOnly: false, session: false, storeId: '0' },
        { name: 'user_token', value: 'xyz789', domain: '.example.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax', hostOnly: false, session: false, storeId: '0' },
      ]);

      const result = await service.generateShareFile('example.com');

      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('dataSize');
      expect(result.file).toHaveProperty('filename');
      expect(result.file).toHaveProperty('blob');
      expect(result.file.filename).toContain('example.com');
      expect(result.file.filename).toContain('.cookie');
      expect(result.dataSize).toBeGreaterThan(0);
    });

    it('应该抛出错误当Cookie为空', async () => {
      // 模拟Chrome API返回空Cookie
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      await expect(service.generateShareFile('example.com')).rejects.toThrow(
        '没有Cookie数据'
      );
    });

    it('应该抛出错误当域名为空', async () => {
      await expect(service.generateShareFile('')).rejects.toThrow('域名必须是非空字符串');
    });

    it('应该抛出错误当域名不是字符串', async () => {
      await expect(service.generateShareFile(null as any)).rejects.toThrow(
        '域名必须是非空字符串'
      );
    });

    it('应该规范化域名', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([
        { name: 'test', value: 'value', domain: '.example.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax', hostOnly: false, session: false, storeId: '0' },
      ]);

      // 测试各种域名格式
      const testDomains = [
        'example.com',
        'https://example.com',
        'EXAMPLE.COM',
        'example.com/path',
      ];

      for (const domain of testDomains) {
        const result = await service.generateShareFile(domain);
        expect(result).toHaveProperty('file');
      }
    });

    it('应该处理特殊字符的Cookie值', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([
        { name: 'special', value: 'value=with;special&chars', domain: '.example.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax', hostOnly: false, session: false, storeId: '0' },
        { name: 'unicode', value: '中文测试', domain: '.example.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax', hostOnly: false, session: false, storeId: '0' },
      ]);

      const result = await service.generateShareFile('example.com');

      expect(result).toHaveProperty('file');
      expect(result.dataSize).toBeGreaterThan(0);
    });
  });

  describe('setCookies', () => {
    it('应该成功设置Cookie', async () => {
      (chrome.cookies.set as any).mockResolvedValue(undefined);

      const cookies: FullCookie[] = [
        createFullCookie('session_id', 'abc123'),
        createFullCookie('user_token', 'xyz789'),
      ];

      await service.setCookies('example.com', cookies);

      expect(chrome.cookies.set).toHaveBeenCalledTimes(2);
    });

    it('应该抛出错误当域名为空', async () => {
      const cookies: FullCookie[] = [createFullCookie('test', 'value')];

      await expect(service.setCookies('', cookies)).rejects.toThrow('域名必须是非空字符串');
    });

    it('应该抛出错误当Cookie不是对象', async () => {
      await expect(service.setCookies('example.com', null as any)).rejects.toThrow(
        'Cookie必须是数组'
      );
    });

    it('应该规范化域名', async () => {
      (chrome.cookies.set as any).mockResolvedValue(undefined);

      const cookies: FullCookie[] = [createFullCookie('test', 'value')];

      await service.setCookies('HTTPS://EXAMPLE.COM/path', cookies);

      expect(chrome.cookies.set).toHaveBeenCalled();

      const callArgs = (chrome.cookies.set as any).mock.calls[0][0];
      expect(callArgs.url).toContain('example.com');
      expect(callArgs.url).toMatch(/^https:\/\//);
    });

    it('应该处理单个Cookie设置失败但继续处理其他Cookie', async () => {
      (chrome.cookies.set as any)
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined);

      const cookies: FullCookie[] = [
        createFullCookie('cookie1', 'value1'),
        createFullCookie('cookie2', 'value2'),
      ];

      await service.setCookies('example.com', cookies);

      expect(chrome.cookies.set).toHaveBeenCalledTimes(2);
    });

    it('应该处理特殊字符的Cookie值', async () => {
      (chrome.cookies.set as any).mockResolvedValue(undefined);

      const cookies: FullCookie[] = [
        createFullCookie('special', 'value=with;special&chars'),
        createFullCookie('unicode', '中文测试'),
      ];

      await service.setCookies('example.com', cookies);

      expect(chrome.cookies.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('属性: 空Cookie处理', () => {
    /**
     * 对于空的Cookie集合，系统应该阻止文件生成并返回错误
     */
    it('应该阻止空Cookie的文件生成', async () => {
      (chrome.cookies.getAll as any).mockResolvedValue([]);

      await expect(service.generateShareFile('example.com')).rejects.toThrow(
        '没有Cookie数据'
      );
    });
  });
});
