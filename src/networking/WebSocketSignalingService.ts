import { SignalingMessage, GameRoom } from '../types';

export interface WebSocketSignalingConfig {
  serverUrl: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}

export class WebSocketSignalingService {
  private ws?: WebSocket;
  private config: WebSocketSignalingConfig;
  private messageCallbacks: ((message: SignalingMessage) => void)[] = [];
  private roomUpdateCallbacks: ((room: GameRoom) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private isConnected = false;
  private currentRoom?: string;
  private currentPlayerId?: string;
  private reconnectAttempts = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private pingInterval?: NodeJS.Timeout;

  constructor(config: WebSocketSignalingConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      pingInterval: 30000,
      ...config
    };
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
        
        this.ws.onerror = (error) => {
          this.errorCallbacks.forEach(callback => callback(new Error('WebSocket connection failed')));
          reject(error);
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

  async joinRoom(roomId: string, playerId: string): Promise<void> {
    this.currentRoom = roomId;
    this.currentPlayerId = playerId;
    
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({
        type: 'join_room',
        payload: { roomId, playerId }
      }));
    }
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({
        type: 'leave_room',
        payload: { roomId, playerId }
      }));
    }
    
    this.currentRoom = undefined;
    this.currentPlayerId = undefined;
  }

  async sendMessage(message: SignalingMessage): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to signaling service');
    }

    this.ws.send(JSON.stringify({
      type: 'signaling_message',
      payload: message
    }));
  }

  async handleSignalingMessage(message: SignalingMessage, webrtcManager: any, playerId: string): Promise<void> {
    switch (message.type) {
      case 'offer':
        const answer = await webrtcManager.handleOffer(message.from, message.payload);
        await this.sendMessage({
          type: 'answer',
          payload: answer,
          from: playerId,
          to: message.from,
          roomId: message.roomId
        });
        break;
        
      case 'answer':
        await webrtcManager.handleAnswer(message.from, message.payload);
        break;
        
      case 'ice_candidate':
        await webrtcManager.handleIceCandidate(message.from, message.payload);
        break;
    }
  }

  onMessage(callback: (message: SignalingMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onRoomUpdate(callback: (room: GameRoom) => void): void {
    this.roomUpdateCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'signaling_message':
        const signalingMessage: SignalingMessage = message.payload;
        this.messageCallbacks.forEach(callback => callback(signalingMessage));
        break;
      case 'room_update':
        const room: GameRoom = message.payload;
        this.roomUpdateCallbacks.forEach(callback => callback(room));
        break;
      case 'error':
        const error = new Error(message.payload.message || 'Unknown error');
        this.errorCallbacks.forEach(callback => callback(error));
        break;
    }
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