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
  private connectionStartTime?: number;
  private lastError?: Error;

  constructor(config: WebSocketSignalingConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      pingInterval: 30000,
      ...config
    };
    
    // Log environment and configuration details
    this.logDiagnosticInfo();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.connectionStartTime = Date.now();
        console.log(`[WebSocket] Attempting to connect to: ${this.config.serverUrl}`);
        console.log(`[WebSocket] Connection attempt #${this.reconnectAttempts + 1}`);
        console.log(`[WebSocket] Current time: ${new Date().toISOString()}`);
        
        // Pre-connection CORS and security checks
        this.performPreConnectionChecks();
        
        // Log WebSocket support
        if (typeof WebSocket === 'undefined') {
          const error = new Error('WebSocket is not supported in this environment');
          console.error('[WebSocket] ERROR:', error.message);
          reject(error);
          return;
        }
        
        this.ws = new WebSocket(this.config.serverUrl);
        
        // Add debugging for WebSocket state changes
        console.log(`[WebSocket] WebSocket created, initial readyState: ${this.ws.readyState}`);
        
        // Monitor readyState changes
        const checkReadyState = () => {
          console.log(`[WebSocket] ReadyState changed to: ${this.ws?.readyState} (${this.getReadyStateName(this.ws?.readyState)})`);
        };
        
        // Check readyState periodically during connection
        const readyStateInterval = setInterval(() => {
          if (this.ws) {
            checkReadyState();
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CLOSED) {
              clearInterval(readyStateInterval);
            }
          }
        }, 50);
        
        this.ws.onopen = () => {
          const connectionTime = Date.now() - this.connectionStartTime!;
          console.log(`[WebSocket] ✅ Connected successfully in ${connectionTime}ms`);
          console.log(`[WebSocket] Server URL: ${this.config.serverUrl}`);
          console.log(`[WebSocket] Protocol: ${this.ws?.protocol || 'none'}`);
          console.log(`[WebSocket] Ready state: ${this.getConnectionState()}`);
          console.log(`[WebSocket] WebSocket object:`, this.ws);
          console.log(`[WebSocket] WebSocket readyState: ${this.ws?.readyState}`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastError = undefined;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log(`[WebSocket] 📨 Received message:`, message.type, message.payload);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocket] ❌ Error parsing message:', error);
            console.error('[WebSocket] Raw message data:', event.data);
            this.errorCallbacks.forEach(callback => callback(new Error('Invalid message format')));
          }
        };

        this.ws.onclose = (event) => {
          const connectionDuration = this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
          console.log(`[WebSocket] 🔌 Connection closed after ${connectionDuration}ms`);
          console.log(`[WebSocket] Close code: ${event.code}`);
          console.log(`[WebSocket] Close reason: ${event.reason || 'No reason provided'}`);
          console.log(`[WebSocket] Was clean: ${event.wasClean}`);
          console.log(`[WebSocket] Reconnect attempts: ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
          
          this.isConnected = false;
          this.stopPing();
          
          if (!event.wasClean && this.reconnectAttempts < this.config.maxReconnectAttempts!) {
            console.log(`[WebSocket] 🔄 Scheduling reconnect...`);
            this.scheduleReconnect();
          } else if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
            console.error(`[WebSocket] ❌ Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
          }
        };

        this.ws.onerror = (error) => {
          const connectionTime = this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
          console.error(`[WebSocket] ❌ Connection error after ${connectionTime}ms`);
          console.error('[WebSocket] Error event:', error);
          console.error('[WebSocket] Error type:', error.type);
          console.error('[WebSocket] Target:', error.target);
          console.error('[WebSocket] Current target:', error.currentTarget);
          
          // Enhanced error logging for CORS and security issues
          console.error('[WebSocket] ERROR ANALYSIS:');
          console.error('[WebSocket] Error type:', error.type);
          console.error('[WebSocket] ReadyState:', this.ws?.readyState);
          console.error('[WebSocket] URL:', this.ws?.url);
          
          // Check for CORS-related issues
          if (typeof window !== 'undefined') {
            const currentOrigin = window.location.origin;
            const targetOrigin = new URL(this.config.serverUrl).origin;
            const isCrossOrigin = currentOrigin !== targetOrigin;
            
            console.error('[WebSocket] CORS CHECK:');
            console.error('[WebSocket] Current origin:', currentOrigin);
            console.error('[WebSocket] Target origin:', targetOrigin);
            console.error('[WebSocket] Is cross-origin:', isCrossOrigin);
            
            if (isCrossOrigin) {
              console.error('[WebSocket] ❌ CORS ISSUE: Server must allow origin:', currentOrigin);
            }
            
            // Check for mixed content issues
            const isHttps = window.location.protocol === 'https:';
            const isWss = this.config.serverUrl.startsWith('wss:');
            console.error('[WebSocket] PROTOCOL CHECK:');
            console.error('[WebSocket] Page protocol:', window.location.protocol);
            console.error('[WebSocket] WS protocol:', isWss ? 'wss' : 'ws');
            console.error('[WebSocket] Security match:', isHttps === isWss);
            
            if (isHttps && !isWss) {
              console.error('[WebSocket] ❌ MIXED CONTENT: HTTPS page cannot connect to WS');
            }
          }
          
          this.lastError = new Error('WebSocket connection error');
          this.errorCallbacks.forEach(callback => callback(this.lastError!));
          
          // Don't reject immediately - let the connection attempt complete
          // The onclose handler will handle the actual connection failure
        };

      } catch (error) {
        console.error('[WebSocket] ❌ Exception during connection setup:', error);
        reject(error);
      }
    });
  }

  disconnect(): void {
    console.log('[WebSocket] 🔌 Initiating disconnect...');
    this.stopPing();
    this.clearReconnectTimer();
    
    if (this.ws) {
      console.log('[WebSocket] Closing WebSocket connection...');
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    console.log('[WebSocket] ✅ Disconnected from WebSocket signaling server');
  }

  async joinRoom(roomId: string, playerId: string): Promise<void> {
    console.log(`[WebSocket] 🚪 Attempting to join room: ${roomId} as player: ${playerId}`);
    console.log(`[WebSocket] Connection status: isConnected=${this.isConnected}, ws=${!!this.ws}`);
    console.log(`[WebSocket] WebSocket readyState: ${this.ws?.readyState}`);
    
    if (!this.isConnected || !this.ws) {
      console.error('[WebSocket] ❌ Cannot join room - not connected to signaling service');
      throw new Error('Not connected to signaling service');
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error(`[WebSocket] ❌ Cannot join room - WebSocket not open (readyState: ${this.ws.readyState})`);
      throw new Error('WebSocket not open');
    }

    console.log(`[WebSocket] 🚪 Joining room: ${roomId} as player: ${playerId}`);
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

    console.log('[WebSocket] 📤 Sending join room message:', message);
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
    
    console.log(`[WebSocket] 🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`);
    console.log(`[WebSocket] Last error:`, this.lastError?.message || 'None');
    console.log(`[WebSocket] Current time: ${new Date().toISOString()}`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`[WebSocket] 🔄 Executing reconnect attempt ${this.reconnectAttempts}`);
      this.connect().catch(error => {
        console.error(`[WebSocket] ❌ Reconnect attempt ${this.reconnectAttempts} failed:`, error);
        console.error(`[WebSocket] Error details:`, {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        
        if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
          console.log(`[WebSocket] 🔄 Will retry (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
          this.scheduleReconnect();
        } else {
          console.error(`[WebSocket] ❌ Max reconnect attempts (${this.config.maxReconnectAttempts}) reached - giving up`);
          this.errorCallbacks.forEach(callback => 
            callback(new Error('Failed to reconnect to signaling server after maximum attempts'))
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
    console.log(`[WebSocket] 🏓 Starting ping interval: ${this.config.pingInterval}ms`);
    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        console.log('[WebSocket] 🏓 Sending ping...');
        this.ws.send(JSON.stringify({ type: 'ping', payload: {} }));
      }
    }, this.config.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      console.log('[WebSocket] 🏓 Stopping ping interval');
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

  private getReadyStateName(readyState?: number): string {
    if (readyState === undefined) return 'undefined';
    switch (readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  // Diagnostic logging methods
  private logDiagnosticInfo(): void {
    console.log('[WebSocket] 🔍 DIAGNOSTIC INFORMATION');
    console.log('[WebSocket] ======================================');
    console.log('[WebSocket] Configuration:', {
      serverUrl: this.config.serverUrl,
      reconnectInterval: this.config.reconnectInterval,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      pingInterval: this.config.pingInterval
    });
    
    // Browser/Environment info
    if (typeof window !== 'undefined') {
      console.log('[WebSocket] Browser Info:', {
        userAgent: navigator.userAgent,
        location: window.location.href,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        port: window.location.port
      });
      
      // Check for proxy indicators
      const isHttps = window.location.protocol === 'https:';
      const isWss = this.config.serverUrl.startsWith('wss:');
      console.log('[WebSocket] Protocol Check:', {
        pageProtocol: window.location.protocol,
        wsProtocol: isWss ? 'wss' : 'ws',
        protocolMatch: (isHttps && isWss) || (!isHttps && !isWss),
        mixedContentWarning: isHttps && !isWss ? '⚠️ HTTPS page trying to connect to WS (insecure)' : 'OK'
      });
    }
    
    // WebSocket support check
    console.log('[WebSocket] WebSocket Support:', {
      supported: typeof WebSocket !== 'undefined',
      constructor: typeof WebSocket !== 'undefined' ? WebSocket.name : 'undefined'
    });
    
    // Network connectivity hints
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      console.log('[WebSocket] Network Status:', {
        online: navigator.onLine,
        connectionType: (navigator as any).connection?.effectiveType || 'unknown'
      });
    }
    
    console.log('[WebSocket] ======================================');
  }

  // Enhanced diagnostic method for troubleshooting
  getDiagnosticInfo(): any {
    return {
      config: this.config,
      connectionState: this.getConnectionState(),
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError?.message || null,
      currentRoom: this.currentRoom,
      currentPlayerId: this.currentPlayerId,
      connectionStartTime: this.connectionStartTime,
      connectionDuration: this.connectionStartTime ? Date.now() - this.connectionStartTime : null,
      wsReadyState: this.ws?.readyState,
      wsUrl: this.ws?.url,
      wsProtocol: this.ws?.protocol,
      environment: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        location: typeof window !== 'undefined' ? window.location.href : 'N/A',
        online: typeof navigator !== 'undefined' ? navigator.onLine : 'N/A',
        websocketSupported: typeof WebSocket !== 'undefined'
      }
    };
  }

  // Method to log current diagnostic info
  logCurrentDiagnostics(): void {
    console.log('[WebSocket] 🔍 CURRENT DIAGNOSTIC INFO');
    console.log('[WebSocket] ======================================');
    console.log('[WebSocket]', JSON.stringify(this.getDiagnosticInfo(), null, 2));
    console.log('[WebSocket] ======================================');
  }

  // Pre-connection security and CORS checks
  private performPreConnectionChecks(): void {
    console.log('[WebSocket] PRE-CONNECTION CHECKS:');
    
    if (typeof window !== 'undefined') {
      // CORS analysis
      const currentOrigin = window.location.origin;
      const targetUrl = new URL(this.config.serverUrl);
      const targetOrigin = targetUrl.origin;
      const isCrossOrigin = currentOrigin !== targetOrigin;
      
      console.log('[WebSocket] CORS: Current origin:', currentOrigin);
      console.log('[WebSocket] CORS: Target origin:', targetOrigin);
      console.log('[WebSocket] CORS: Is cross-origin:', isCrossOrigin);
      
      if (isCrossOrigin) {
        console.warn('[WebSocket] ⚠️ CROSS-ORIGIN CONNECTION DETECTED');
        console.warn('[WebSocket] Server must allow origin:', currentOrigin);
      }
      
      // Protocol security check
      const isHttps = window.location.protocol === 'https:';
      const isWss = this.config.serverUrl.startsWith('wss:');
      console.log('[WebSocket] PROTOCOL: Page:', window.location.protocol, 'WS:', isWss ? 'wss' : 'ws');
      console.log('[WebSocket] PROTOCOL: Security match:', isHttps === isWss);
      
      if (isHttps && !isWss) {
        console.error('[WebSocket] ❌ MIXED CONTENT: HTTPS page cannot connect to WS');
      }
    }
    
    console.log('[WebSocket] PRE-CONNECTION CHECKS COMPLETE');
  }

  // Static method to test WebSocket connectivity
  static async testConnection(url: string): Promise<{ success: boolean; error?: string; details?: any }> {
    return new Promise((resolve) => {
      console.log(`[WebSocket] 🧪 Testing connection to: ${url}`);
      
      try {
        const testWs = new WebSocket(url);
        const startTime = Date.now();
        
        const timeout = setTimeout(() => {
          testWs.close();
          resolve({
            success: false,
            error: 'Connection timeout after 10 seconds',
            details: { url, timeout: 10000 }
          });
        }, 10000);
        
        testWs.onopen = () => {
          const connectionTime = Date.now() - startTime;
          clearTimeout(timeout);
          testWs.close();
          resolve({
            success: true,
            details: {
              url,
              connectionTime,
              protocol: testWs.protocol,
              readyState: testWs.readyState
            }
          });
        };
        
        testWs.onerror = (error) => {
          clearTimeout(timeout);
          testWs.close();
          resolve({
            success: false,
            error: 'WebSocket connection failed',
            details: {
              url,
              error: error.type,
              readyState: testWs.readyState
            }
          });
        };
        
        testWs.onclose = (event) => {
          clearTimeout(timeout);
          if (!testWs.onopen) {
            resolve({
              success: false,
              error: `Connection closed with code ${event.code}`,
              details: {
                url,
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
              }
            });
          }
        };
        
      } catch (error) {
        resolve({
          success: false,
          error: `Exception during connection: ${error}`,
          details: { url, exception: error }
        });
      }
    });
  }
}




