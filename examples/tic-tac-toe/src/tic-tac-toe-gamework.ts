import { GameWork } from '../../../client';
import { TicTacToeEngine } from './game-engine';
import { TicTacToeUIEngine } from './ui-engine';
import { TicTacToeState, TicTacToeAction } from './game-engine';
import { PlayerAction } from '../../../client/events/EventFlow';
import { v4 as uuidv4 } from 'uuid';

/**
 * TicTacToeGameWork - Game-specific implementation of GameWork
 * 
 * This demonstrates the new pattern where you extend GameWork
 * instead of passing engines to a generic GameWork class.
 */
export class TicTacToeGameWork extends GameWork<TicTacToeState> {

  constructor(config?: any) {
    super(config);
  }

  // === GAME-SPECIFIC IMPLEMENTATION ===
  
  protected initializeGame(): void {
    // Initialize game-specific components
    this.gameEngine = new TicTacToeEngine();
    this.uiEngine = new TicTacToeUIEngine();
    
    // Set GameWork reference in engines
    this.gameEngine.setGameWork(this);
    this.uiEngine.setGameWork(this);
    
    // Initialize complete state in GameWork
    this.state = {
      // Base GameWork properties
      room: undefined,
      owner: {
        id: this.generatePlayerId(),
        name: 'Host',
        lastSeen: Date.now()
      },
      
      // TicTacToe-specific properties from engine
      ...TicTacToeEngine.getInitialGameState()
    } as TicTacToeState;
    
    // Initialize UI with initial game state
    this.uiEngine.updateState(this.state);
  }

  protected getInitialGameState(): TicTacToeState {
    return this.state;
  }

  protected handlePlayerAction(action: PlayerAction): TicTacToeState {
    // Convert generic PlayerAction to TicTacToeAction
    const ticTacToeAction: TicTacToeAction = {
      action: action.action,
      playerId: action.playerId,
      input: action.input
    };
    
    // Process action using game engine
    const newState = this.gameEngine.processAction(this.state, ticTacToeAction);
    
    return newState;
  }

  protected handleGameUpdate(gameState: TicTacToeState, deltaTime: number): TicTacToeState {
    // TicTacToe doesn't need continuous updates
    return gameState;
  }

  // === GAME-SPECIFIC METHODS ===
  
  /**
   * Initialize the game (public method for external use)
   */
  initialize(): void {
    // This method is called from main.ts
    // The actual initialization is done in initializeGame()
  }
  
  /**
   * Get the TicTacToe-specific game state
   */
  getTicTacToeState(): TicTacToeState {
    return this.state;
  }

  /**
   * Make a move on the board
   */
  makeMove(position: number, playerId: string): void {
    const action: TicTacToeAction = {
      action: 'PlayerMove',
      playerId: playerId,
      input: { position }
    };
    
    this.processPlayerAction(action);
  }

  /**
   * Restart the game
   */
  restartGame(playerId: string): void {
    const action: TicTacToeAction = {
      action: 'RestartGame',
      playerId: playerId
    };
    
    this.processPlayerAction(action);
  }

  /**
   * Generate a unique player ID
   */
  private generatePlayerId(): string {
    return uuidv4();
  }
}
