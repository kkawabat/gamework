import { GameEngine } from './core/GameEngine';
import { WebRTCManager } from './networking/WebRTCManager';
import { SignalingService, WebSocketSignalingService } from './networking/SignalingService';
import { 
  GameState, 
  GameMove, 
  GameMessage, 
  Player,
  GameRoom,
  RTCIceServer
} from './types';
import { v4 as uuidv4 } from 'uuid';

export interface GameWorkConfig {
  stunServers?: RTCIceServer[];
  signalingService?: SignalingService;
  signalingConfig?: any;
}

export interface GameWorkEvents {
  onPlayerJoin?: (player: Player) => void;
  onPlayerLeave?: (playerId: string) => void;
  onStateUpdate?: (state: GameState) => void;
  onError?: (error: Error) => void;
}

/**
 * GameWork - The main multiplayer game framework
 * 
 * Handles all networking and player management while delegating game logic to GameEngine.
 * Developers focus on game logic, GameWork handles the rest.
 */
export class GameWork {
  private gameEngine: GameEngine;
  private webrtc: WebRTCManager;
  private signaling: SignalingService;
  private config: GameWorkConfig;
  private playerId: string;
  private roomId: string | null;
  private isConnected = false;
  private players: Map<string, Player> = new Map();
  private room?: GameRoom;
  private events: GameWorkEvents = {};

  constructor(gameEngine: GameEngine, config: GameWorkConfig) {
    this.gameEngine = gameEngine;
    this.config = config;
    this.playerId = uuidv4();
    this.roomId = null;
    
    // Initialize networking
    this.webrtc = new WebRTCManager(config.stunServers);
    
    // Check if signaling server URL is configured
    if (!__SIGNALING_SERVER_URL__) {
      throw new Error('SIGNALING_SERVER_URL environment variable is not set. Please configure the signaling server URL.');
    }
    
    this.signaling = config.signalingService || new WebSocketSignalingService({
      serverUrl: __SIGNALING_SERVER_URL__
    });
    
    this.setupEventHandlers();
  }

