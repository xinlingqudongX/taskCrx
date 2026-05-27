/**
 * WebSocket 连接鉴权中间件
 * 从 URL 查询参数中提取 token 并验证
 */

export interface AuthResult {
    valid: boolean;
    userId?: string;
    error?: string;
}

export function authenticate(request: Request, secret: string): AuthResult {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const userId = url.searchParams.get('userId');

    if (!token || !userId) {
        return { valid: false, error: '缺少 token 或 userId 参数' };
    }

    try {
        // 简单 token 验证: base64(userId:timestamp:signature)
        const decoded = atob(token);
        const parts = decoded.split(':');

        if (parts.length !== 3) {
            return { valid: false, error: 'token 格式无效' };
        }

        const [tokenUserId, timestamp, signature] = parts;

        // 检查 userId 是否匹配
        if (tokenUserId !== userId) {
            return { valid: false, error: 'userId 不匹配' };
        }

        // 检查是否过期（24小时）
        const tokenTime = parseInt(timestamp, 10);
        if (Date.now() - tokenTime > 24 * 60 * 60 * 1000) {
            return { valid: false, error: 'token 已过期' };
        }

        // 验证签名
        const expectedSignature = simpleHash(`${userId}:${timestamp}:${secret}`);
        if (signature !== expectedSignature) {
            return { valid: false, error: 'token 签名无效' };
        }

        return { valid: true, userId: tokenUserId };
    } catch {
        return { valid: false, error: 'token 解析失败' };
    }
}

/**
 * 生成认证 token
 */
export function generateToken(userId: string, secret: string): string {
    const timestamp = Date.now().toString();
    const signature = simpleHash(`${userId}:${timestamp}:${secret}`);
    return btoa(`${userId}:${timestamp}:${signature}`);
}

function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
