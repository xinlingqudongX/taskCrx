/**
 * P2P 连接管理器
 * 管理多个 PeerConnection 实例
 */

import { PeerConnection } from './peer-connection';

export type PeerManagerEvent = 'peer-connected' | 'peer-disconnected' | 'peer-data' | 'peer-error';

export class PeerManager {
    private peers: Map<string, PeerConnection> = new Map();
    private listeners: Map<PeerManagerEvent, Function[]> = new Map();
    private localUserId: string;
    private sendSignal: (type: 'rtc-offer' | 'rtc-answer' | 'rtc-ice', targetUserId: string, data: unknown) => void;

    constructor(
        localUserId: string,
        sendSignal: (type: 'rtc-offer' | 'rtc-answer' | 'rtc-ice', targetUserId: string, data: unknown) => void,
    ) {
        this.localUserId = localUserId;
        this.sendSignal = sendSignal;
    }

    createPeer(targetUserId: string): PeerConnection {
        if (this.peers.has(targetUserId)) {
            return this.peers.get(targetUserId)!;
        }

        const peer = new PeerConnection({
            targetUserId,
            localUserId: this.localUserId,
            initiator: true,
            onSignal: (type, data) => {
                const msgType = type === 'offer' ? 'rtc-offer' : type === 'answer' ? 'rtc-answer' : 'rtc-ice';
                this.sendSignal(msgType, targetUserId, data);
            },
        });

        this.setupPeerListeners(peer);
        this.peers.set(targetUserId, peer);
        peer.connect();

        return peer;
    }

    async handleSignal(type: 'rtc-offer' | 'rtc-answer' | 'rtc-ice', fromUserId: string, data: unknown): Promise<void> {
        if (type === 'rtc-offer') {
            let peer = this.peers.get(fromUserId);
            if (!peer) {
                peer = new PeerConnection({
                    targetUserId: fromUserId,
                    localUserId: this.localUserId,
                    initiator: false,
                    onSignal: (signalType, signalData) => {
                        const msgType = signalType === 'offer' ? 'rtc-offer' : signalType === 'answer' ? 'rtc-answer' : 'rtc-ice';
                        this.sendSignal(msgType, fromUserId, signalData);
                    },
                });
                this.setupPeerListeners(peer);
                this.peers.set(fromUserId, peer);
            }
            await peer.handleOffer(data as RTCSessionDescriptionInit);
        } else if (type === 'rtc-answer') {
            const peer = this.peers.get(fromUserId);
            if (peer) {
                await peer.handleAnswer(data as RTCSessionDescriptionInit);
            }
        } else if (type === 'rtc-ice') {
            const peer = this.peers.get(fromUserId);
            if (peer) {
                await peer.handleCandidate(data as RTCIceCandidateInit);
            }
        }
    }

    sendData(targetUserId: string, data: unknown): boolean {
        const peer = this.peers.get(targetUserId);
        if (peer?.isConnected) {
            return peer.send(data);
        }
        return false;
    }

    broadcastData(data: unknown): void {
        for (const peer of this.peers.values()) {
            if (peer.isConnected) {
                peer.send(data);
            }
        }
    }

    isPeerConnected(targetUserId: string): boolean {
        return this.peers.get(targetUserId)?.isConnected ?? false;
    }

    getConnectedPeerIds(): string[] {
        return Array.from(this.peers.entries())
            .filter(([, peer]) => peer.isConnected)
            .map(([id]) => id);
    }

    removePeer(targetUserId: string): void {
        const peer = this.peers.get(targetUserId);
        if (peer) {
            peer.close();
            this.peers.delete(targetUserId);
        }
    }

    destroy(): void {
        for (const peer of this.peers.values()) {
            peer.close();
        }
        this.peers.clear();
    }

    on(event: PeerManagerEvent, handler: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
    }

    private setupPeerListeners(peer: PeerConnection): void {
        peer.on('open', () => {
            this.emit('peer-connected', peer.targetUserId);
        });

        peer.on('close', () => {
            this.peers.delete(peer.targetUserId);
            this.emit('peer-disconnected', peer.targetUserId);
        });

        peer.on('data', (data: unknown) => {
            this.emit('peer-data', { userId: peer.targetUserId, data });
        });

        peer.on('error', (error: unknown) => {
            this.emit('peer-error', { userId: peer.targetUserId, error });
        });
    }

    private emit(event: PeerManagerEvent, data?: unknown): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`PeerManager 事件处理错误 (${event}):`, error);
                }
            }
        }
    }
}
