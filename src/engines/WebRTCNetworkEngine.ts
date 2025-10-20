/**
 * WebRTCNetworkEngine - Concrete WebRTC implementation for GameWork v2
 * 
 * Provides full multiplayer networking with:
 * - WebRTC peer-to-peer connections
 * - Signaling server communication
 * - Room management
 * - Real-time message broadcasting
 */

import { BaseNetworkEngine } from './NetworkEngine';
import { NetworkMessage, GameRoom, Player } from '../types/GameTypes';
import { 
  ConnectionState, 
  ICEConnectionState, 
  DataChannelState, 
  PeerConnection,
  NetworkConfig,
  DataChannelConfig,
  SignalingMessage,
  createOfferMessage,
  createAnswerMessage,
  createICECandidateMessage,
  createRoomUpdateMessage
} from '../types/NetworkTypes';

export interface WebRTCNetworkEngineConfig extends NetworkConfig {
  signalingServerUrl: string;
  roomCodeLength: number;
  maxRetries: number;
  retryDelay: number;
}

export class WebRTCNetworkEngine extends BaseNetworkEngine {
  private signalingSocket: WebSocket | null = null;
  private currentRoom: GameRoom | null = null;
  private playerId: string;
  private isHost: boolean = false;
  private networkConfig: WebRTCNetworkEngineConfig;
  private reconnectAttempts: number = 0;
  private roomCode: string = '';

  constructor(config: WebRTCNetworkEngineConfig, dataChannelConfig: DataChannelConfig, playerId: string) {
    super(config, dataChannelConfig);
    this.networkConfig = config;
    this.playerId = playerId;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    await this.connectToSignalingServer();
    this.isInitialized = true;
  }

  async connect(peerId: string): Promise<void> {
    if (this.connections.has(peerId)) {
      console.warn(`[WebRTCNetworkEngine] Already connected to ${peerId}`);
      return;
    }

    const peerConnection = this.createPeerConnection(peerId, this.isHost);
    this.setupConnectionHandlers(peerConnection);

    if (this.isHost) {
      // Host creates data channel and offer
      const dataChannel = peerConnection.connection.createDataChannel(
        'gamework',
        this.dataChannelConfig
      );
      peerConnection.dataChannel = dataChannel;
      this.setupDataChannelHandlers(peerConnection, dataChannel);

      const offer = await peerConnection.connection.createOffer();
      await peerConnection.connection.setLocalDescription(offer);
      
      const offerMessage = createOfferMessage(this.playerId, peerId, offer);
      this.sendSignalingMessage(offerMessage);
    }
  }

  disconnect(peerId: string): void {
    this.cleanupConnection(peerId);
  }

  sendMessage(peerId: string, message: NetworkMessage): void {
    const connection = this.connections.get(peerId);
    if (!connection) {
      console.warn(`[WebRTCNetworkEngine] No connection to ${peerId}`);
      return;
    }

    this.sendDataChannelMessage(connection, message);
  }

  broadcast(message: NetworkMessage): void {
    this.connections.forEach((connection, peerId) => {
      if (connection.state === ConnectionState.CONNECTED) {
        this.sendDataChannelMessage(connection, message);
      }
    });
  }

  // Room management
  async createRoom(): Promise<string> {
    this.roomCode = this.generateRoomCode();
    this.isHost = true;
    
    const roomUpdate = createRoomUpdateMessage(
      this.playerId,
      'server',
      'CREATE_ROOM',
      this.roomCode,
      { roomCode: this.roomCode, hostId: this.playerId }
    );
    
    this.sendSignalingMessage(roomUpdate);
    return this.roomCode;
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    this.roomCode = roomCode;
    this.isHost = false;
    
    const roomUpdate = createRoomUpdateMessage(
      this.playerId,
      'server',
      'JOIN_ROOM',
      roomCode,
      { roomCode, playerId: this.playerId }
    );
    
    this.sendSignalingMessage(roomUpdate);
    return true;
  }

  leaveRoom(): void {
    if (this.roomCode) {
      const roomUpdate = createRoomUpdateMessage(
        this.playerId,
        'server',
        'LEAVE_ROOM',
        this.roomCode,
        { roomCode: this.roomCode, playerId: this.playerId }
      );
      
      this.sendSignalingMessage(roomUpdate);
    }
    
    // Disconnect from all peers
    this.connections.forEach((_, peerId) => {
      this.disconnect(peerId);
    });
    
    this.roomCode = '';
    this.isHost = false;
  }

