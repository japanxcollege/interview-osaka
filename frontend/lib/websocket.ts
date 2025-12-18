/**
 * WebSocketクライアント
 * リアルタイム通信を管理
 */

import { WebSocketMessage } from '@/types';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // 2秒
  private sessionId: string;
  private onMessageCallback: (message: WebSocketMessage) => void;

  constructor(sessionId: string, onMessage: (message: WebSocketMessage) => void) {
    this.sessionId = sessionId;
    this.onMessageCallback = onMessage;
  }

  connect() {
    // WebSocket URLを環境変数から取得（wss:// または ws://）
    const wsUrlBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8005';
    const wsUrl = `${wsUrlBase}/ws/${this.sessionId}`;
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('📨 WebSocket message:', message);
        this.onMessageCallback(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('❌ WebSocket closed:', event.code, event.reason);
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;

      console.log(
        `🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
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
      this.ws.close();
      this.ws = null;
      console.log('👋 WebSocket disconnected');
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
