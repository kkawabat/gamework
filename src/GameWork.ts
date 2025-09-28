import { GameEngine } from './core/GameEngine';
import { RenderingEngine } from './core/RenderingEngine';
import { NetworkEngine, NetworkEngineEvents } from './networking/NetworkEngine';
import { EventManager } from './EventManager';
import { PlayerMove, GameState as EventGameState, StateChange } from './types/EventInterfaces';
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


/**
 * GameWork - The main multiplayer game framework
 * 
 * Handles all networking and player management while delegating game logic to GameEngine.
 * Developers focus on game logic, GameWork handles the rest.
 */
export class GameWork {
  private gameEngine: GameEngine;
  private renderingEngine: RenderingEngine;
  private network: NetworkEngine;
  private config: GameWorkConfig;
  private eventManager: EventManager;

  constructor(gameEngine: GameEngine, renderingEngine: RenderingEngine, config?: GameWorkConfig) {
    this.config = { ...DEFAULT_GAMEWORK_CONFIG, ...config };
    this.gameEngine = gameEngine;
    this.renderingEngine = renderingEngine

    // Initialize networking
    this.eventManager = new EventManager();
    this.network = new NetworkEngine(this.config);
    
    this.setupEventHandlers();
  }

  /**
   * Host a new multiplayer game room
   */
  async hostRoom(): Promise<string> {
    return await this.network.hostRoomWithEvents();
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
    return await this.network.closeRoomWithEvents();
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
      
      // Emit player move event (NetworkEngine will automatically handle networking)
      const playerMove = {
        playerId: move.playerId,
        moveType: move.type,
        payload: move.data,
        timestamp: move.timestamp,
        moveId: (move as any).messageId || `move_${Date.now()}`
      };
      this.eventManager.emit('playerMove', playerMove);
      this.eventManager.emit('playerMoveApplied', playerMove);
      
      // Emit state change event
      this.eventManager.emit('stateChange', newState as any);
      
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

  /**
   * Get the event manager
   */
  getEventManager(): EventManager {
    return this.eventManager;
  }

  // Private methods

  private setupEventHandlers(): void {
    this.eventManager.setupGameWorkEventHandlers(
      this.network,
      this.gameEngine,
      this.renderingEngine,
      this
    );
  }
}