import { GameState, GameMove, GameRules, GameMessage, StateMessage, InputMessage } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class GameEngine {
  private currentState: GameState;
  private rules: GameRules;
  private moveHistory: GameMove[] = [];
  private versionCounter = 0;

  constructor(initialState: GameState, rules: GameRules) {
    this.currentState = { ...initialState, version: 0, timestamp: Date.now() };
    this.rules = rules;
  }

  getCurrentState(): GameState {
    return { ...this.currentState };
  }

  getMoveHistory(): GameMove[] {
    return [...this.moveHistory];
  }

  getCurrentVersion(): number {
    return this.currentState.version;
  }

  applyMove(move: GameMove): GameState | null {
    // Validate the move
    if (!this.rules.isValidMove(this.currentState, move)) {
      return null;
    }

    // Apply the move using the reducer
    const newState = this.rules.applyMove(this.currentState, move);
    
    // Update version and timestamp
    newState.version = this.currentState.version + 1;
    newState.timestamp = Date.now();

    // Store the move in history
    this.moveHistory.push(move);

    // Update current state
    this.currentState = newState;

    return newState;
  }

  isGameOver(): boolean {
    return this.rules.isGameOver(this.currentState);
  }

  getWinner(): string | null {
    return this.rules.getWinner ? this.rules.getWinner(this.currentState) : null;
  }

  createStateMessage(isFullSnapshot: boolean = false, lastMoveId?: string): StateMessage {
    return {
      type: 'state',
      payload: {
        state: this.getCurrentState(),
        isFullSnapshot,
        lastMoveId
      },
      timestamp: Date.now(),
      messageId: uuidv4()
    };
  }

  createInputMessage(playerId: string, moveType: string, moveData: any): InputMessage {
    const move: GameMove = {
      type: moveType,
      playerId,
      timestamp: Date.now(),
      data: moveData
    };

    return {
      type: 'input',
      payload: move,
      timestamp: Date.now(),
      messageId: uuidv4()
    };
  }

  exportState(): string {
    return JSON.stringify({
      state: this.currentState,
      moveHistory: this.moveHistory,
      version: this.currentState.version
    });
  }

  importState(exportedState: string): boolean {
    try {
      const data = JSON.parse(exportedState);
      this.currentState = data.state;
      this.moveHistory = data.moveHistory || [];
      this.versionCounter = data.version || 0;
      return true;
    } catch (error) {
      console.error('Failed to import state:', error);
      return false;
    }
  }

  resetToState(state: GameState): void {
    this.currentState = { ...state };
    this.versionCounter = state.version;
    this.moveHistory = [];
  }

  // Utility method to get state at a specific version
  getStateAtVersion(targetVersion: number): GameState | null {
    if (targetVersion === this.currentState.version) {
      return this.getCurrentState();
    }

    if (targetVersion === 0) {
      // Return initial state
      const initialState = { ...this.currentState };
      initialState.version = 0;
      initialState.timestamp = this.currentState.timestamp;
      return initialState;
    }

    // For now, we only support current version and initial state
    // In a more sophisticated implementation, you could store intermediate states
    // or replay moves to get to a specific version
    return null;
  }
}

