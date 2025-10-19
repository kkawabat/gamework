/**
 * GameWork v2 - Main orchestrator class
 * 
 * Provides clean architecture with:
 * - Dependency injection
 * - Event-driven communication
 * - Centralized state management
 * - Type-safe interfaces
 */

import { StateStore, GameStateStore } from './StateStore';
import { EventBus, GameEventBus } from './EventBus';
import { DIContainer, GameDIContainer, SERVICE_TOKENS } from './DIContainer';
import { ErrorHandler, GameErrorHandler, createGameError, ErrorType, ErrorSeverity } from './ErrorHandler';
import { NetworkEngine } from '../engines/NetworkEngine';
import { GameEngine } from '../engines/GameEngine';
import { UIEngine } from '../engines/UIEngine';
import { 
  BaseGameState, 
  GameAction, 
  GameConfig, 
  GameRoom, 
  Player, 
  NetworkMessage,
  GameEvents,
  EventName,
  EventPayload
} from '../types/GameTypes';

export class GameWork<TState extends BaseGameState, TAction extends GameAction> {
  private config: GameConfig<TState, TAction>;
  private container: DIContainer;
  private stateStore: StateStore<TState>;
  private eventBus: EventBus;
  private errorHandler: ErrorHandler;
  private isInitialized: boolean = false;
  private currentRoom?: GameRoom;

