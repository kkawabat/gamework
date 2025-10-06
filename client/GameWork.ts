import { GameEngine } from './core/GameEngine';
import { UIEngine } from './core/UIEngine';
import { NetworkEngine} from './networking/NetworkEngine';
import { EventManager } from './events/EventManager';
import { 
  Player,
  GameWorkConfig,
} from './types';
import { v4 as uuidv4 } from 'uuid';
import { GameState, PlayerAction, StateChange, ThinClientEventFlow } from './events/EventFlow';
import { GameRoom } from '../shared/signaling-types';

// Hybrid architecture: Direct calls for internal logic, events for external communication
interface GameWorkState {
  gameState: GameState;
  room?: GameRoom;
  owner: Player;
  isHost: boolean;
  isConnected: boolean;
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
 * GameWork - Hybrid architecture for multiplayer games
 * 
 * Uses direct method calls for internal game logic and events only for external communication.
 * Provides consistent state management and predictable performance.
 */
export class GameWork {
  private config: GameWorkConfig;
  private eventManager: EventManager;
  private gameEngine: GameEngine<any, any>;
  private uiEngine: UIEngine<any, any>;
  private network: NetworkEngine;
  private state: GameWorkState;
  public eventFlow = ThinClientEventFlow;
  
  // Event bus for external communication only
  private eventBus = new Map<string, Function[]>();

  constructor(gameEngine: GameEngine<any, any>, uiEngine: UIEngine<any, any>, config?: GameWorkConfig) {
    this.config = { ...DEFAULT_GAMEWORK_CONFIG, ...config };
    
    // Initialize state
    this.state = {
      gameState: {
        stage: 'lobby',
        tick: 0,
        players: {},
        gameData: {},
        metadata: {}
      },
      owner: {
        id: uuidv4(),
        name: 'Host',
        isHost: true,
        isConnected: true,
        lastSeen: Date.now()
      },
      isHost: true,
      isConnected: false
    };

    // Initialize networking with GameWork reference
    this.network = new NetworkEngine(this);
    
    // Set GameWork reference in engines
    this.gameEngine = gameEngine;
    this.gameEngine.setGameWork(this);
    this.uiEngine = uiEngine;
    this.uiEngine.setGameWork(this);
    
    // Initialize event manager for external communication
    this.eventManager = new EventManager(this);
  }

  // === STATE MANAGEMENT (Direct calls) ===
  
  getState(): GameState {
    return this.state.gameState;
  }

  getOwner(): Player {
    return this.state.owner;
  }

  getRoom(): GameRoom | undefined {
    return this.state.room;
  }

  isHost(): boolean {
    return this.state.isHost;
  }

  isConnected(): boolean {
    return this.state.isConnected;
  }

  // === INTERNAL GAME LOGIC (Direct calls) ===
  
  /**
   * Process player action internally and update state
   */
  processPlayerAction(action: PlayerAction): void {
    // Update game state synchronously
    this.state.gameState = this.gameEngine.processAction(this.state.gameState, action);
    
    // Update UI directly
    this.uiEngine.updateState(this.state.gameState);
    
    // Emit event for external systems (network)
    this.emit('playerActionProcessed', { action, state: this.state.gameState });
  }

  /**
   * Update game state and notify all components
   */
  updateGameState(newState: GameState): void {
    this.state.gameState = newState;
    
    // Update all components directly
    this.uiEngine.updateState(this.state.gameState);
    this.network.updateState(this.state.gameState);
    
    // Emit event for external systems
    this.emit('gameStateChanged', this.state.gameState);
  }

  /**
   * Handle room creation/joining
   */
  handleRoomUpdate(room: GameRoom, isHost: boolean): void {
    this.state.room = room;
    this.state.isHost = isHost;
    this.state.isConnected = true;
    
    // Update components directly
    this.uiEngine.updateRoom(room, isHost);
    this.network.updateRoom(room, isHost);
    
    // Emit event for external systems
    this.emit('roomUpdated', { room, isHost });
  }

  // === EXTERNAL COMMUNICATION (Events) ===
  
  /**
   * Send player action to network (external)
   */
  sendPlayerAction(payload: PlayerAction): void {
    this.eventManager.emit('sendPlayerAction', payload);
  }

  /**
   * Receive player action from network (external)
   */
  receivePlayerAction(payload: PlayerAction): void {
    this.eventManager.emit('receivePlayerAction', payload);
  }

  /**
   * Send state change to network (external)
   */
  sendStateChange(payload: StateChange): void {
    this.eventManager.emit('sendStateChange', payload);
  }

  /**
   * Receive state change from network (external)
   */
  receiveStateChange(payload: StateChange): void {
    this.eventManager.emit('receiveStateChange', payload);
  }

  // === EVENT BUS FOR EXTERNAL COMMUNICATION ===
  
  on(event: string, callback: Function): void {
    if (!this.eventBus.has(event)) {
      this.eventBus.set(event, []);
    }
    this.eventBus.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.eventBus.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event: string, data?: any): void {
    const callbacks = this.eventBus.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // === GAME LOOP (Synchronous updates) ===
  
  /**
   * Main game loop - synchronous updates for consistent state
   */
  update(deltaTime: number): void {
    // Update game engine
    this.state.gameState = this.gameEngine.update(this.state.gameState, deltaTime);
    
    // Update all components with new state
    this.uiEngine.updateState(this.state.gameState);
    this.network.updateState(this.state.gameState);
    
    // Emit events for external systems
    this.emit('gameUpdated', { state: this.state.gameState, deltaTime });
  }
}