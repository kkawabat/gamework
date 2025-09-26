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
  roomId: string;
  playerName: string;
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
  private roomId: string;
  private isConnected = false;
  private players: Map<string, Player> = new Map();
  private room?: GameRoom;
  private events: GameWorkEvents = {};

  constructor(gameEngine: GameEngine, config: GameWorkConfig) {
    this.gameEngine = gameEngine;
    this.config = config;
    this.playerId = uuidv4();
    this.roomId = config.roomId;
    
    // Initialize networking
    this.webrtc = new WebRTCManager(config.stunServers);
    this.signaling = config.signalingService || new WebSocketSignalingService({
      serverUrl: 'ws://localhost:8080'
    });
    
    this.setupEventHandlers();
  }

  /**
   * Start the multiplayer game
   */
  async start(): Promise<void> {
    if (this.isConnected) {
      throw new Error('GameWork is already started');
    }

    try {
      console.log(`[GameWork] Starting multiplayer game in room: ${this.roomId}`);
      
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.roomId, this.playerId);
      
      // Create initial player
      const initialPlayer: Player = {
        id: this.playerId,
        name: this.config.playerName,
        isHost: true, // First player is host
        isConnected: true,
        lastSeen: Date.now()
      };
      
      this.players.set(this.playerId, initialPlayer);
      
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
      console.log(`[GameWork] Game started successfully`);
      
    } catch (error) {
      console.error('[GameWork] Failed to start game:', error);
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
    await this.signaling.leaveRoom(this.roomId, this.playerId);
    this.signaling.disconnect();
    
    this.isConnected = false;
    this.players.clear();
    
    console.log(`[GameWork] Game stopped`);
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
      this.handleSignalingMessage(message);
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
    console.log(`[GameWork] Received message from ${peerId}:`, message.type);
    
    try {
      switch (message.type) {
        case 'join':
          this.handlePlayerJoin(message.payload);
          break;
          
        case 'input':
          this.handlePlayerMove(message.payload);
          break;
          
        case 'resync':
          this.handleResyncRequest(peerId);
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
    
    // Create WebRTC connection for new player
    this.createWebRTCOffer(player.id);
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

  private handleRoomUpdate(room: GameRoom): void {
    console.log(`[GameWork] Room update: ${room.players.size} players`);
    this.room = room;
    
    // Update local players map
    for (const [playerId, player] of room.players) {
      if (!this.players.has(playerId)) {
        this.players.set(playerId, player);
        if (this.events.onPlayerJoin) {
          this.events.onPlayerJoin(player);
        }
      }
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    await this.webrtc.handleIceCandidateWithSignaling(peerId, candidate, this.signaling, this.roomId, this.playerId);
  }

  private async createWebRTCOffer(peerId: string): Promise<void> {
    await this.webrtc.createOfferWithSignaling(peerId, this.signaling, this.roomId, this.playerId);
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
    
    console.log(`[GameWork] Broadcasting state update`);
    this.webrtc.broadcastMessage(message);
    
    if (this.events.onStateUpdate) {
      this.events.onStateUpdate(state);
    }
  }
}