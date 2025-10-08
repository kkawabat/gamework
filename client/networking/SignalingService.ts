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
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);
        
        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocketSignalingService] Error parsing message:', error);
          }
        };
        
        this.ws.onclose = (event) => {
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
    
    if (!this.isConnected || !this.ws) {
      await this.connect();
    }

    if (!this.isConnected || !this.ws) {
      console.error('[WebSocketSignalingService] Failed to connect to signaling service');
      throw new Error('Failed to connect to signaling service');
    }

    
    try {
      this.ws.send(JSON.stringify(message));
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
    this.messageCallback(message);
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