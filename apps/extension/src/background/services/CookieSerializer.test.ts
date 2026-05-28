import { describe, it, expect, beforeEach } from 'vitest';
import { CookieSerializerImpl } from './CookieSerializer';
import { FullCookie } from '../types/index';

/**
 * CookieSerializer单元测试和属性测试
 * 测试Cookie序列化、反序列化、压缩和解压缩功能
 */
describe('CookieSerializer', () => {
  let serializer: CookieSerializerImpl;

  // 创建完整的Cookie对象辅助函数
  const createCookie = (name: string, value: string, domain = '.example.com'): FullCookie => ({
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

  beforeEach(() => {
    serializer = new CookieSerializerImpl();
  });

  describe('serialize', () => {
    it('应该正常序列化Cookie数据', () => {
      const cookies: FullCookie[] = [
        createCookie('session_id', 'abc123'),
        createCookie('user_token', 'xyz789'),
      ];
      const domain = 'example.com';

      const result = serializer.serialize(cookies, domain);

      expect(typeof result).toBe('string');
      expect(result).toContain('example.com');
      expect(result).toContain('session_id');
      expect(result).toContain('abc123');
    });

    it('应该在序列化数据中包含版本号', () => {
      const cookies: FullCookie[] = [createCookie('test', 'value')];
      const result = serializer.serialize(cookies, 'example.com');
      const parsed = JSON.parse(result);

      expect(parsed.version).toBeDefined();
      expect(parsed.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('应该在序列化数据中包含时间戳', () => {
      const cookies: FullCookie[] = [createCookie('test', 'value')];
      const beforeTime = Date.now();
      const result = serializer.serialize(cookies, 'example.com');
      const afterTime = Date.now();
      const parsed = JSON.parse(result);

      expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(parsed.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('应该在序列化数据中包含校验和', () => {
      const cookies: FullCookie[] = [createCookie('test', 'value')];
      const result = serializer.serialize(cookies, 'example.com');
      const parsed = JSON.parse(result);

      expect(parsed.checksum).toBeDefined();
      expect(typeof parsed.checksum).toBe('string');
      expect(parsed.checksum.length).toBeGreaterThan(0);
    });

    it('应该将域名转换为小写', () => {
      const cookies: FullCookie[] = [createCookie('test', 'value')];
      const result = serializer.serialize(cookies, 'EXAMPLE.COM');
      const parsed = JSON.parse(result);

      expect(parsed.domain).toBe('example.com');
    });

    it('应该抛出错误当域名为空', () => {
      const cookies: FullCookie[] = [createCookie('test', 'value')];
      expect(() => serializer.serialize(cookies, '')).toThrow('域名必须是非空字符串');
    });

    it('应该抛出错误当Cookie不是数组', () => {
      expect(() => serializer.serialize(null as any, 'example.com')).toThrow('Cookie必须是数组');
    });
  });

  describe('deserialize', () => {
    it('应该正常反序列化JSON字符串', () => {
      const cookies: FullCookie[] = [
        createCookie('session_id', 'abc123'),
        createCookie('user_token', 'xyz789'),
      ];
      const domain = 'example.com';
      const serialized = serializer.serialize(cookies, domain);

      const result = serializer.deserialize(serialized);

      expect(result.domain).toBe(domain);
      expect(result.cookies).toHaveLength(2);
      expect(result.cookies[0].name).toBe('session_id');
      expect(result.cookies[0].value).toBe('abc123');
    });

    it('应该抛出错误当JSON字符串无效', () => {
      expect(() => serializer.deserialize('invalid json')).toThrow('JSON解析失败');
    });

    it('应该抛出错误当缺少必需字段', () => {
      const invalidJson = JSON.stringify({
        version: '2.0.0',
        domain: 'example.com',
        // 缺少cookies字段
      });

      expect(() => serializer.deserialize(invalidJson)).toThrow('无效的分享数据格式');
    });

    it('应该抛出错误当版本不兼容', () => {
      const invalidJson = JSON.stringify({
        version: '3.0.0',
        domain: 'example.com',
        cookies: [createCookie('test', 'value')],
        timestamp: Date.now(),
        checksum: 'dummy',
      });

      expect(() => serializer.deserialize(invalidJson)).toThrow('不支持的版本');
    });

    it('应该验证校验和', () => {
      const cookies: FullCookie[] = [createCookie('test', 'value')];
      const serialized = serializer.serialize(cookies, 'example.com');
      const parsed = JSON.parse(serialized);

      // 修改数据以破坏校验和
      parsed.cookies[0].value = 'modified';
      const tamperedJson = JSON.stringify(parsed);

      expect(() => serializer.deserialize(tamperedJson)).toThrow('数据校验失败');
    });

    it('应该抛出错误当输入为空字符串', () => {
      expect(() => serializer.deserialize('')).toThrow('JSON字符串必须是非空字符串');
    });
  });

  describe('compress', () => {
    it('应该正常压缩字符串数据', () => {
      const data = 'This is test data for compression';
      const result = serializer.compress(data);

      expect(result instanceof Uint8Array).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该压缩后的数据小于原始数据（对于重复数据）', () => {
      const data = 'a'.repeat(1000); // 1000个'a'字符
      const result = serializer.compress(data);

      expect(result.length).toBeLessThan(data.length);
    });

    it('应该处理空字符串', () => {
      // 空字符串应该抛出错误
      expect(() => serializer.compress('')).toThrow('数据必须是非空字符串');
    });

    it('应该处理包含特殊字符的数据', () => {
      const data = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = serializer.compress(data);

      expect(result instanceof Uint8Array).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该处理Unicode字符', () => {
      const data = '中文测试数据 🎉 Ñoño';
      const result = serializer.compress(data);

      expect(result instanceof Uint8Array).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该抛出错误当输入不是字符串', () => {
      expect(() => serializer.compress(null as any)).toThrow('数据必须是非空字符串');
    });
  });

  describe('decompress', () => {
    it('应该正常解压缩数据', () => {
      const originalData = 'This is test data for compression';
      const compressed = serializer.compress(originalData);
      const result = serializer.decompress(compressed);

      expect(result).toBe(originalData);
    });

    it('应该处理包含特殊字符的解压缩', () => {
      const originalData = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const compressed = serializer.compress(originalData);
      const result = serializer.decompress(compressed);

      expect(result).toBe(originalData);
    });

    it('应该处理Unicode字符的解压缩', () => {
      const originalData = '中文测试数据 🎉 Ñoño';
      const compressed = serializer.compress(originalData);
      const result = serializer.decompress(compressed);

      expect(result).toBe(originalData);
    });

    it('应该抛出错误当输入不是Uint8Array', () => {
      expect(() => serializer.decompress(null as any)).toThrow('压缩数据必须是Uint8Array');
    });

    it('应该抛出错误当数据损坏', () => {
      const corruptedData = new Uint8Array([1, 2, 3, 4, 5]);
      expect(() => serializer.decompress(corruptedData)).toThrow('解压缩失败');
    });
  });

  // ==================== 属性测试 ====================

  describe('属性1: 序列化往返一致性', () => {
    /**
     * Feature: cookie-sharing, Property 1: 序列化往返一致性
     * Validates: Requirements 3.1, 3.2, 3.3
     *
     * 对于任何有效的Cookie对象和域名，序列化后再反序列化应该得到等价的数据
     */
    it('应该保证序列化往返一致性', () => {
      // 测试多个不同的Cookie数据集
      const testCases = [
        {
          cookies: [createCookie('session_id', 'abc123')],
          domain: 'example.com',
        },
        {
          cookies: [
            createCookie('cookie1', 'value1'),
            createCookie('cookie2', 'value2'),
            createCookie('cookie3', 'value3'),
          ],
          domain: 'test.example.com',
        },
        {
          cookies: [
            createCookie('name', 'John Doe'),
            createCookie('email', 'john@example.com'),
            createCookie('preferences', 'dark_mode=true'),
          ],
          domain: 'app.example.com',
        },
      ];

      for (const testCase of testCases) {
        const serialized = serializer.serialize(testCase.cookies, testCase.domain);
        const deserialized = serializer.deserialize(serialized);

        expect(deserialized.domain).toBe(testCase.domain.toLowerCase());
        expect(deserialized.cookies).toHaveLength(testCase.cookies.length);
        for (let i = 0; i < testCase.cookies.length; i++) {
          expect(deserialized.cookies[i].name).toBe(testCase.cookies[i].name);
          expect(deserialized.cookies[i].value).toBe(testCase.cookies[i].value);
        }
      }
    });

    it('应该处理包含特殊字符的Cookie值的往返', () => {
      const cookies: FullCookie[] = [
        createCookie('data', 'value=with;special&chars'),
        createCookie('unicode', '中文测试'),
        createCookie('emoji', '🎉🎊'),
      ];
      const domain = 'example.com';

      const serialized = serializer.serialize(cookies, domain);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(3);
      expect(deserialized.cookies[0].value).toBe('value=with;special&chars');
      expect(deserialized.cookies[1].value).toBe('中文测试');
      expect(deserialized.cookies[2].value).toBe('🎉🎊');
    });

    it('应该处理大量Cookie的往返', () => {
      const cookies: FullCookie[] = [];
      for (let i = 0; i < 100; i++) {
        cookies.push(createCookie(`cookie_${i}`, `value_${i}`));
      }
      const domain = 'example.com';

      const serialized = serializer.serialize(cookies, domain);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(100);
    });
  });

  describe('属性2: 压缩往返一致性', () => {
    /**
     * Feature: cookie-sharing, Property 2: 压缩往返一致性
     * Validates: Requirements 3.1, 3.2
     *
     * 对于任何有效的字符串数据，压缩后再解压缩应该得到原始数据
     */
    it('应该保证压缩往返一致性', () => {
      const testCases = [
        'Simple text data',
        'Text with special chars: !@#$%^&*()',
        '中文测试数据',
        'Mixed content: 中文 English 123 !@#',
        'a'.repeat(1000), // 重复数据
        JSON.stringify({ key: 'value', nested: { data: 'test' } }),
      ];

      for (const testData of testCases) {
        const compressed = serializer.compress(testData);
        const decompressed = serializer.decompress(compressed);

        expect(decompressed).toBe(testData);
      }
    });

    it('应该处理大型数据的压缩往返', () => {
      // 创建一个较大的JSON数据
      const largeData = JSON.stringify({
        cookies: Array.from({ length: 50 }, (_, i) => ({
          name: `cookie_${i}`,
          value: `value_${i}`,
        })),
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0',
        },
      });

      const compressed = serializer.compress(largeData);
      const decompressed = serializer.decompress(compressed);

      expect(decompressed).toBe(largeData);
    });

    it('应该处理各种编码的压缩往返', () => {
      const testCases = [
        'ASCII only',
        'UTF-8: 中文 日本語 한국어',
        'Emoji: 😀😃😄😁😆😅🤣😂',
        'Mixed: Hello 世界 🌍',
      ];

      for (const testData of testCases) {
        const compressed = serializer.compress(testData);
        const decompressed = serializer.decompress(compressed);

        expect(decompressed).toBe(testData);
      }
    });
  });

  describe('属性7: 特殊字符处理', () => {
    /**
     * Feature: cookie-sharing, Property 7: 特殊字符处理
     * Validates: Requirements 3.4
     *
     * 对于包含特殊字符、Unicode字符或编码问题的Cookie数据，
     * 序列化和反序列化应该保持数据完整性
     */
    it('应该正确处理特殊字符的Cookie', () => {
      const specialCharCookies: FullCookie[] = [
        createCookie('cookie-with-dash', 'value-with-dash'),
        createCookie('cookie_with_underscore', 'value_with_underscore'),
        createCookie('cookie.with.dot', 'value.with.dot'),
        createCookie('cookie=with=equals', 'value=with=equals'),
        createCookie('cookie;with;semicolon', 'value;with;semicolon'),
        createCookie('cookie&with&ampersand', 'value&with&ampersand'),
      ];

      const serialized = serializer.serialize(specialCharCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(specialCharCookies.length);
      for (let i = 0; i < specialCharCookies.length; i++) {
        expect(deserialized.cookies[i].name).toBe(specialCharCookies[i].name);
        expect(deserialized.cookies[i].value).toBe(specialCharCookies[i].value);
      }
    });

    it('应该正确处理Unicode字符的Cookie', () => {
      const unicodeCookies: FullCookie[] = [
        createCookie('chinese', '中文测试'),
        createCookie('japanese', '日本語テスト'),
        createCookie('korean', '한국어 테스트'),
        createCookie('arabic', 'اختبار عربي'),
        createCookie('russian', 'Русский тест'),
        createCookie('emoji', '😀😃😄😁😆😅🤣😂'),
      ];

      const serialized = serializer.serialize(unicodeCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(unicodeCookies.length);
      for (let i = 0; i < unicodeCookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(unicodeCookies[i].value);
      }
    });

    it('应该正确处理包含换行符和制表符的Cookie', () => {
      const specialCookies: FullCookie[] = [
        createCookie('with-newline', 'line1\nline2\nline3'),
        createCookie('with-tab', 'col1\tcol2\tcol3'),
        createCookie('with-both', 'line1\n\tindented\nline3'),
      ];

      const serialized = serializer.serialize(specialCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(specialCookies.length);
      for (let i = 0; i < specialCookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(specialCookies[i].value);
      }
    });

    it('应该正确处理包含引号的Cookie', () => {
      const quoteCookies: FullCookie[] = [
        createCookie('single-quote', "value with 'single quotes'"),
        createCookie('double-quote', 'value with "double quotes"'),
        createCookie('mixed-quotes', 'value with \'single\' and "double" quotes'),
        createCookie('escaped-quote', 'value with \\"escaped\\" quotes'),
      ];

      const serialized = serializer.serialize(quoteCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(quoteCookies.length);
      for (let i = 0; i < quoteCookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(quoteCookies[i].value);
      }
    });

    it('应该正确处理包含HTML标签的Cookie', () => {
      const htmlCookies: FullCookie[] = [
        createCookie('html-content', '<div>HTML content</div>'),
        createCookie('script-tag', '<script>alert("test")</script>'),
        createCookie('mixed-content', '<p>Paragraph with <strong>bold</strong> text</p>'),
      ];

      const serialized = serializer.serialize(htmlCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(htmlCookies.length);
      for (let i = 0; i < htmlCookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(htmlCookies[i].value);
      }
    });

    it('应该正确处理包含JSON的Cookie', () => {
      const jsonCookies: FullCookie[] = [
        createCookie('json-data', JSON.stringify({ key: 'value', nested: { data: 'test' } })),
        createCookie('json-array', JSON.stringify([1, 2, 3, 4, 5])),
        createCookie('json-complex', JSON.stringify({
          user: { name: '中文', email: 'test@example.com' },
          settings: { theme: 'dark', language: '中文' },
        })),
      ];

      const serialized = serializer.serialize(jsonCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(jsonCookies.length);
      for (let i = 0; i < jsonCookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(jsonCookies[i].value);
      }
    });

    it('应该正确处理包含URL编码的Cookie', () => {
      const urlCookies: FullCookie[] = [
        createCookie('url-encoded', 'https://example.com/path?query=value&other=123'),
        createCookie('encoded-special', '%20%21%40%23%24%25'),
        createCookie('mixed-url', 'https://example.com/path?name=John%20Doe&age=30'),
      ];

      const serialized = serializer.serialize(urlCookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(urlCookies.length);
      for (let i = 0; i < urlCookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(urlCookies[i].value);
      }
    });

    it('应该正确处理包含Base64的Cookie', () => {
      const base64Cookies: FullCookie[] = [
        createCookie('base64-data', 'SGVsbG8gV29ybGQ='),
        createCookie('base64-json', 'eyJrZXkiOiAidmFsdWUifQ=='),
        createCookie('base64-unicode', '5Lit5paC5rW35aSW'),
      ];

      const serialized = serializer.serialize(base64Cookies, 'example.com');
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.cookies).toHaveLength(base64Cookies.length);
      for (let i = 0; i < base64Cookies.length; i++) {
        expect(deserialized.cookies[i].value).toBe(base64Cookies[i].value);
      }
    });
  });
});
