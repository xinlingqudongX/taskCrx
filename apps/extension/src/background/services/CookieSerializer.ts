import { CookieSerializer, ShareData, FullCookie } from '../types/index';
import * as pako from 'pako';

/**
 * CookieSerializer实现类
 * 负责Cookie数据的序列化、反序列化、压缩和解压缩
 */
export class CookieSerializerImpl implements CookieSerializer {
  /** 当前版本号 - 升级到2.0.0以支持完整Cookie属性 */
  private readonly VERSION = '2.0.0';

  /**
   * 序列化Cookie数据为JSON字符串
   * @param cookies - 完整Cookie数组
   * @param domain - 域名
   * @returns string JSON字符串
   */
  serialize(cookies: FullCookie[], domain: string): string {
    try {
      // 验证输入
      if (!domain || typeof domain !== 'string') {
        throw new Error('域名必须是非空字符串');
      }

      if (!cookies || !Array.isArray(cookies)) {
        throw new Error('Cookie必须是数组');
      }

      // 创建分享数据对象
      const shareData: ShareData = {
        version: this.VERSION,
        domain: domain.toLowerCase(),
        cookies: cookies,
        timestamp: Date.now(),
        checksum: '', // 先设置为空，后面计算
      };

      // 计算校验和
      shareData.checksum = this.calculateChecksum(shareData);

      // 转换为JSON字符串
      return JSON.stringify(shareData);
    } catch (error) {
      throw new Error(`序列化失败: ${String(error)}`);
    }
  }

  /**
   * 反序列化JSON字符串为Cookie数据
   * @param jsonString - JSON字符串
   * @returns { domain: string, cookies: FullCookie[] }
   */
  deserialize(jsonString: string): { domain: string; cookies: FullCookie[] } {
    try {
      // 验证输入
      if (!jsonString || typeof jsonString !== 'string') {
        throw new Error('JSON字符串必须是非空字符串');
      }

      // 解析JSON
      const shareData: ShareData = JSON.parse(jsonString);

      // 验证必需字段
      if (!shareData.version || !shareData.domain || !shareData.cookies) {
        throw new Error('无效的分享数据格式：缺少必需字段');
      }

      // 验证版本兼容性
      if (!this.isVersionCompatible(shareData.version)) {
        throw new Error(`不支持的版本: ${shareData.version}`);
      }

      // 验证校验和
      const expectedChecksum = shareData.checksum;
      shareData.checksum = ''; // 临时清空以计算
      const calculatedChecksum = this.calculateChecksum(shareData);

      if (expectedChecksum !== calculatedChecksum) {
        throw new Error('数据校验失败：数据可能已被篡改');
      }

      // 处理旧版本数据兼容性（1.x版本使用Record<string, string>格式）
      let cookies: FullCookie[];
      if (shareData.version.startsWith('1.')) {
        // 将旧格式转换为新格式
        const oldCookies = shareData.cookies as unknown as Record<string, string>;
        cookies = Object.entries(oldCookies).map(([name, value]) => ({
          name,
          value,
          domain: shareData.domain,
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'lax' as const,
        }));
      } else {
        cookies = shareData.cookies;
      }

      return {
        domain: shareData.domain,
        cookies,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`JSON解析失败: 无效的JSON格式`);
      }
      throw error;
    }
  }

  /**
   * 压缩序列化数据
   * @param data - 序列化后的数据
   * @returns Uint8Array 压缩后的二进制数据
   */
  compress(data: string): Uint8Array {
    try {
      // 验证输入
      if (!data || typeof data !== 'string') {
        throw new Error('数据必须是非空字符串');
      }

      // 将字符串转换为Uint8Array
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(data);

      // 使用pako压缩
      const compressed = pako.deflate(uint8Array);

      return compressed;
    } catch (error) {
      throw new Error(`压缩失败: ${String(error)}`);
    }
  }

  /**
   * 解压缩数据
   * @param compressedData - 压缩后的二进制数据
   * @returns string 解压后的字符串
   */
  decompress(compressedData: Uint8Array): string {
    try {
      // 验证输入
      if (!compressedData || !(compressedData instanceof Uint8Array)) {
        throw new Error('压缩数据必须是Uint8Array');
      }

      // 使用pako解压缩
      const decompressed = pako.inflate(compressedData);

      // 将Uint8Array转换为字符串
      const decoder = new TextDecoder();
      const result = decoder.decode(decompressed);

      return result;
    } catch (error) {
      throw new Error(`解压缩失败: ${String(error)}`);
    }
  }

  /**
   * 计算数据校验和
   * @param shareData - 分享数据对象
   * @returns string 校验和
   */
  private calculateChecksum(shareData: Omit<ShareData, 'checksum'>): string {
    try {
      // 创建用于计算校验和的数据副本
      const dataForChecksum = {
        version: shareData.version,
        domain: shareData.domain,
        cookies: shareData.cookies,
        timestamp: shareData.timestamp,
      };

      // 转换为JSON字符串
      const jsonString = JSON.stringify(dataForChecksum);

      // 计算SHA256哈希
      // 注意：在浏览器环境中，我们使用SubtleCrypto API
      // 但为了简化，这里使用一个简单的哈希函数
      return this.simpleHash(jsonString);
    } catch (error) {
      throw new Error(`计算校验和失败: ${String(error)}`);
    }
  }

  /**
   * 简单的哈希函数（用于校验和）
   * 在实际应用中应该使用更安全的哈希算法
   * @param str - 输入字符串
   * @returns string 哈希值
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 检查版本兼容性
   * @param version - 版本号
   * @returns boolean 是否兼容
   */
  private isVersionCompatible(version: string): boolean {
    // 支持1.x和2.x版本
    return version.startsWith('1.') || version.startsWith('2.');
  }
}

/**
 * 创建CookieSerializer单例实例
 */
export const cookieSerializer = new CookieSerializerImpl();
