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
    console.log('[TicTacToeGameWork] initializeGame() called');
    
    // Initialize game-specific components
    console.log('[TicTacToeGameWork] Creating TicTacToeEngine');
    this.gameEngine = new TicTacToeEngine();
    console.log('[TicTacToeGameWork] Creating TicTacToeUIEngine');
    this.uiEngine = new TicTacToeUIEngine();
    
    // Set GameWork reference in engines
    console.log('[TicTacToeGameWork] Setting GameWork reference in engines');
    this.gameEngine.setGameWork(this);
    this.uiEngine.setGameWork(this);
    
    // Initialize complete state in GameWork
    console.log('[TicTacToeGameWork] Initializing state');
    this.state = {
      // Base GameWork properties
      room: undefined,
      
      
      // TicTacToe-specific properties from engine
      ...TicTacToeEngine.getInitialGameState()
    } as TicTacToeState;
    
    console.log('[TicTacToeGameWork] Initial state:', this.state);
    
    // Initialize UI event handlers
    console.log('[TicTacToeGameWork] Initializing UI engine');
    this.uiEngine.initialize();

    // Initialize UI with initial game state
    console.log('[TicTacToeGameWork] Updating UI with initial state');
    this.uiEngine.updateState(this.state);
    
    console.log('[TicTacToeGameWork] initializeGame() complete');
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
}
