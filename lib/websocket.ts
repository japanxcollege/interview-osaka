/**
 * WebSocketクライアント
 * リアルタイム通信を管理
 */

import { WebSocketMessage } from '@/types';

export type ConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' | 'RECONNECTING' | 'OFFLINE';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // 2秒
  private sessionId: string;
  private onMessageCallback: (message: WebSocketMessage) => void;
  private onStateChangeCallback?: (state: ConnectionState) => void;

  private listeners: ((message: any) => void)[] = [];

  constructor(
    sessionId: string,
    onMessage: (message: WebSocketMessage) => void,
    onStateChange?: (state: ConnectionState) => void
  ) {
    this.sessionId = sessionId;
    this.onMessageCallback = onMessage;
    this.onStateChangeCallback = onStateChange;
  }

  addListener(callback: (message: any) => void) {
    this.listeners.push(callback);
  }

  removeListener(callback: (message: any) => void) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  connect() {
    this.updateState('CONNECTING');

    // WebSocket URLを環境変数から取得（wss:// または ws://）
    const wsUrlBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8005';
    const wsUrl = `${wsUrlBase}/ws/${this.sessionId}`;
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateState('OPEN');
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('📨 WebSocket message:', message);
        this.onMessageCallback(message);

        // Notify additional listeners
        this.listeners.forEach(listener => listener(message));
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('❌ WebSocket closed:', event.code, event.reason);
      this.updateState('CLOSED');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // onerror alone doesn't mean close, but usually close follows.
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;

      console.log(
        `🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      this.updateState('RECONNECTING');

      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.updateState('OFFLINE');
    }
  }

  private updateState(state: ConnectionState) {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
  }

  send(type: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, data });
      this.ws.send(message);
      console.log('📤 Sent:', { type, data });
    } else {
      console.warn('WebSocket is not open. Current state:', this.ws?.readyState);
    }
  }

  disconnect() {
    if (this.ws) {
      this.updateState('CLOSING');
      this.ws.close();
      this.ws = null;
      this.updateState('CLOSED');
      console.log('👋 WebSocket disconnected');
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
