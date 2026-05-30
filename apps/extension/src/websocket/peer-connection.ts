/**
 * WebRTC 对等连接封装
 * 管理与单个 peer 的 RTCPeerConnection 和 DataChannel
 */

import { P2P_CONFIG } from '@team-session/shared';

export type PeerConnectionEvent = 'open' | 'close' | 'data' | 'error';

export interface PeerConnectionConfig {
    targetUserId: string;
    localUserId: string;
    initiator: boolean;
    onSignal: (type: 'offer' | 'answer' | 'candidate', data: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
}

export class PeerConnection {
    private pc: RTCPeerConnection | null = null;
    private dc: RTCDataChannel | null = null;
    private config: PeerConnectionConfig;
    private listeners: Map<PeerConnectionEvent, Function[]> = new Map();
    private timeoutTimer: number | null = null;
    private _isConnected = false;

    constructor(config: PeerConnectionConfig) {
        this.config = config;
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    get targetUserId(): string {
        return this.config.targetUserId;
    }

    async connect(): Promise<void> {
        if (typeof RTCPeerConnection === 'undefined') {
            this.emit('error', new Error('当前环境不支持 WebRTC（Service Worker 无 RTCPeerConnection）'));
            return;
        }
        try {
            this.pc = new RTCPeerConnection({
                iceServers: P2P_CONFIG.ICE_SERVERS,
            });

            this.pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.config.onSignal('candidate', event.candidate.toJSON());
                }
            };

            this.pc.onconnectionstatechange = () => {
                if (this.pc?.connectionState === 'connected') {
                    this._isConnected = true;
                    this.clearTimeout();
                    this.emit('open');
                } else if (this.pc?.connectionState === 'failed' || this.pc?.connectionState === 'disconnected') {
                    this.handleClose();
                }
            };

            if (this.config.initiator) {
                this.dc = this.pc.createDataChannel(P2P_CONFIG.DATA_CHANNEL_NAME);
                this.setupDataChannel(this.dc);

                const offer = await this.pc.createOffer();
                await this.pc.setLocalDescription(offer);
                this.config.onSignal('offer', offer);
            } else {
                this.pc.ondatachannel = (event) => {
                    this.dc = event.channel;
                    this.setupDataChannel(this.dc);
                };
            }

            this.startTimeout();
        } catch (error) {
            this.emit('error', error);
            this.close();
        }
    }

    async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.pc) {
            await this.connect();
        }
        try {
            await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.pc!.createAnswer();
            await this.pc!.setLocalDescription(answer);
            this.config.onSignal('answer', answer);
        } catch (error) {
            this.emit('error', error);
        }
    }

    async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.pc) return;
        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            this.emit('error', error);
        }
    }

    async handleCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.pc) return;
        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            this.emit('error', error);
        }
    }

    send(data: unknown): boolean {
        if (!this.dc || this.dc.readyState !== 'open') {
            return false;
        }
        try {
            this.dc.send(JSON.stringify(data));
            return true;
        } catch {
            return false;
        }
    }

    close(): void {
        this.clearTimeout();
        this._isConnected = false;

        if (this.dc) {
            this.dc.close();
            this.dc = null;
        }
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        this.emit('close');
    }

    on(event: PeerConnectionEvent, handler: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
    }

    private setupDataChannel(dc: RTCDataChannel): void {
        dc.onopen = () => {
            this._isConnected = true;
            this.clearTimeout();
            this.emit('open');
        };

        dc.onclose = () => {
            this.handleClose();
        };

        dc.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit('data', data);
            } catch {
                this.emit('data', event.data);
            }
        };

        dc.onerror = (event) => {
            this.emit('error', event);
        };
    }

    private handleClose(): void {
        this._isConnected = false;
        this.clearTimeout();
        this.emit('close');
    }

    private startTimeout(): void {
        this.clearTimeout();
        this.timeoutTimer = setTimeout(() => {
            if (!this._isConnected) {
                this.emit('error', new Error('P2P 连接超时'));
                this.close();
            }
        }, P2P_CONFIG.CONNECTION_TIMEOUT) as unknown as number;
    }

    private clearTimeout(): void {
        if (this.timeoutTimer !== null) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
    }

    private emit(event: PeerConnectionEvent, data?: unknown): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`PeerConnection 事件处理错误 (${event}):`, error);
                }
            }
        }
    }
}
