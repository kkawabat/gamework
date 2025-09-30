export interface GameConfig {
  gameType: string;
  maxPlayers: number;
  initialState: any;
  rules: GameRules;
}

export interface GameRules {
  applyMove: (state: any, move: any) => any;
  isValidMove: (state: any, move: any) => boolean;
  isGameOver: (state: any) => boolean;
  getWinner?: (state: any) => string | null;
}


/**
 * GameEngine - Base class for game logic
 * 
 * Developers extend this class to implement their game logic.
 * GameWork handles all networking, this class focuses purely on game rules.
 */
export abstract class GameEngine {
  protected state: any;
  protected rules: GameRules;
  protected gameWork: any; // Will be typed as GameWork to avoid circular imports

  constructor(initialState: any, rules: GameRules) {
    this.state = initialState;
    this.rules = rules;
  }

  /**
   * Set the GameWork instance for the game engine
   */
  setGameWork(gameWork: any): void {
    this.gameWork = gameWork;
  }

  getCurrentState(): any {
    return this.state;
  }

  getRules(): GameRules {
    return this.rules;
  }

  // Event handler methods that match the event system
  onStateChange?(payload: any): void;
  onPlayerMoveApplied?(payload: any): void;
  onTurnChange?(payload: { currentPlayerId: string }): void;
  onGameOver?(payload: { winnerId?: string, scores: Record<string, number> }): void;
  onScoreUpdate?(payload: { scores: Record<string, number> }): void;
  onEntitySpawned?(payload: { entityId: string, type: string, position: { x: number, y: number } }): void;
  onEntityRemoved?(payload: { entityId: string }): void;
  onError?(payload: { code: string, message: string }): void;

}