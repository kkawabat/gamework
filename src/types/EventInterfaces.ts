/**
 * Event System Interfaces
 * 
 * Defines the core interfaces for the new event handling system
 */

export interface PlayerMove {
  playerId: string;
  moveType: string;
  payload: any;      // move-specific data
  timestamp: number;
  moveId?: string;
}

export interface GameState {
  board: any[];
  players: { id: string, score: number }[];
  turn: string;
  timestamp: number;
}

export interface StateChange {
  changes: Partial<GameState>;
  events?: string[];
  timestamp: number;
}

/**
 * NetworkEngine Events
 */
export interface NetworkEngineEvents {
  playerMove: PlayerMove;
  playerJoined: { playerId: string, playerName?: string };
  playerLeft: { playerId: string };
  roomCreated: { roomId: string, hostId: string };
  roomClosed: { roomId: string };
  connectionLost: { playerId?: string, reason?: string };
  connectionRestored: { playerId?: string };
  chatMessage: { playerId: string, message: string };
  error: { code: string, message: string };
}

/**
 * GameEngine Events
 */
export interface GameEngineEvents {
  stateChange: GameState | StateChange;
  playerMoveApplied: PlayerMove;
  turnChange: { currentPlayerId: string };
  gameOver: { winnerId?: string, scores: Record<string, number> };
  scoreUpdate: { scores: Record<string, number> };
  entitySpawned: { entityId: string, type: string, position: { x: number, y: number } };
  entityRemoved: { entityId: string };
  error: { code: string, message: string };
}

/**
 * RenderEngine Events
 */
export interface RenderEngineEvents {
  renderComplete: { frameTime: number };
  animationEnd: { animationId: string };
  uiInteraction: { elementId: string, action: string };
}

/**
 * Event Listeners Map
 */
export interface EventListeners {
  // NetworkEngine Events
  playerMove: ('GameEngine' | 'RenderEngine')[];
  playerJoined: ('GameEngine' | 'RenderEngine')[];
  playerLeft: ('GameEngine' | 'RenderEngine')[];
  roomCreated: ('GameWork')[];
  roomClosed: ('GameWork' | 'RenderEngine')[];
  connectionLost: ('GameWork' | 'RenderEngine')[];
  connectionRestored: ('GameWork')[];
  chatMessage: ('RenderEngine')[];

  // GameEngine Events
  stateChange: ('RenderEngine' | 'NetworkEngine')[];
  playerMoveApplied: ('RenderEngine')[];
  turnChange: ('RenderEngine' | 'NetworkEngine')[];
  gameOver: ('RenderEngine' | 'NetworkEngine')[];
  scoreUpdate: ('RenderEngine')[];
  
  // RenderEngine Events
  renderComplete: ('GameWork' | 'GameEngine')[];
  animationEnd: ('GameEngine' | 'GameWork')[];
  uiInteraction: ('NetworkEngine' | 'GameEngine')[];

  error: ('GameWork' | 'RenderEngine' | 'GameEngine')[];
}
