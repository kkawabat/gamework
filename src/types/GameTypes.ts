/**
 * GameTypes - Core type definitions for GameWork v2
 * 
 * Provides strong typing for:
 * - Game state interfaces
 * - Action types
 * - Configuration types
 * - Network types
 */

// Base game state interface
export interface BaseGameState {
  id: string;
  timestamp: number;
  version: number;
}

// Game action interface
export interface GameAction {
  type: string;
  playerId: string;
  timestamp: number;
  payload?: any;
}

// Game configuration
export interface GameConfig<TState extends BaseGameState, TAction extends GameAction> {
  initialState: TState;
  maxPlayers: number;
  gameName: string;
  version: string;
  debugMode: boolean;
}

// Player information
export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  lastSeen: number;
}

// Room information
export interface GameRoom {
  id: string;
  roomCode: string;
  host: Player;
  players: Map<string, Player>;
  gameState: string;
  maxPlayers: number;
  createdAt: number;
}

// Network message types
export interface NetworkMessage {
  type: 'GAME_ACTION' | 'STATE_UPDATE' | 'PLAYER_JOIN' | 'PLAYER_LEAVE' | 'ROOM_UPDATE';
  payload: any;
  from: string;
  to?: string;
  timestamp: number;
}

// Event types
export interface GameEvents {
  'game:action': GameAction;
  'game:stateChanged': BaseGameState;
  'game:playerJoined': Player;
  'game:playerLeft': Player;
  'network:connected': string;
  'network:disconnected': string;
  'network:message': NetworkMessage;
  'ui:rendered': void;
  'error:occurred': Error;
}

// Engine interfaces
export interface GameEngine<TState extends BaseGameState, TAction extends GameAction> {
  processAction(state: TState, action: TAction): TState;
  update(state: TState, deltaTime: number): TState;
  validateAction(action: TAction): boolean;
  getInitialState(): TState;
}

export interface UIEngine<TState extends BaseGameState> {
  render(state: TState): void;
  initialize(): void;
  destroy(): void;
  updateRoom(room: GameRoom): void;
}

export interface NetworkEngine {
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): void;
  sendMessage(peerId: string, message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
  onMessage(callback: (peerId: string, message: NetworkMessage) => void): () => void;
}

// Main GameWork interface
export interface GameWork<TState extends BaseGameState, TAction extends GameAction> {
  getState(): TState;
  dispatchAction(action: TAction): void;
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): void;
  getRoom(): GameRoom | undefined;
  getPlayers(): Player[];
  isHost(): boolean;
  isConnected(): boolean;
}

// Utility types
export type EventName = keyof GameEvents;
export type EventPayload<T extends EventName> = GameEvents[T];

// Type guards
export function isGameAction(obj: any): obj is GameAction {
  return obj && typeof obj.type === 'string' && typeof obj.playerId === 'string' && typeof obj.timestamp === 'number';
}

export function isNetworkMessage(obj: any): obj is NetworkMessage {
  return obj && typeof obj.type === 'string' && typeof obj.from === 'string' && typeof obj.timestamp === 'number';
}

export function isPlayer(obj: any): obj is Player {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string' && typeof obj.isHost === 'boolean';
}
