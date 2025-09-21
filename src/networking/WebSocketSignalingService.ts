import { SignalingMessage, GameRoom } from '../types';
import { SignalingService } from './SignalingService';

export interface WebSocketSignalingConfig {
  serverUrl: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}

export class WebSocketSignalingService implements SignalingService {
  private ws: WebSocket | null = null;
  private config: WebSocketSignalingConfig;
  private messageCallbacks: ((message: SignalingMessage) => void)[] = [];
  private roomUpdateCallbacks: ((room: GameRoom) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private isConnected = false;
  private currentRoom?: string;
  private currentPlayerId?: string;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;

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
          console.log('Connected to WebSocket signaling server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            this.errorCallbacks.forEach(callback => callback(new Error('Invalid message format')));
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          this.isConnected = false;
          this.stopPing();
          
          if (!event.wasClean && this.reconnectAttempts < this.config.maxReconnectAttempts!) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.errorCallbacks.forEach(callback => callback(new Error('WebSocket connection error')));
          reject(new Error('Failed to connect to signaling server'));
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopPing();
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    console.log('Disconnected from WebSocket signaling server');
  }

  async joinRoom(roomId: string, playerId: string): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to signaling service');
    }

    this.currentRoom = roomId;
    this.currentPlayerId = playerId;

    const message = {
      type: 'join_room',
      payload: {
        roomId,
        playerId,
        playerName: `Player ${playerId.substring(0, 8)}`
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    if (!this.isConnected || !this.ws) {
      return;
    }

    const message = {
      type: 'leave_room',
      payload: {}
    };

    this.ws.send(JSON.stringify(message));

    if (this.currentRoom === roomId) {
      this.currentRoom = undefined;
      this.currentPlayerId = undefined;
    }
  }

  async sendMessage(message: SignalingMessage): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to signaling service');
    }

    const wsMessage = {
      type: 'signaling_message',
      payload: message
    };

    this.ws.send(JSON.stringify(wsMessage));
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
      case 'room_joined':
        this.handleRoomJoined(message);
        break;
      case 'room_update':
        this.handleRoomUpdate(message);
        break;
      case 'signaling_message':
        this.handleSignalingMessage(message);
        break;
      case 'error':
        this.handleError(message);
        break;
      case 'pong':
        // Handle pong response
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleRoomJoined(message: any): void {
    console.log('Joined room:', message.payload.room);
    
    if (message.payload.room) {
      // Convert the room data back to the expected format
      const room: GameRoom = {
        id: message.payload.room.id,
        name: message.payload.room.name,
        hostId: message.payload.room.hostId,
        players: new Map(message.payload.room.players.map((p: any) => [p.id, p])),
        maxPlayers: message.payload.room.maxPlayers,
        gameType: message.payload.room.gameType,
        createdAt: message.payload.room.createdAt
      };
      
      this.roomUpdateCallbacks.forEach(callback => callback(room));
    }
  }

  private handleRoomUpdate(message: any): void {
    if (message.payload.room) {
      const room: GameRoom = {
        id: message.payload.room.id,
        name: message.payload.room.name,
        hostId: message.payload.room.hostId,
        players: new Map(message.payload.room.players.map((p: any) => [p.id, p])),
        maxPlayers: message.payload.room.maxPlayers,
        gameType: message.payload.room.gameType,
        createdAt: message.payload.room.createdAt
      };
      
      this.roomUpdateCallbacks.forEach(callback => callback(room));
    }
  }

  private handleSignalingMessage(message: any): void {
    const signalingMessage: SignalingMessage = message.payload;
    this.messageCallbacks.forEach(callback => callback(signalingMessage));
  }

  private handleError(message: any): void {
    const error = new Error(message.payload.message || 'Unknown error');
    this.errorCallbacks.forEach(callback => callback(error));
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval! * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`Reconnect attempt ${this.reconnectAttempts}`);
      this.connect().catch(error => {
        console.error('Reconnect failed:', error);
        if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
          this.scheduleReconnect();
        } else {
          console.error('Max reconnect attempts reached');
          this.errorCallbacks.forEach(callback => 
            callback(new Error('Failed to reconnect to signaling server'))
          );
        }
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify({ type: 'ping', payload: {} }));
      }
    }, this.config.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  // Utility methods
  getConnectionState(): string {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'unknown';
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}




