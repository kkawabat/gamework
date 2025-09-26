import { GameState, GameMove, GameRules } from '../types';

/**
 * GameEngine - Base class for game logic
 * 
 * Developers extend this class to implement their game logic.
 * GameWork handles all networking, this class focuses purely on game rules.
 */
export abstract class GameEngine {
  protected state: GameState;
  protected rules: GameRules;

  constructor(initialState: GameState, rules: GameRules) {
    this.state = initialState;
    this.rules = rules;
  }

  /**
   * Apply a move to the game state
   */
  applyMove(move: GameMove): GameState | null {
    // Validate the move
    if (!this.rules.isValidMove(this.state, move)) {
      console.warn(`[GameEngine] Invalid move:`, move);
      return null;
    }

    // Apply the move
    const newState = this.rules.applyMove(this.state, move);
    
    // Update internal state
    this.state = newState;
    
    console.log(`[GameEngine] Move applied successfully`);
    return newState;
  }

  /**
   * Get the current game state
   */
  getCurrentState(): GameState {
    return this.state;
  }

  /**
   * Check if the game is over
   */
  isGameOver(): boolean {
    return this.rules.isGameOver(this.state);
  }

  /**
   * Get the winner (if game is over)
   */
  getWinner(): string | null {
    return this.rules.getWinner?.(this.state) || null;
  }

  /**
   * Get the game type (optional)
   */
  getGameType?(): string;

  /**
   * Get maximum players (optional)
   */
  getMaxPlayers?(): number;

  /**
   * Get player role based on game rules (optional)
   */
  getPlayerRole?(playerId: string): string;

  /**
   * Check if a player can make a specific move (optional)
   */
  canPlayerMakeMove?(playerId: string, move: GameMove): boolean;

  /**
   * Export game state for persistence (optional)
   */
  exportState?(): string;

  /**
   * Import game state from persistence (optional)
   */
  importState?(exportedState: string): boolean;
}