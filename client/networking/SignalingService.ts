import { SignalingMessage } from '../../shared/signaling-types';

export interface SignalingConfig {
  serverUrl: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}

export class SignalingService {
  private ws?: WebSocket;
  private config: SignalingConfig;
  private messageCallback: (message: SignalingMessage) => void = () => {};
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private pingInterval?: NodeJS.Timeout;

  constructor(config: SignalingConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    console.log('[WebSocketSignalingService] Attempting to connect to:', this.config.serverUrl);
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);
        
        this.ws.onopen = () => {
          console.log('[WebSocketSignalingService] WebSocket connected successfully');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          console.log('[WebSocketSignalingService] Received raw message:', event.data);
          try {
            const message = JSON.parse(event.data);
            console.log('[WebSocketSignalingService] Parsed message:', message);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocketSignalingService] Error parsing message:', error);
          }
        };
        
        this.ws.onclose = (event) => {
          console.log('[WebSocketSignalingService] WebSocket closed:', event.code, event.reason);
          this.isConnected = false;
          this.scheduleReconnect();
        };
        
        this.ws.onerror = (error) => {
          console.error('[WebSocketSignalingService] WebSocket error:', error);
        };
        
      } catch (error) {
        console.error('[WebSocketSignalingService] Connection error:', error);
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.ws) {
      this.ws.close();
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  async sendMessage(message: SignalingMessage): Promise<void> {
    console.log('[WebSocketSignalingService] sendMessage called with:', message.type, message.action);
    
    if (!this.isConnected || !this.ws) {
      console.log('[WebSocketSignalingService] Not connected, attempting to connect...');
      await this.connect();
    }

    if (!this.isConnected || !this.ws) {
      console.error('[WebSocketSignalingService] Failed to connect to signaling service');
      throw new Error('Failed to connect to signaling service');
    }

    console.log(`[WebSocketSignalingService] Sending message:`, message.type, message);
    console.log('[WebSocketSignalingService] WebSocket readyState:', this.ws.readyState);
    
    try {
      this.ws.send(JSON.stringify(message));
      console.log('[WebSocketSignalingService] Message sent successfully');
    } catch (error) {
      console.error('[WebSocketSignalingService] Error sending message:', error);
      throw error;
    }
  }


  getServerUrl(): string {
    return this.config.serverUrl;
  }

  onMessage(callback: (message: SignalingMessage) => void): void {
    this.messageCallback = callback;
  }

  private handleMessage(message: SignalingMessage): void {
    console.log(`[WebSocketSignalingService] handleMessage called with:`, message.type, message.action);
    console.log('[WebSocketSignalingService] Calling messageCallback...');
    this.messageCallback(message);
    console.log('[WebSocketSignalingService] messageCallback completed');
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval! * Math.pow(2, this.reconnectAttempts - 1);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect failed, will try again
      });
    }, delay);
  }
}