/**
 * Cookie文件导入器
 * 从文件中导入Cookie数据
 */

import { FullCookie } from '../types/index';
import { cookieSerializer } from './CookieSerializer';

/**
 * 导入结果接口
 */
export interface ImportResult {
  /** 域名 */
  domain: string;
  /** 完整Cookie数组 */
  cookies: FullCookie[];
  /** Cookie数量 */
  cookieCount: number;
}

/**
 * Cookie文件导入器实现类
 */
export class CookieFileImporterImpl {
  /** 支持的文件扩展名 */
  private readonly SUPPORTED_EXTENSIONS = ['.cookie'];
  
  /** 最大文件大小（10MB） */
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  /**
   * 从文件导入Cookie数据
   * @param file - 文件对象
   * @returns Promise<ImportResult> 导入结果
   */
  async import(file: File): Promise<ImportResult> {
    // 验证文件
    this.validateFile(file);

    // 读取文件内容
    const arrayBuffer = await this.readFileAsArrayBuffer(file);
    const compressedData = new Uint8Array(arrayBuffer);

    // 解压缩数据
    const decompressedData = cookieSerializer.decompress(compressedData);

    // 反序列化数据
    const { domain, cookies } = cookieSerializer.deserialize(decompressedData);

    // 验证结果
    if (!domain) {
      throw new Error('文件中未找到有效的域名信息');
    }

    if (!cookies || Object.keys(cookies).length === 0) {
      throw new Error('文件中未找到有效的Cookie数据');
    }

    return {
      domain,
      cookies,
      cookieCount: Object.keys(cookies).length,
    };
  }

  /**
   * 从Base64字符串导入Cookie数据
   * @param base64String - Base64编码的数据
   * @returns ImportResult 导入结果
   */
  importFromBase64(base64String: string): ImportResult {
    // 验证输入
    if (!base64String || typeof base64String !== 'string') {
      throw new Error('Base64数据不能为空');
    }

    // 解码Base64
    let binaryString: string;
    try {
      binaryString = atob(base64String);
    } catch (e) {
      throw new Error('无效的Base64编码');
    }

    // 转换为Uint8Array
    const compressedData = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      compressedData[i] = binaryString.charCodeAt(i);
    }

    // 解压缩数据
    const decompressedData = cookieSerializer.decompress(compressedData);

    // 反序列化数据
    const { domain, cookies } = cookieSerializer.deserialize(decompressedData);

    // 验证结果
    if (!domain) {
      throw new Error('数据中未找到有效的域名信息');
    }

    if (!cookies || Object.keys(cookies).length === 0) {
      throw new Error('数据中未找到有效的Cookie数据');
    }

    return {
      domain,
      cookies,
      cookieCount: Object.keys(cookies).length,
    };
  }

  /**
   * 验证文件
   * @param file - 文件对象
   */
  private validateFile(file: File): void {
    if (!file) {
      throw new Error('请选择要导入的文件');
    }

    // 检查文件大小
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`文件大小超过限制（最大 ${this.MAX_FILE_SIZE / 1024 / 1024}MB）`);
    }

    if (file.size === 0) {
      throw new Error('文件为空');
    }

    // 检查文件扩展名
    const fileName = file.name.toLowerCase();
    const hasValidExtension = this.SUPPORTED_EXTENSIONS.some(ext => 
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      throw new Error(`不支持的文件格式，请使用 ${this.SUPPORTED_EXTENSIONS.join(' 或 ')} 文件`);
    }
  }

  /**
   * 读取文件为ArrayBuffer
   * @param file - 文件对象
   * @returns Promise<ArrayBuffer>
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('读取文件失败'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('读取文件时发生错误'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 获取支持的文件扩展名
   * @returns string[] 支持的扩展名列表
   */
  getSupportedExtensions(): string[] {
    return [...this.SUPPORTED_EXTENSIONS];
  }

  /**
   * 获取文件选择器的accept属性值
   * @returns string accept属性值
   */
  getAcceptAttribute(): string {
    return this.SUPPORTED_EXTENSIONS.join(',');
  }
}

/**
 * 创建CookieFileImporter单例实例
 */
export const cookieFileImporter = new CookieFileImporterImpl();
