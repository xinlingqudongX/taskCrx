/**
 * 共享常量定义
 */

/** WebSocket 连接默认配置 */
export const WS_CONFIG = {
    DEFAULT_PORT: 8787,
    HEARTBEAT_INTERVAL: 30_000,
    RECONNECT_INTERVAL: 5_000,
    MAX_RECONNECT_ATTEMPTS: 10,
    CONNECTION_TIMEOUT: 10_000,
} as const;

/** 房间配置 */
export const ROOM_CONFIG = {
    MAX_USERS_PER_ROOM: 50,
    MAX_COOKIE_SIZE: 1024 * 1024, // 1MB
    ROOM_ID_PATTERN: /^[a-zA-Z0-9_-]{3,64}$/,
    USER_ID_PATTERN: /^[a-zA-Z0-9_-]{1,64}$/,
} as const;

/** 错误码 */
export const ERROR_CODES = {
    AUTH_FAILED: 'AUTH_FAILED',
    ROOM_FULL: 'ROOM_FULL',
    INVALID_MESSAGE: 'INVALID_MESSAGE',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    COOKIE_TOO_LARGE: 'COOKIE_TOO_LARGE',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** API 路径 */
export const ROUTES = {
    WEBSOCKET: '/ws',
    HEALTH: '/health',
    API_PREFIX: '/api',
} as const;