  getCurrentRoom(): GameRoom | null {
    return this.currentRoom;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  isRoomHost(): boolean {
    return this.isHost;
  }

  // Private methods
  private async connectToSignalingServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.signalingSocket = new WebSocket(this.networkConfig.signalingServerUrl);
        
        this.signalingSocket.onopen = () => {
          console.log('[WebRTCNetworkEngine] Connected to signaling server');
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.signalingSocket.onmessage = (event) => {
          this.handleSignalingMessage(JSON.parse(event.data));
        };
        
        this.signalingSocket.onclose = () => {
          console.log('[WebRTCNetworkEngine] Disconnected from signaling server');
          this.handleSignalingDisconnect();
        };
        
        this.signalingSocket.onerror = (error) => {
          console.error('[WebRTCNetworkEngine] Signaling server error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private sendSignalingMessage(message: SignalingMessage): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify(message));
    } else {
      console.warn('[WebRTCNetworkEngine] Cannot send signaling message: socket not open');
    }
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'OFFER':
        await this.handleOffer(message);
        break;
      case 'ANSWER':
        await this.handleAnswer(message);
        break;
      case 'ICE_CANDIDATE':
        await this.handleICECandidate(message);
        break;
      case 'ROOM_UPDATE':
        await this.handleRoomUpdate(message);
        break;
      case 'ERROR':
        console.error('[WebRTCNetworkEngine] Signaling error:', message.payload);
        break;
    }
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    const { from, payload } = message;
    const { offer } = payload;
    
    if (!this.connections.has(from)) {
      const peerConnection = this.createPeerConnection(from, false);
      this.setupConnectionHandlers(peerConnection);
    }
    
    const connection = this.connections.get(from)!;
    await connection.connection.setRemoteDescription(offer);
    
    const answer = await connection.connection.createAnswer();
    await connection.connection.setLocalDescription(answer);
    
    const answerMessage = createAnswerMessage(this.playerId, from, answer);
    this.sendSignalingMessage(answerMessage);
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const { from, payload } = message;
    const { answer } = payload;
    
    const connection = this.connections.get(from);
    if (connection) {
      await connection.connection.setRemoteDescription(answer);
    }
  }

  private async handleICECandidate(message: SignalingMessage): Promise<void> {
    const { from, payload } = message;
    const { candidate } = payload;
    
    const connection = this.connections.get(from);
    if (connection) {
      await connection.connection.addIceCandidate(candidate);
    }
  }

  private async handleRoomUpdate(message: SignalingMessage): Promise<void> {
    const { payload } = message;
    const { action, roomId, hostId, playerId } = payload;
    
    switch (action) {
      case 'ROOM_CREATED':
        this.currentRoom = {
          id: roomId,
          roomCode: this.roomCode,
          host: { 
            id: this.playerId, 
            name: 'Player', 
            isHost: true, 
            isConnected: true, 
            lastSeen: Date.now() 
          },
          players: new Map([
            [this.playerId, { 
              id: this.playerId, 
              name: 'Player', 
              isHost: true, 
              isConnected: true, 
              lastSeen: Date.now() 
            }]
          ]),
          gameState: 'waiting',
          maxPlayers: 2,
          createdAt: Date.now()
        };
        break;
        
      case 'ROOM_JOINED':
        this.currentRoom = {
          id: roomId,
          roomCode: this.roomCode,
          host: { 
            id: hostId || '', 
            name: 'Host', 
            isHost: true, 
            isConnected: true, 
            lastSeen: Date.now() 
          },
          players: new Map([
            [hostId || '', { 
              id: hostId || '', 
              name: 'Host', 
              isHost: true, 
              isConnected: true, 
              lastSeen: Date.now() 
            }],
            [this.playerId, { 
              id: this.playerId, 
              name: 'Player', 
              isHost: false, 
              isConnected: true, 
              lastSeen: Date.now() 
            }]
          ]),
          gameState: 'active',
          maxPlayers: 2,
          createdAt: Date.now()
        };
        
        // Connect to host
        if (hostId && hostId !== this.playerId) {
          await this.connect(hostId);
        }
        break;
        
      case 'ROOM_LEFT':
        this.currentRoom = null;
        break;
    }
  }

  private handleSignalingDisconnect(): void {
    if (this.reconnectAttempts < this.networkConfig.maxRetries) {
      this.reconnectAttempts++;
      console.log(`[WebRTCNetworkEngine] Attempting to reconnect (${this.reconnectAttempts}/${this.networkConfig.maxRetries})`);
      
      setTimeout(() => {
        this.connectToSignalingServer().catch(console.error);
      }, this.networkConfig.retryDelay);
    } else {
      console.error('[WebRTCNetworkEngine] Max reconnection attempts reached');
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < this.networkConfig.roomCodeLength; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Override cleanup to also close signaling connection
  destroy(): void {
    this.leaveRoom();
    
    if (this.signalingSocket) {
      this.signalingSocket.close();
      this.signalingSocket = null;
    }
    
    super.cleanupConnection = () => {}; // Prevent calling parent cleanup
    this.connections.forEach((_, peerId) => {
      this.cleanupConnection(peerId);
    });
  }
}
