import { WebRTCManager } from './WebRTCManager';
import { SignalingService, WebSocketSignalingService } from './SignalingService';
import { 
  GameMessage, 
  Player,
  GameRoom,
  RTCIceServer
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { GameWorkConfig } from '../GameWork';


export interface NetworkEngineEvents {
  onPlayerJoin?: (player: Player) => void;
  onPlayerLeave?: (playerId: string) => void;
  onStateUpdate?: (state: any) => void;
  onError?: (error: Error) => void;
  onRoomUpdate?: (room: GameRoom) => void;
  onPeerMessage?: (peerId: string, message: GameMessage) => void;
}

/**
 * NetworkEngine - Unified networking for GameWork
 * 
 * Combines SignalingService and WebRTCManager to handle all networking operations.
 * Manages room-based logic and peer-to-peer communication.
 */
export class NetworkEngine {
  private webrtc: WebRTCManager;
  private signaling: SignalingService;
  private config: GameWorkConfig;
  private clientId: string;
  private roomId: string | null;
  private isConnected = false;
  private players: Map<string, Player> = new Map();
  private room?: GameRoom;
  private events: NetworkEngineEvents = {};

  constructor(config: GameWorkConfig) {
    this.config = config;
    this.clientId = uuidv4();
    this.roomId = null;
    
    // Initialize networking
    this.webrtc = new WebRTCManager(config.stunServers);
    this.signaling = new WebSocketSignalingService(config.signalServiceConfig);
    
    this.setupEventHandlers();
  }

  /**
   * Host a new multiplayer game room
   */
  async hostRoom(): Promise<string> {
    // Disconnect from current room if already connected
    if (this.isConnected) {
      console.log('[NetworkEngine] Disconnecting from current room before hosting new room');
      await this.closeRoom();
    }

    try {
      // Generate a new room ID
      this.roomId = uuidv4();
      
      console.log(`[NetworkEngine] Hosting multiplayer game in room: ${this.roomId}`);
      
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.roomId, this.clientId);
      
      // Create host player
      const hostPlayer: Player = {
        id: this.clientId,
        name: 'Host',
        isHost: true,
        isConnected: true,
        lastSeen: Date.now()
      };
      
      this.players.set(this.clientId, hostPlayer);
      
      // Create room
      this.room = {
        id: this.roomId,
        name: `Game Room ${this.roomId}`,
        hostId: this.clientId,
        players: this.players,
        maxPlayers: 4, // Default, can be overridden
        gameType: 'custom', // Default, can be overridden
        createdAt: Date.now()
      };
      
      this.isConnected = true;
      console.log(`[NetworkEngine] Room hosted successfully`);
      
      return this.roomId;
    } catch (error) {
      console.error('[NetworkEngine] Failed to host room:', error);
      throw error;
    }
  }

  /**
   * Look up a room by room code
   */
  async lookupRoom(roomCode: string): Promise<string | null> {
    console.log(`[NetworkEngine] Looking up room with code: ${roomCode}`);
    
    if (!this.signaling) {
      throw new Error('Signaling service not initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Room lookup timeout'));
      }, 10000);

      const messageHandler = (message: any) => {
        if (message.type === 'room_found') {
          clearTimeout(timeout);
          const roomId = message.payload.roomId;
          console.log(`[NetworkEngine] Room found: ${roomId}`);
          resolve(roomId);
        } else if (message.type === 'room_not_found') {
          clearTimeout(timeout);
          console.log(`[NetworkEngine] Room not found: ${roomCode}`);
          resolve(null);
        }
      };

      // Add temporary message handler
      this.signaling.onMessage(messageHandler);
      
      // Send lookup request
      this.signaling.sendMessage({
        type: 'lookup_room',
        payload: { roomCode },
        from: this.clientId,
        roomId: 'lookup' // Special roomId for lookup requests
      });
    });
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomId: string): Promise<void> {
    // Disconnect from current room if already connected
    if (this.isConnected) {
      console.log('[NetworkEngine] Disconnecting from current room before joining new room');
      await this.closeRoom();
    }

    try {
      this.roomId = roomId;
      console.log(`[NetworkEngine] Joining room: ${roomId}`);
      
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(roomId, this.clientId);
      
      // Create player
      const player: Player = {
        id: this.clientId,
        name: 'Player',
        isHost: false,
        isConnected: true,
        lastSeen: Date.now()
      };
      
      this.players.set(this.clientId, player);
      this.isConnected = true;
      
      console.log(`[NetworkEngine] Successfully joined room: ${roomId}`);
    } catch (error) {
      console.error('[NetworkEngine] Failed to join room:', error);
      throw error;
    }
  }

  /**
   * Switch to a different room
   */
  async switchRoom(roomId: string): Promise<void> {
    console.log(`[NetworkEngine] Switching to room: ${roomId}`);
    await this.joinRoom(roomId);
  }

  /**
   * Close the current room and disconnect from networking
   */
  async closeRoom(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    console.log('[NetworkEngine] Closing room...');
    
    // Disconnect from signaling service
    if (this.signaling) {
      await this.signaling.disconnect();
    }
    
    // Clear room data
    this.roomId = null;
    this.players.clear();
    this.room = undefined;
    this.isConnected = false;
    
    console.log('[NetworkEngine] Room closed');
  }

  /**
   * Send a move to other players
   */
  sendMove(move: any): boolean {
    if (!this.isConnected) {
      console.warn('[NetworkEngine] Cannot send move - not connected');
      return false;
    }

    this.broadcastMove(move);
    console.log(`[NetworkEngine] Move sent to other players via WebRTC`);
    return true;
  }

  /**
   * Broadcast a message to all connected peers
   */
  broadcastMessage(message: GameMessage): void {
    console.log(`[NetworkEngine] Broadcasting message to ${this.players.size} players`);
    this.webrtc.broadcastMessage(message);
  }

  /**
   * Get current connection status
   */
  isNetworkConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current room ID
   */
  getRoomId(): string | null {
    return this.roomId;
  }

  /**
   * Get all players in the room
   */
  getPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  /**
   * Get a specific player
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get current room information
   */
  getRoom(): GameRoom | undefined {
    return this.room;
  }

  /**
   * Get current client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Set event handlers
   */
  setEvents(events: NetworkEngineEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Get WebRTC manager for advanced operations
   */
  getWebRTCManager(): WebRTCManager {
    return this.webrtc;
  }

  /**
   * Get signaling service for advanced operations
   */
  getSignalingService(): SignalingService {
    return this.signaling;
  }

  // Private methods

  private setupEventHandlers(): void {
    // WebRTC message handling
    this.webrtc.setMessageHandler((peerId, message) => {
      console.log(`[NetworkEngine] Received message from ${peerId}:`, message.type);
      if (this.events.onPeerMessage) {
        this.events.onPeerMessage(peerId, message);
      }
    });

    this.webrtc.setConnectionChangeHandler((peerId, isConnected) => {
      this.handleConnectionChange(peerId, isConnected);
    });

    this.webrtc.setIceCandidateHandler((peerId, candidate) => {
      this.handleIceCandidate(peerId, candidate);
    });

    // Signaling message handling
    this.signaling.onMessage((message) => {
      // Handle room_joined messages specially
      if (message.type === 'room_joined' && message.payload && message.payload.room) {
        this.handleRoomJoinedData(message.payload.room);
      } else {
        this.handleSignalingMessage(message);
      }
    });

    this.signaling.onRoomUpdate((room) => {
      this.handleRoomUpdate(room);
    });

    this.signaling.onError((error) => {
      if (this.events.onError) {
        this.events.onError(error);
      }
    });
  }

  private handleConnectionChange(peerId: string, isConnected: boolean): void {
    const player = this.players.get(peerId);
    if (player) {
      player.isConnected = isConnected;
      player.lastSeen = Date.now();
      
      if (!isConnected && this.events.onPlayerLeave) {
        this.events.onPlayerLeave(peerId);
      }
    }
  }

  private async handleSignalingMessage(message: any): Promise<void> {
    await this.signaling.handleSignalingMessage(message, this.webrtc, this.clientId);
  }

  private handleRoomUpdate(room: any): void {
    console.log(`[NetworkEngine] Room update received:`, room);
    
    // Convert players from Object to Map format
    const playersMap = new Map<string, Player>();
    if (room.players) {
      if (room.players instanceof Map) {
        // Already a Map - copy all entries
        for (const [playerId, player] of room.players) {
          playersMap.set(playerId, player);
        }
      } else if (typeof room.players === 'object' && !Array.isArray(room.players)) {
        // Object format from signaling server
        for (const [playerId, player] of Object.entries(room.players)) {
          playersMap.set(playerId, player as Player);
        }
      } else if (Array.isArray(room.players)) {
        // Array format (fallback)
        for (const player of room.players) {
          playersMap.set(player.id, player);
        }
      }
    }
    
    // Create proper GameRoom object with Map
    const gameRoom: GameRoom = {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      players: playersMap,
      maxPlayers: room.maxPlayers,
      gameType: room.gameType,
      createdAt: room.createdAt
    };
    
    console.log(`[NetworkEngine] Room update: ${playersMap.size} players`);
    this.room = gameRoom;
    console.log(`[NetworkEngine] this.room is now:`, this.room);
    
    // Update local players map - add new players and update existing ones
    for (const [playerId, player] of playersMap) {
      const wasNewPlayer = !this.players.has(playerId);
      this.players.set(playerId, player);
      
      if (wasNewPlayer) {
        // Create WebRTC connection for new player (only if we're the host)
        if (this.room && this.room.hostId === this.clientId) {
          console.log(`[NetworkEngine] Host creating WebRTC offer for new player ${player.id}`);
          this.createWebRTCOffer(player.id);
        } else {
          console.log(`[NetworkEngine] Non-host player, not creating WebRTC offer for ${player.id}`);
        }
        
        if (this.events.onPlayerJoin) {
          this.events.onPlayerJoin(player);
        }
      }
    }
    
    // Remove players who are no longer in the room
    for (const [playerId, player] of this.players) {
      if (!playersMap.has(playerId)) {
        this.players.delete(playerId);
        if (this.events.onPlayerLeave) {
          this.events.onPlayerLeave(playerId);
        }
      }
    }
    
    // Trigger room update event
    if (this.events.onRoomUpdate) {
      this.events.onRoomUpdate(gameRoom);
    }
  }

  private handleRoomJoinedData(roomData: any): void {
    console.log(`[NetworkEngine] Room joined data:`, roomData);
    
    // Use the existing room update handler (now handles Object format)
    this.handleRoomUpdate(roomData);
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    if (this.roomId) {
      await this.webrtc.handleIceCandidateWithSignaling(peerId, candidate, this.signaling, this.roomId, this.clientId);
    }
  }

  private async createWebRTCOffer(peerId: string): Promise<void> {
    console.log(`[NetworkEngine] Creating WebRTC offer for peer ${peerId}, roomId: ${this.roomId}`);
    if (this.roomId) {
      await this.webrtc.createOfferWithSignaling(peerId, this.signaling, this.roomId, this.clientId);
      console.log(`[NetworkEngine] WebRTC offer created for peer ${peerId}`);
    } else {
      console.warn(`[NetworkEngine] Cannot create WebRTC offer - no roomId`);
    }
  }

  private broadcastMove(move: any): void {
    const message: GameMessage = {
      type: 'input',
      payload: move,
      timestamp: Date.now(),
      messageId: uuidv4()
    };
    
    console.log(`[NetworkEngine] Broadcasting move to ${this.players.size} players via WebRTC`);
    this.webrtc.broadcastMessage(message);
  }
}
