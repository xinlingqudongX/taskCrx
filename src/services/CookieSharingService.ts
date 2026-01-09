/**
 * Cookie分享服务
 * 协调各个组件完成Cookie分享和导入流程
 */

import { FullCookie } from '../types/index';
import { cookieCollector } from './CookieCollector';
import { cookieFileExporter, ExportedFile } from './CookieFileExporter';
import { cookieFileImporter, ImportResult } from './CookieFileImporter';

/**
 * 分享结果接口
 */
export interface ShareResult {
  /** 导出的文件信息 */
  file: ExportedFile;
  /** 数据大小（字节） */
  dataSize: number;
}

/**
 * 导入结果接口
 */
export interface ImportCookiesResult {
  /** 域名 */
  domain: string;
  /** Cookie数量 */
  cookieCount: number;
}

/**
 * CookieSharingService实现类
 * 提供Cookie的文件分享和导入功能
 */
export class CookieSharingServiceImpl {
  /**
   * 生成分享文件
   * @param domain - 域名
   * @returns Promise<ShareResult> 分享结果
   * @throws Error 当Cookie为空或生成失败时抛出错误
   */
  async generateShareFile(domain: string): Promise<ShareResult> {
    try {
      // 验证输入
      if (!domain || typeof domain !== 'string') {
        throw new Error('域名必须是非空字符串');
      }

      // 步骤1: 收集Cookie数据
      const cookies = await cookieCollector.collectCookies(domain);

      // 步骤2: 检查Cookie是否为空
      if (Object.keys(cookies).length === 0) {
        throw new Error(`域名 ${domain} 没有Cookie数据，无法生成分享文件`);
      }

      // 步骤3: 导出为文件
      const exportedFile = cookieFileExporter.export(cookies, domain);

      return {
        file: exportedFile,
        dataSize: exportedFile.dataSize,
      };
    } catch (error) {
      throw new Error(
        `生成分享文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 下载分享文件
   * @param domain - 域名
   * @returns Promise<{ filename: string, dataSize: number }> 下载信息
   */
  async downloadShareFile(domain: string): Promise<{ filename: string; dataSize: number }> {
    const result = await this.generateShareFile(domain);
    
    // 触发下载
    cookieFileExporter.download(result.file);

    return {
      filename: result.file.filename,
      dataSize: result.dataSize,
    };
  }

  /**
   * 从文件导入Cookie数据
   * @param file - 文件对象
   * @returns Promise<ImportCookiesResult> 导入结果
   * @throws Error 当文件无效或导入失败时抛出错误
   */
  async importFromFile(file: File): Promise<ImportCookiesResult> {
    try {
      // 步骤1: 导入文件
      const importResult = await cookieFileImporter.import(file);

      // 步骤2: 设置Cookie
      await this.setCookies(importResult.domain, importResult.cookies);

      return {
        domain: importResult.domain,
        cookieCount: importResult.cookieCount,
      };
    } catch (error) {
      throw new Error(
        `导入Cookie失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 从Base64字符串导入Cookie数据
   * @param base64Data - Base64编码的数据
   * @returns Promise<ImportCookiesResult> 导入结果
   */
  async importFromBase64(base64Data: string): Promise<ImportCookiesResult> {
    try {
      // 步骤1: 解析Base64数据
      const importResult = cookieFileImporter.importFromBase64(base64Data);

      // 步骤2: 设置Cookie
      await this.setCookies(importResult.domain, importResult.cookies);

      return {
        domain: importResult.domain,
        cookieCount: importResult.cookieCount,
      };
    } catch (error) {
      throw new Error(
        `导入Cookie失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 预览导入文件（不实际设置Cookie）
   * @param file - 文件对象
   * @returns Promise<ImportResult> 导入预览结果
   */
  async previewImport(file: File): Promise<ImportResult> {
    return await cookieFileImporter.import(file);
  }

  /**
   * 设置Cookie（完整属性）
   * 支持多域名：每个 cookie 使用自己的域名进行设置
   * @param domain - 主域名（用于验证和日志）
   * @param cookies - 完整Cookie数组
   * @returns Promise<void>
   * @throws Error 当设置失败时抛出错误
   */
  async setCookies(domain: string, cookies: FullCookie[]): Promise<void> {
    try {
      // 验证输入
      if (!domain || typeof domain !== 'string') {
        throw new Error('域名必须是非空字符串');
      }

      if (!cookies || !Array.isArray(cookies)) {
        throw new Error('Cookie必须是数组');
      }

      let successCount = 0;
      const domainStats: Record<string, number> = {};

      for (const cookie of cookies) {
        try {
          // 使用 cookie 自己的域名来构建 URL
          // 移除域名前导点来构建有效的 URL
          const cookieDomain = cookie.domain.startsWith('.') 
            ? cookie.domain.substring(1) 
            : cookie.domain;

          // 构建完整的Cookie设置参数
          const cookieDetails: chrome.cookies.SetDetails = {
            url: `https://${cookieDomain}${cookie.path || '/'}`,
            name: cookie.name,
            value: cookie.value,
            path: cookie.path || '/',
            secure: cookie.secure ?? true,
            httpOnly: cookie.httpOnly ?? false,
            sameSite: cookie.sameSite || 'lax',
          };

          // 设置域名（如果不是hostOnly的cookie）
          if (cookie.domain && !cookie.hostOnly) {
            cookieDetails.domain = cookie.domain;
          }

          // 设置过期时间（如果不是会话cookie）
          if (cookie.expirationDate && !cookie.session) {
            cookieDetails.expirationDate = cookie.expirationDate;
          }

          // 设置存储ID（如果有）
          if (cookie.storeId) {
            cookieDetails.storeId = cookie.storeId;
          }

          // 使用Chrome API设置Cookie
          await chrome.cookies.set(cookieDetails);
          successCount++;

          // 统计每个域名的成功数量
          domainStats[cookie.domain] = (domainStats[cookie.domain] || 0) + 1;
        } catch (cookieError) {
          // 记录单个Cookie设置失败，但继续处理其他Cookie
          console.warn(
            `设置Cookie失败 [${cookie.name}@${cookie.domain}]: ${cookieError instanceof Error ? cookieError.message : '未知错误'}`
          );
        }
      }

      if (successCount === 0 && cookies.length > 0) {
        throw new Error('所有Cookie设置都失败了');
      }

      // 打印详细的域名统计
      const domainList = Object.entries(domainStats)
        .map(([d, count]) => `${d}: ${count}个`)
        .join(', ');
      console.log(`成功设置 ${successCount}/${cookies.length} 个Cookie (${domainList})`);
    } catch (error) {
      throw new Error(
        `设置Cookie失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 规范化域名
   * 移除协议前缀（http://、https://）和路径
   * @param domain - 原始域名
   * @returns string 规范化后的域名
   */
  private normalizeDomain(domain: string): string {
    // 移除协议前缀（不区分大小写）
    let normalized = domain.replace(/^(https?:\/\/)/i, '');

    // 移除路径和查询参数
    normalized = normalized.split('/')[0];

    // 移除端口号
    normalized = normalized.split(':')[0];

    // 转换为小写
    normalized = normalized.toLowerCase();

    return normalized;
  }

  /**
   * 获取支持的文件扩展名
   * @returns string[] 支持的扩展名列表
   */
  getSupportedExtensions(): string[] {
    return cookieFileImporter.getSupportedExtensions();
  }

  /**
   * 获取文件选择器的accept属性值
   * @returns string accept属性值
   */
  getAcceptAttribute(): string {
    return cookieFileImporter.getAcceptAttribute();
  }
}

/**
 * 创建CookieSharingService单例实例
 */
export const cookieSharingService = new CookieSharingServiceImpl();
