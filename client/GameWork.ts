import { GameEngine } from './core/GameEngine';
import { UIEngine } from './core/UIEngine';
import { NetworkEngine} from './networking/NetworkEngine';
import { EventManager } from './events/EventManager';
import { GameWorkConfig } from './types';
import { v4 as uuidv4 } from 'uuid';
import { PlayerAction, StateChange, ThinClientEventFlow } from './events/EventFlow';
import { GameRoom, Peer } from '../shared/signaling-types';

// Hybrid architecture: Direct calls for internal logic, events for external communication
// Game-specific state should extend this base interface
interface BaseGameWorkState {
  room: GameRoom;  // Single source of truth for all connection info
}

// Default configuration for GameWork
const DEFAULT_GAMEWORK_CONFIG: GameWorkConfig = {
  webrtcConfig: {
    rtcConfig: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceTransportPolicy: 'all',     // allow host/srflx/relay
      bundlePolicy: 'max-bundle',    // modern default; good
      iceCandidatePoolSize: 0,   
    },
    dataChannelConfig: {
      ordered: true,
    },
  },
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
 * 
 * For game-specific implementations, extend this class and override the abstract methods.
 */
export abstract class GameWork<T extends BaseGameWorkState = BaseGameWorkState> {
  public config: GameWorkConfig;
  private eventManager: EventManager;
  protected gameEngine!: GameEngine<any, any>;
  protected uiEngine!: UIEngine<any, any>;
  private network: NetworkEngine;
  protected state!: T;
  public eventFlow = ThinClientEventFlow;
  public id: string = '';
  
  // Event bus for external communication only
  private eventBus = new Map<string, Function[]>();

  constructor(config?: GameWorkConfig) {
    this.id = uuidv4();
    this.config = { ...DEFAULT_GAMEWORK_CONFIG, ...config };
    
    // Initialize networking with GameWork reference
    this.network = new NetworkEngine(this);
    
    // Initialize event manager for external communication
    this.eventManager = new EventManager(this);
    
    // Initialize game-specific components
    this.initializeGame();
    
    // Initialize networking after state is ready
    this.network.initialize();
    
    // Update event manager with initialized components
    this.eventManager.updateComponents(this.gameEngine, this.uiEngine);
    
    // Automatically create a room for the host after networking is ready
    this.createRoom();
    
  }

  // === ABSTRACT METHODS (Override in game-specific implementations) ===
  
  /**
   * Initialize game-specific components
   * Override this method to set up your game engine and UI engine
   */
  protected abstract initializeGame(): void;
  
  /**
   * Get the initial game state
   * Override this method to provide your game's initial state
   */
  protected abstract getInitialGameState(): T;
  
  /**
   * Process a player action
   * Override this method to implement your game's action processing logic
   */
  protected abstract handlePlayerAction(action: PlayerAction): T;
  
  /**
   * Update the game state
   * Override this method to implement your game's update logic
   */
  protected abstract handleGameUpdate(state: T, deltaTime: number): T;

  // === STATE MANAGEMENT (Direct calls) ===
  
  getState(): T {
    return this.state;
  }

  getRoom(): GameRoom | undefined {
    return this.state.room;
  }

  isHost(): boolean {
    return this.state.room?.host.id === this.id;
  }

  isConnected(): boolean {
    return this.state.room !== undefined;
  }

  getConnectedPlayers(): Map<string, Peer> {
    return this.state.room?.peers || new Map();
  }

  getHostId(): string | undefined {
    return this.state.room?.host.id;
  }

  getPlayerCount(): number {
    return this.state.room?.peers.size || 0;
  }

  // === INTERNAL GAME LOGIC (Direct calls) ===
  
  /**
   * Process player action internally and update state
   */
  processPlayerAction(action: PlayerAction): void {
    // Update game state synchronously using game-specific logic
    this.state = this.processPlayerActionInternal(action);
    
    // Update UI directly
    this.uiEngine.updateState(this.state);
    
    // Emit event for external systems (network)
    this.emit('playerActionProcessed', { action, state: this.state });
  }

  /**
   * Internal method to process player action (calls abstract method)
   */
  private processPlayerActionInternal(action: PlayerAction): T {
    return this.handlePlayerAction(action);
  }

  /**
   * Update game state and notify all components
   */
  updateGameState(newState: T): void {
    this.state = newState;
    
    // Update all components directly
    this.uiEngine.updateState(this.state);
    this.network.updateState(this.state);
    
    // Emit event for external systems
    this.emit('gameStateChanged', this.state);
  }

  /**
   * Handle room creation/joining
   */
  handleRoomUpdate(room: GameRoom): void {
    this.state.room = room;
    
    // Update components directly
    this.uiEngine.updateRoom(room, this.isHost());
    this.network.updateRoom(room, this.isHost());
    
    // Emit event for external systems
    this.emit('roomUpdated', { room, isHost: this.isHost() });
  }

  /**
   * Add a connected player
   */
  addConnectedPlayer(peer: Peer): void {
    this.state.room.peers.set(peer.id, peer);

    if (peer.isHost) {
      this.state.room.host = peer;
    }
    
    // Update components
    this.uiEngine.updateState(this.state);
    this.network.updateState(this.state);
    
    // Emit event for external systems
    this.emit('playerConnected', { peer, connectedPlayers: this.state.room.peers });
  }

  /**
   * Remove a disconnected player
   */
  removeConnectedPlayer(peerId: string): void {
    this.state.room.peers.delete(peerId);
    
    // Update components
    this.uiEngine.updateState(this.state);
    this.network.updateState(this.state);
    
    // Emit event for external systems
    this.emit('playerDisconnected', { peerId, connectedPlayers: this.state.room.peers });
    
  }

  /**
   * Update player information
   */
  updatePlayer(peer: Peer): void {
    this.state.room.peers.set(peer.id, peer);
    
    // Update components
    this.uiEngine.updateState(this.state);
    this.network.updateState(this.state);
    
    // Emit event for external systems
    this.emit('playerUpdated', { peer, connectedPlayers: this.state.room.peers });
    
  }

  // === ROOM MANAGEMENT (Base functionality) ===
  
  /**
   * Create a new room
   */
  createRoom(): void {
    
    const action: PlayerAction = {
      action: 'CreateRoomRequest',
      playerId: this.id
    };
    
    this.sendPlayerAction(action);
  }

  /**
   * Join an existing room
   */
  joinRoom(roomCode: string): void {
    const action: PlayerAction = {
      action: 'JoinRoomRequest',
      playerId: this.id,
      input: { roomCode }
    };
    
    this.sendPlayerAction(action);
  }

  /**
   * Leave the current room
   */
  leaveRoom(): void {
    const action: PlayerAction = {
      action: 'LeaveRoomRequest',
      playerId: this.id
    };
    
    this.sendPlayerAction(action);
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
    this.state = this.gameEngine.update(this.state, deltaTime);
    
    // Update all components with new state
    this.uiEngine.updateState(this.state);
    this.network.updateState(this.state);
    
    // Emit events for external systems
    this.emit('gameUpdated', { state: this.state, deltaTime });
  }
}