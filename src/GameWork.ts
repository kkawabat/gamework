import { GameEngine } from './core/GameEngine';
import { NetworkEngine, NetworkEngineEvents } from './networking/NetworkEngine';
import { 
  GameState, 
  GameMove, 
  GameMessage, 
  Player,
  GameRoom,
  RTCIceServer
} from './types';

export interface GameWorkConfig {
  stunServers?: RTCIceServer[];
  signalServiceConfig: {
    serverUrl: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
  };
  // GameWork-specific config can be added here
}

// Default configuration for GameWork
const DEFAULT_GAMEWORK_CONFIG: GameWorkConfig = {
  stunServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  signalServiceConfig: {
    serverUrl: __SIGNALING_SERVER_URL__,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    pingInterval: 30000
  }
};

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
  private network: NetworkEngine;
  private config: GameWorkConfig;
  private events: GameWorkEvents = {};

  constructor(gameEngine: GameEngine, config?: GameWorkConfig) {
    this.gameEngine = gameEngine;
    this.config = { ...DEFAULT_GAMEWORK_CONFIG, ...config };
    
    // Initialize networking
    this.network = new NetworkEngine(this.config);
    
    this.setupEventHandlers();
  }

  /**
   * Host a new multiplayer game room
   */
  async hostRoom(): Promise<string> {
    return await this.network.hostRoom();
  }

  /**
   * Look up a room by its short code
   */
  async lookupRoom(roomCode: string): Promise<string | null> {
    return await this.network.lookupRoom(roomCode);
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomId: string): Promise<void> {
    await this.network.joinRoom(roomId);
  }

  /**
   * Close the current room and disconnect from networking
   */
  async closeRoom(): Promise<void> {
    await this.network.closeRoom();
  }

  /**
   * Switch to a different room
   */
  async switchRoom(roomId: string): Promise<void> {
    await this.network.switchRoom(roomId);
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

    // Apply move locally first
    const newState = this.gameEngine.applyMove(move);
    if (newState) {
      console.log(`[GameWork] Move applied locally`);
      
      // Trigger state update event for UI
      if (this.events.onStateUpdate) {
        this.events.onStateUpdate(newState);
      }
      
      // Send move to other players via WebRTC
      this.network.sendMove(move);
      console.log(`[GameWork] Move sent to other players via WebRTC`);
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
   * Get all players in the room
   */
  getPlayers(): Player[] {
    return this.network.getPlayers();
  }

  /**
   * Get a specific player
   */
  getPlayer(playerId: string): Player | undefined {
    return this.network.getPlayer(playerId);
  }

  /**
   * Get the current client player
   */
  getClientPlayer(): Player | undefined {
    const clientId = this.network.getClientId();
    return this.network.getPlayer(clientId);
  }

  /**
   * Get current room information
   */
  getRoom(): GameRoom | undefined {
    return this.network.getRoom();
  }

  /**
   * Get current room information for debugging
   */
  getRoomDebug(): any {
    return {
      room: this.network.getRoom(),
      players: this.network.getPlayers(),
      isConnected: this.isConnected,
      clientId: this.network.getClientId()
    };
  }

  /**
   * Check if the game is over
   */
  isGameOver(): boolean {
    return this.gameEngine.isGameOver();
  }

  /**
   * Get the winner of the game
   */
  getWinner(): string | null {
    return this.gameEngine.getWinner();
  }

  /**
   * Set event handlers
   */
  setEvents(events: GameWorkEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Get the game engine instance
   */
  getGameEngine(): GameEngine {
    return this.gameEngine;
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.network.isNetworkConnected();
  }

  // Private methods

  private setupEventHandlers(): void {
    // Set up NetworkEngine event handlers
    this.network.setEvents({
      onPlayerJoin: (player: Player) => {
        if (this.events.onPlayerJoin) {
          this.events.onPlayerJoin(player);
        }
      },
      onPlayerLeave: (playerId: string) => {
        if (this.events.onPlayerLeave) {
          this.events.onPlayerLeave(playerId);
        }
      },
      onError: (error: Error) => {
        if (this.events.onError) {
          this.events.onError(error);
        }
      },
      onPeerMessage: (peerId: string, message: GameMessage) => {
        this.handlePeerMessage(peerId, message);
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
    // This is handled by NetworkEngine, but we can add game-specific logic here if needed
    console.log(`[GameWork] Player joined: ${playerData.playerId}`);
  }

  private handlePlayerMove(move: GameMove): void {
    console.log(`[GameWork] Processing move from ${move.playerId}:`, move);
    
    // Apply move to local game engine
    const newState = this.gameEngine.applyMove(move);
    if (newState) {
      console.log(`[GameWork] Move applied locally`);
      
      // Trigger state update event for UI
      if (this.events.onStateUpdate) {
        this.events.onStateUpdate(newState);
      }
    } else {
      console.warn(`[GameWork] Invalid move rejected by game engine`);
    }
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

  private broadcastStateUpdate(state: GameState): void {
    const message: GameMessage = {
      type: 'state',
      payload: {
        state,
        isFullSnapshot: true
      },
      timestamp: Date.now(),
      messageId: require('uuid').v4()
    };
    
    console.log(`[GameWork] Broadcasting state update to ${this.network.getPlayers().length} players`);
    this.network.broadcastMessage(message);
    
    if (this.events.onStateUpdate) {
      this.events.onStateUpdate(state);
    }
  }
}