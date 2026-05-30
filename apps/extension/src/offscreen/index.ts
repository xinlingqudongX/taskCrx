/**
 * Offscreen 文档 — 在 DOM 上下文中运行 WebRTC
 * Service Worker 没有 RTCPeerConnection，通过此文档代理 P2P 连接
 */

import { PeerManager } from '../websocket/peer-manager';
import type { CookieData } from '@team-session/shared';

let peerManager: PeerManager | null = null;

/** 向 Service Worker 发送消息 */
function notifySW(type: string, data?: unknown): void {
    chrome.runtime.sendMessage({ type, target: 'sw', data });
}

/** 初始化 PeerManager */
function initPeerManager(myUserId: string, sendSignal: (type: string, targetUserId: string, data: unknown) => void): void {
    if (peerManager) {
        peerManager.destroy();
    }

    peerManager = new PeerManager(myUserId, sendSignal as any);

    peerManager.on('peer-connected', (userId: string) => {
        notifySW('offscreen:peer-connected', userId);
    });

    peerManager.on('peer-disconnected', (userId: string) => {
        notifySW('offscreen:peer-disconnected', userId);
    });

    peerManager.on('peer-data', (payload: { userId: string; data: unknown }) => {
        notifySW('offscreen:peer-data', payload);
    });

    peerManager.on('peer-error', (payload: { userId: string; error: unknown }) => {
        console.warn('P2P 错误:', payload.userId, payload.error);
        notifySW('offscreen:peer-error', payload);
    });
}

/** 监听 Service Worker 消息 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.target !== 'offscreen') return;

    switch (msg.type) {
        case 'offscreen:init': {
            const { myUserId } = msg.data;
            initPeerManager(myUserId, (type, targetUserId, signalData) => {
                notifySW('offscreen:signal', { type, targetUserId, signalData });
            });
            sendResponse({ ok: true });
            break;
        }

        case 'offscreen:create-peer': {
            const { targetUserId } = msg.data;
            if (peerManager) {
                peerManager.createPeer(targetUserId);
            }
            sendResponse({ ok: true });
            break;
        }

        case 'offscreen:handle-signal': {
            const { signalType, fromUserId, signalData } = msg.data;
            if (peerManager) {
                peerManager.handleSignal(signalType, fromUserId, signalData);
            }
            sendResponse({ ok: true });
            break;
        }

        case 'offscreen:broadcast': {
            if (peerManager) {
                peerManager.broadcastData(msg.data);
            }
            sendResponse({ ok: true });
            break;
        }

        case 'offscreen:send': {
            const { targetUserId, data } = msg.data;
            const sent = peerManager?.sendData(targetUserId, data) ?? false;
            sendResponse({ ok: sent });
            break;
        }

        case 'offscreen:destroy': {
            if (peerManager) {
                peerManager.destroy();
                peerManager = null;
            }
            sendResponse({ ok: true });
            break;
        }

        default:
            break;
    }

    return true; // 保持 sendResponse 异步有效
});
