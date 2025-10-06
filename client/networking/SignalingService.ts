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
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        };
        
        this.ws.onclose = () => {
          this.isConnected = false;
          this.scheduleReconnect();
        };
        
      } catch (error) {
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
      throw new Error('Not connected to signaling service');
    }

    console.log(`[WebSocketSignalingService] Sending message:`, message.type, message);
    
    // For peer-to-peer signaling messages, use signaling_message
    this.ws.send(JSON.stringify(message));
  }


  getServerUrl(): string {
    return this.config.serverUrl;
  }

  onMessage(callback: (message: SignalingMessage) => void): void {
    this.messageCallback = callback;
  }

  private handleMessage(message: SignalingMessage): void {
    console.log(`[WebSocketSignalingService] Received message:`, message.type, message);
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