  constructor(config: GameConfig<TState, TAction>) {
    this.config = config;
    this.container = new GameDIContainer();
    this.stateStore = new GameStateStore<TState>(config.initialState);
    this.eventBus = new GameEventBus(config.debugMode);
    this.errorHandler = new GameErrorHandler();
    
    this.setupContainer();
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize error handling
      this.setupErrorHandling();
      
      // Initialize state management
      this.setupStateManagement();
      
      // Initialize components through DI
      await this.initializeComponents();
      
      this.isInitialized = true;
      
      if (this.config.debugMode) {
        console.log('[GameWork] Initialized successfully');
      }
    } catch (error) {
      const gameError = createGameError(
        `Failed to initialize GameWork: ${error}`,
        ErrorType.CONFIGURATION,
        ErrorSeverity.CRITICAL,
        false
      );
      this.errorHandler.handle(gameError, 'GameWork.initialize');
      throw gameError;
    }
  }

  // Public API
  getState(): TState {
    return this.stateStore.getState();
  }

  dispatchAction(action: TAction): void {
    try {
      // Validate action
      if (!this.validateAction(action)) {
        throw new Error(`Invalid action: ${action.type}`);
      }

      // Dispatch through event bus
      this.eventBus.emit('game:action', action);
    } catch (error) {
      const gameError = createGameError(
        `Failed to dispatch action: ${error}`,
        ErrorType.GAME_LOGIC,
        ErrorSeverity.MEDIUM,
        true
      );
      this.errorHandler.handle(gameError, 'GameWork.dispatchAction');
    }
  }

  connect(peerId: string): Promise<void> {
    return this.container.resolve<NetworkEngine>(SERVICE_TOKENS.NETWORK_ENGINE).connect(peerId);
  }

  disconnect(peerId: string): void {
    this.container.resolve<NetworkEngine>(SERVICE_TOKENS.NETWORK_ENGINE).disconnect(peerId);
  }

  getRoom(): GameRoom | undefined {
    return this.currentRoom;
  }

  getPlayers(): Player[] {
    return this.currentRoom ? Array.from(this.currentRoom.players.values()) : [];
  }

  isHost(): boolean {
    return this.currentRoom?.host.id === this.config.initialState.id;
  }

  isConnected(): boolean {
    return this.currentRoom !== undefined;
  }

  // Event subscription
  on<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  // Private methods
  private setupContainer(): void {
    // Register core services
    this.container.registerSingleton(SERVICE_TOKENS.STATE_STORE, () => this.stateStore);
    this.container.registerSingleton(SERVICE_TOKENS.EVENT_BUS, () => this.eventBus);
    this.container.registerSingleton(SERVICE_TOKENS.ERROR_HANDLER, () => this.errorHandler);
    this.container.registerSingleton(SERVICE_TOKENS.CONFIG, () => this.config);
  }

  private setupEventHandlers(): void {
    // Game action handling
    this.eventBus.on('game:action', (action: TAction) => {
      this.handleGameAction(action);
    });

    // Network event handling
    this.eventBus.on('network:connected', (peerId: string) => {
      this.handlePlayerConnected(peerId);
    });

    this.eventBus.on('network:disconnected', (peerId: string) => {
      this.handlePlayerDisconnected(peerId);
    });

    this.eventBus.on('network:message', (data: { peerId: string; message: NetworkMessage }) => {
      this.handleNetworkMessage(data.peerId, data.message);
    });

    // Error handling
    this.eventBus.on('error:occurred', (error: Error) => {
      this.handleError(error);
    });
  }

  private setupErrorHandling(): void {
    // Add error listener
    this.errorHandler.addErrorListener((error) => {
      this.eventBus.emit('error:occurred', error);
    });
  }

  private setupStateManagement(): void {
    // Subscribe to state changes
    this.stateStore.subscribe((state) => {
      this.eventBus.emit('game:stateChanged', state);
    });
  }

  private async initializeComponents(): Promise<void> {
    // Initialize game engine
    const gameEngine = this.container.resolve<GameEngine<TState, TAction>>(SERVICE_TOKENS.GAME_ENGINE);
    
    // Initialize UI engine
    const uiEngine = this.container.resolve<UIEngine<TState>>(SERVICE_TOKENS.UI_ENGINE);
    uiEngine.initialize();
    
    // Initialize network engine
    const networkEngine = this.container.resolve<NetworkEngine>(SERVICE_TOKENS.NETWORK_ENGINE);
    
    // Set up network message handling
    networkEngine.onMessage((peerId, message) => {
      this.eventBus.emit('network:message', { peerId, message });
    });
  }

  private handleGameAction(action: TAction): void {
    try {
      const gameEngine = this.container.resolve<GameEngine<TState, TAction>>(SERVICE_TOKENS.GAME_ENGINE);
      const currentState = this.stateStore.getState();
      const newState = gameEngine.processAction(currentState, action);
      this.stateStore.setState(newState);
    } catch (error) {
      const gameError = createGameError(
        `Failed to process game action: ${error}`,
        ErrorType.GAME_LOGIC,
        ErrorSeverity.HIGH,
        false
      );
      this.errorHandler.handle(gameError, 'GameWork.handleGameAction');
    }
  }

  private handlePlayerConnected(peerId: string): void {
    // This would be implemented by the specific game
    console.log(`Player connected: ${peerId}`);
  }

  private handlePlayerDisconnected(peerId: string): void {
    // This would be implemented by the specific game
    console.log(`Player disconnected: ${peerId}`);
  }

  private handleNetworkMessage(peerId: string, message: NetworkMessage): void {
    try {
      // Route message based on type
      switch (message.type) {
        case 'GAME_ACTION':
          this.dispatchAction(message.payload);
          break;
        case 'STATE_UPDATE':
          // Handle state update from network
          break;
        case 'PLAYER_JOIN':
          this.handlePlayerConnected(peerId);
          break;
        case 'PLAYER_LEAVE':
          this.handlePlayerDisconnected(peerId);
          break;
        case 'ROOM_UPDATE':
          this.handleRoomUpdate(message.payload);
          break;
      }
    } catch (error) {
      const gameError = createGameError(
        `Failed to handle network message: ${error}`,
        ErrorType.NETWORK,
        ErrorSeverity.MEDIUM,
        true
      );
      this.errorHandler.handle(gameError, 'GameWork.handleNetworkMessage');
    }
  }

  private handleRoomUpdate(roomData: any): void {
    this.currentRoom = roomData;
    this.eventBus.emit('game:roomUpdated', roomData);
  }

  private handleError(error: Error): void {
    console.error('[GameWork] Error occurred:', error);
  }

  private validateAction(action: TAction): boolean {
    try {
      const gameEngine = this.container.resolve<GameEngine<TState, TAction>>(SERVICE_TOKENS.GAME_ENGINE);
      return gameEngine.validateAction(action);
    } catch (error) {
      return false;
    }
  }
}

// Re-export types for convenience
export * from '../types/GameTypes';
export * from '../types/NetworkTypes';
export * from './StateStore';
export * from './EventBus';
export * from './DIContainer';
export * from './ErrorHandler';
