import { CookieCollector, FullCookie } from '../types/index';

/**
 * CookieCollector实现类
 * 负责从Chrome API收集特定域名的Cookie数据
 */
export class CookieCollectorImpl implements CookieCollector {
  /**
   * 收集指定域名及其所有子域名的Cookie（完整属性）
   * 例如：分享 console.aws.amazon.com 时，也会收集 ap-southeast-1.console.aws.amazon.com 的 cookie
   * @param domain - 域名
   * @returns Promise<FullCookie[]> 完整Cookie数组
   * @throws Error 当权限不足或API调用失败时抛出错误
   */
  async collectCookies(domain: string): Promise<FullCookie[]> {
    try {
      // 验证域名格式
      if (!domain || typeof domain !== 'string') {
        throw new Error('域名必须是非空字符串');
      }

      // 规范化域名（移除协议前缀和路径）
      const normalizedDomain = this.normalizeDomain(domain);

      // 获取所有 cookies，然后过滤出与目标域名相关的
      const allCookies = await chrome.cookies.getAll({});

      // 过滤出与目标域名相关的 cookies（包括子域名）
      const relatedCookies = allCookies.filter(cookie => {
        return this.isDomainRelated(cookie.domain, normalizedDomain);
      });

      // 将Chrome Cookie转换为FullCookie格式
      const fullCookies: FullCookie[] = relatedCookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expirationDate: cookie.expirationDate,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite as FullCookie['sameSite'],
        hostOnly: cookie.hostOnly,
        session: cookie.session,
        storeId: cookie.storeId,
      }));

      // 记录收集到的域名信息
      const uniqueDomains = [...new Set(fullCookies.map(c => c.domain))];
      if (uniqueDomains.length > 1) {
        console.log(`收集到 ${fullCookies.length} 个Cookie，来自以下域名:`, uniqueDomains);
      }

      return fullCookies;
    } catch (error) {
      // 处理权限错误
      if (error instanceof Error) {
        if (error.message.includes('Permission denied')) {
          throw new Error(`无法访问域名 ${domain} 的Cookie：权限不足`);
        }
        throw error;
      }
      throw new Error(`收集Cookie失败: ${String(error)}`);
    }
  }

  /**
   * 判断 cookie 域名是否与目标域名相关
   * @param cookieDomain - cookie 的域名（可能带有前导点，如 .example.com）
   * @param targetDomain - 目标域名
   * @returns boolean 是否相关
   */
  private isDomainRelated(cookieDomain: string, targetDomain: string): boolean {
    // 移除前导点进行比较
    const cleanCookieDomain = cookieDomain.startsWith('.') 
      ? cookieDomain.substring(1) 
      : cookieDomain;
    const cleanTargetDomain = targetDomain.startsWith('.') 
      ? targetDomain.substring(1) 
      : targetDomain;

    // 情况1: 完全匹配
    if (cleanCookieDomain === cleanTargetDomain) {
      return true;
    }

    // 情况2: cookie 域名是目标域名的子域名
    // 例如: ap-southeast-1.console.aws.amazon.com 包含 console.aws.amazon.com
    if (cleanCookieDomain.endsWith('.' + cleanTargetDomain)) {
      return true;
    }

    // 情况3: 目标域名是 cookie 域名的子域名
    // 例如: 分享 ap-southeast-1.console.aws.amazon.com 时也匹配 .console.aws.amazon.com 的 cookie
    if (cleanTargetDomain.endsWith('.' + cleanCookieDomain)) {
      return true;
    }

    return false;
  }

  /**
   * 收集指定域名的Cookie键值对（简化版）
   * @param domain - 域名
   * @returns Promise<Record<string, string>> Cookie键值对
   */
  async collectCookiesSimple(domain: string): Promise<Record<string, string>> {
    const cookies = await this.collectCookies(domain);
    const cookieMap: Record<string, string> = {};
    for (const cookie of cookies) {
      cookieMap[cookie.name] = cookie.value;
    }
    return cookieMap;
  }

  /**
   * 检查域名是否有Cookie
   * @param domain - 域名
   * @returns Promise<boolean> 如果有Cookie返回true，否则返回false
   */
  async hasCookies(domain: string): Promise<boolean> {
    try {
      const cookies = await this.collectCookies(domain);
      return cookies.length > 0;
    } catch (error) {
      // 如果发生错误，认为没有Cookie
      console.warn(`检查Cookie时出错: ${String(error)}`);
      return false;
    }
  }

  /**
   * 规范化域名
   * 移除协议前缀（http://、https://）和路径
   * @param domain - 原始域名
   * @returns string 规范化后的域名
   */
  private normalizeDomain(domain: string): string {
    // 移除协议前缀
    let normalized = domain.replace(/^(https?:\/\/)/, '');

    // 移除路径和查询参数
    normalized = normalized.split('/')[0];

    // 移除端口号
    normalized = normalized.split(':')[0];

    // 转换为小写
    normalized = normalized.toLowerCase();

    return normalized;
  }
}

/**
 * 创建CookieCollector单例实例
 */
export const cookieCollector = new CookieCollectorImpl();