  /**
   * Host a new multiplayer game room
   */
  async hostRoom(): Promise<string> {
    // Disconnect from current room if already connected
    if (this.isConnected) {
      console.log('[GameWork] Disconnecting from current room before hosting new room');
      await this.stop();
    }

    try {
      // Generate a new room ID
      this.roomId = uuidv4();
      
      console.log(`[GameWork] Hosting multiplayer game in room: ${this.roomId}`);
      
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.roomId, this.playerId);
      
      // Create host player
      const hostPlayer: Player = {
        id: this.playerId,
        name: 'Host',
        isHost: true,
        isConnected: true,
        lastSeen: Date.now()
      };
      
      this.players.set(this.playerId, hostPlayer);
      
      // Create room
      this.room = {
        id: this.roomId,
        name: `Game Room ${this.roomId}`,
        hostId: this.playerId,
        players: this.players,
        maxPlayers: this.gameEngine.getMaxPlayers?.() || 4,
        gameType: this.gameEngine.getGameType?.() || 'custom',
        createdAt: Date.now()
      };
      
      this.isConnected = true;
      console.log(`[GameWork] Room hosted successfully`);
      
      return this.roomId;
    } catch (error) {
      console.error('[GameWork] Failed to host room:', error);
      throw error;
    }
  }

  /**
   * Look up a room by its short code
   */
  async lookupRoom(roomCode: string): Promise<string | null> {
    console.log(`[GameWork] Starting room lookup for code: ${roomCode}`);
    
    // Connect to signaling service if not already connected
    if (!this.signaling) {
      throw new Error('Signaling service not initialized');
    }

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log(`[GameWork] Room lookup timeout for code: ${roomCode}`);
        reject(new Error('Room lookup timeout'));
      }, 10000); // 10 seconds timeout

      let messageHandler: ((message: any) => void) | null = null;

      const handleMessage = (message: any) => {
        console.log(`[GameWork] Received message during lookup:`, message.type, message);
        
        if (message.type === 'room_found') {
          console.log(`[GameWork] Room found: ${message.payload.roomId} for code: ${roomCode}`);
          clearTimeout(timeout);
          if (messageHandler) {
            // Remove the specific handler we added
            const index = (this.signaling as any).messageCallbacks.indexOf(messageHandler);
            if (index > -1) {
              (this.signaling as any).messageCallbacks.splice(index, 1);
            }~19
          }
          resolve(message.payload.roomId);
        } else if (message.type === 'error' && message.payload.message.includes('Room with code')) {
          console.log(`[GameWork] Room lookup error: ${message.payload.message}`);
          clearTimeout(timeout);
          if (messageHandler) {
            // Remove the specific handler we added
            const index = (this.signaling as any).messageCallbacks.indexOf(messageHandler);
            if (index > -1) {
              (this.signaling as any).messageCallbacks.splice(index, 1);
            }
          }
          reject(new Error(message.payload.message || 'Room lookup failed'));
        }
      };

      try {
        console.log(`[GameWork] Connecting to signaling service for lookup...`);
        // Connect to signaling service
        await this.signaling.connect();
        
        console.log(`[GameWork] Setting up message handler for lookup...`);
        // Set up message handler
        messageHandler = handleMessage;
        this.signaling.onMessage(messageHandler);
        
        console.log(`[GameWork] Sending lookup request for room code: ${roomCode}`);
        // Send lookup request
        await this.signaling.sendMessage({
          type: 'lookup_room',
          payload: { roomCode },
          from: this.playerId,
          roomId: 'lookup'
        });
        
        console.log(`[GameWork] Lookup request sent, waiting for response...`);
      } catch (error) {
        console.log(`[GameWork] Error during room lookup:`, error);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Join an existing multiplayer game room
   */
  async joinRoom(roomId: string): Promise<void> {
    // Disconnect from current room if already connected
    if (this.isConnected) {
      console.log('[GameWork] Disconnecting from current room before joining new room');
      await this.stop();
    }

    try {
      this.roomId = roomId;
      
      console.log(`[GameWork] Joining multiplayer game in room: ${this.roomId}`);
      
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.roomId, this.playerId);
      
      // Create player (not host)
      const player: Player = {
        id: this.playerId,
        name: 'Player',
        isHost: false,
        isConnected: true,
        lastSeen: Date.now()
      };
      
      this.players.set(this.playerId, player);
      
      this.isConnected = true;
      console.log(`[GameWork] Successfully joined room: ${this.roomId}`);
      
    } catch (error) {
      console.error('[GameWork] Failed to join room:', error);
      throw error;
    }
  }

  /**
   * Stop the multiplayer game
   */
  async stop(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    console.log(`[GameWork] Stopping multiplayer game`);
    
    // Disconnect all peers
    this.webrtc.disconnectAll();
    
    // Leave signaling room
    if (this.roomId) {
      await this.signaling.leaveRoom(this.roomId, this.playerId);
    }
    this.signaling.disconnect();
    
    this.isConnected = false;
    this.players.clear();
    this.roomId = null;
    this.room = undefined;
    
    console.log(`[GameWork] Game stopped`);
  }

  /**
   * Switch to a different room (disconnect and reconnect)
   */
  async switchRoom(roomId: string): Promise<void> {
    console.log(`[GameWork] Switching to room: ${roomId}`);
    
    // Disconnect from current room if connected
    if (this.isConnected) {
      await this.stop();
    }
    
    // Join the new room
    await this.joinRoom(roomId);
  }

  /**
   * Send a move to the game engine
   */
  sendMove(move: GameMove): boolean {
    if (!this.isConnected) {
      console.warn('[GameWork] Cannot send move - not connected');
      return false;
    }

    // Check if player can make this move based on game engine rules
    if (!this.gameEngine.canPlayerMakeMove?.(move.playerId, move)) {
      console.warn(`[GameWork] Player ${move.playerId} cannot make this move`);
      return false;
    }

    // Apply move to game engine
    const newState = this.gameEngine.applyMove(move);
    if (newState) {
      // Broadcast state update to all players
      this.broadcastStateUpdate(newState);
      console.log(`[GameWork] Move applied and broadcasted`);
      return true;
    }

    console.warn(`[GameWork] Invalid move rejected by game engine`);
    return false;
  }

  /**
   * Get current game state
   */
  getCurrentState(): GameState {
    return this.gameEngine.getCurrentState();
  }

  /**
   * Get all connected players
   */
  getPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get current player
   */
  getCurrentPlayer(): Player | undefined {
    return this.players.get(this.playerId);
  }

  /**
   * Get room information
   */
  getRoom(): GameRoom | undefined {
    return this.room;
  }

  /**
   * Debug method to get room state
   */
  getRoomDebug(): any {
    return {
      room: this.room,
      roomId: this.roomId,
      playerId: this.playerId,
      isConnected: this.isConnected,
      playersCount: this.players.size,
      players: Array.from(this.players.entries())
    };
  }

  /**
   * Check if game is over
   */
  isGameOver(): boolean {
    return this.gameEngine.isGameOver();
  }

  /**
   * Get game winner
   */
  getWinner(): string | null {
    return this.gameEngine.getWinner?.() || null;
  }

  /**
   * Set event handlers
   */
  setEvents(events: GameWorkEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Get the underlying game engine (for advanced usage)
   */
  getGameEngine(): GameEngine {
    return this.gameEngine;
  }

  // Private methods
  private setupEventHandlers(): void {
    // WebRTC message handling
    this.webrtc.setMessageHandler((peerId, message) => {
      this.handlePeerMessage(peerId, message);
    });

    this.webrtc.setConnectionChangeHandler((peerId, isConnected) => {
      this.handleConnectionChange(peerId, isConnected);
    });

    this.webrtc.setIceCandidateHandler((peerId, candidate) => {
      this.handleIceCandidate(peerId, candidate);
    });

    // Signaling service message handling
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

  private async handlePeerMessage(peerId: string, message: GameMessage): Promise<void> {
    console.log(`[GameWork] Processing message from ${peerId}:`, message.type, message);
    
    try {
      switch (message.type) {
        case 'join':
          console.log(`[GameWork] Handling join message from ${peerId}`);
          this.handlePlayerJoin(message.payload);
          break;
          
        case 'input':
          console.log(`[GameWork] Handling input message from ${peerId}:`, message.payload);
          this.handlePlayerMove(message.payload);
          break;
          
        case 'resync':
          console.log(`[GameWork] Handling resync request from ${peerId}`);
          this.handleResyncRequest(peerId);
          break;
          
        case 'state':
          console.log(`[GameWork] Handling state update from ${peerId}:`, message.payload);
          this.handleStateUpdate(message.payload);
          break;
          
        default:
          console.warn(`[GameWork] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[GameWork] Error handling message from ${peerId}:`, error);
    }
  }

  private handlePlayerJoin(playerData: any): void {
    const player: Player = {
      id: playerData.playerId,
      name: playerData.playerName,
      isHost: false,
      isConnected: true,
      lastSeen: Date.now()
    };
    
    this.players.set(player.id, player);
    
    // Determine player role based on game engine rules
    const role = this.gameEngine.getPlayerRole?.(player.id) || 'player';
    player.role = role;
    
    console.log(`[GameWork] Player joined: ${player.name} (${role})`);
    
    if (this.events.onPlayerJoin) {
      this.events.onPlayerJoin(player);
    }
    
    // Create WebRTC connection for new player (only if we're the host)
    if (this.room && this.room.hostId === this.playerId) {
      console.log(`[GameWork] Host creating WebRTC offer for new player ${player.id}`);
      this.createWebRTCOffer(player.id);
    } else {
      console.log(`[GameWork] Non-host player, not creating WebRTC offer for ${player.id}`);
    }
  }

  private handlePlayerMove(move: GameMove): void {
    console.log(`[GameWork] Processing move from ${move.playerId}:`, move);
    
    // Apply move through game engine
    this.sendMove(move);
  }

  private handleResyncRequest(peerId: string): void {
    console.log(`[GameWork] Resync request from ${peerId}`);
    this.broadcastStateUpdate(this.gameEngine.getCurrentState());
  }

  private handleStateUpdate(payload: any): void {
    console.log(`[GameWork] Received state update:`, payload);
    
    if (payload.state) {
      // Update the game engine with the new state
      this.gameEngine.setState(payload.state);
      
      // Trigger the state update event
      if (this.events.onStateUpdate) {
        this.events.onStateUpdate(payload.state);
      }
    }
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
    await this.signaling.handleSignalingMessage(message, this.webrtc, this.playerId);
  }

  private handleRoomUpdate(room: any): void {
    console.log(`[GameWork] Room update received:`, room);
    
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
    
    console.log(`[GameWork] Room update: ${playersMap.size} players`);
    this.room = gameRoom;
    console.log(`[GameWork] this.room is now:`, this.room);
    
    // Update local players map - add new players and update existing ones
    for (const [playerId, player] of playersMap) {
      const wasNewPlayer = !this.players.has(playerId);
      this.players.set(playerId, player);
      
      if (wasNewPlayer && this.events.onPlayerJoin) {
        this.events.onPlayerJoin(player);
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
    
    // Trigger state update to refresh UI
    if (this.events.onStateUpdate) {
      this.events.onStateUpdate(this.gameEngine.getCurrentState());
    }
    
    console.log(`[GameWork] Players updated: ${this.players.size} players in room`);
  }

  /**
   * Handle room data from room_joined message (Object format)
   */
  private handleRoomJoinedData(roomData: any): void {
    console.log(`[GameWork] Room joined data:`, roomData);
    
    // Use the existing room update handler (now handles Object format)
    this.handleRoomUpdate(roomData);
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    if (this.roomId) {
      await this.webrtc.handleIceCandidateWithSignaling(peerId, candidate, this.signaling, this.roomId, this.playerId);
    }
  }

  private async createWebRTCOffer(peerId: string): Promise<void> {
    console.log(`[GameWork] Creating WebRTC offer for peer ${peerId}, roomId: ${this.roomId}`);
    if (this.roomId) {
      await this.webrtc.createOfferWithSignaling(peerId, this.signaling, this.roomId, this.playerId);
      console.log(`[GameWork] WebRTC offer created for peer ${peerId}`);
    } else {
      console.warn(`[GameWork] Cannot create WebRTC offer - no roomId`);
    }
  }

  private broadcastStateUpdate(state: GameState): void {
    const message: GameMessage = {
      type: 'state',
      payload: {
        state,
        isFullSnapshot: true
      },
      timestamp: Date.now(),
      messageId: uuidv4()
    };
    
    console.log(`[GameWork] Broadcasting state update to ${this.players.size} players`);
    this.webrtc.broadcastMessage(message);
    
    if (this.events.onStateUpdate) {
      this.events.onStateUpdate(state);
    }
  }
}