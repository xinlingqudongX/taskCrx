/**
 * Cookie文件导出器
 * 将Cookie数据导出为可分享的文件
 */

import { FullCookie } from '../types/index';
import { cookieSerializer } from './CookieSerializer';

/**
 * 导出文件的格式
 */
export interface ExportedFile {
  /** 文件名 */
  filename: string;
  /** 文件内容（Blob） */
  blob: Blob;
  /** 数据大小（字节） */
  dataSize: number;
}

/**
 * Cookie文件导出器实现类
 */
export class CookieFileExporterImpl {
  /** 文件扩展名 */
  private readonly FILE_EXTENSION = '.cookie';
  
  /** 文件MIME类型 */
  private readonly MIME_TYPE = 'application/octet-stream';

  /**
   * 导出Cookie数据为文件
   * @param cookies - 完整Cookie数组
   * @param domain - 域名
   * @returns ExportedFile 导出的文件信息
   */
  export(cookies: FullCookie[], domain: string): ExportedFile {
    // 验证输入
    if (!cookies || !Array.isArray(cookies)) {
      throw new Error('Cookie必须是数组');
    }

    if (!domain || typeof domain !== 'string') {
      throw new Error('域名必须是非空字符串');
    }

    if (cookies.length === 0) {
      throw new Error('Cookie数据不能为空');
    }

    // 序列化Cookie数据
    const serializedData = cookieSerializer.serialize(cookies, domain);

    // 压缩数据
    const compressedData = cookieSerializer.compress(serializedData);

    // 创建Blob
    const blob = new Blob([compressedData], { type: this.MIME_TYPE });

    // 生成安全的文件名
    const safeDomain = this.sanitizeDomainForFilename(domain);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${safeDomain}_${timestamp}${this.FILE_EXTENSION}`;

    return {
      filename,
      blob,
      dataSize: compressedData.length,
    };
  }

  /**
   * 触发文件下载
   * @param exportedFile - 导出的文件信息
   */
  download(exportedFile: ExportedFile): void {
    const url = URL.createObjectURL(exportedFile.blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = exportedFile.filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * 将域名转换为安全的文件名
   * @param domain - 域名
   * @returns string 安全的文件名部分
   */
  private sanitizeDomainForFilename(domain: string): string {
    return domain
      .replace(/^(https?:\/\/)/i, '')  // 移除协议
      .replace(/[\/\\:*?"<>|]/g, '_')  // 替换不安全字符
      .replace(/\.+/g, '.')            // 合并多个点
      .replace(/^\.+|\.+$/g, '')       // 移除首尾的点
      .slice(0, 50);                    // 限制长度
  }

  /**
   * 获取文件扩展名
   * @returns string 文件扩展名
   */
  getFileExtension(): string {
    return this.FILE_EXTENSION;
  }
}

/**
 * 创建CookieFileExporter单例实例
 */
export const cookieFileExporter = new CookieFileExporterImpl();
