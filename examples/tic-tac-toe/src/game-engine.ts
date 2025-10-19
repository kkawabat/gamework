import {PlayerAction, StateChange} from '../../../client/events/EventFlow';
import {GameEngine} from '../../../client/core/GameEngine';
import { GameRoom } from '../../../shared/signaling-types';

// Tic-Tac-Toe game state extends BaseGameWorkState
export interface TicTacToeState {
  // Base GameWork properties
  room?: GameRoom;  // Single source of truth for all connection info
  
  // TicTacToe-specific properties
  stage: 'playing' | 'gameOver';
  tick: number;            // current game tick
  players: {
    [playerId: string]: {
      symbol: 'X' | 'O' | null;
    };
  };
  gameData: {
    board: ('X' | 'O' | null)[];
    currentPlayer: 'X' | 'O' | null;
    gameOver: boolean;
    winner: 'X' | 'O' | null;
  }
}

// Tic-Tac-Toe move data
export interface TicTacToeAction extends PlayerAction {
  input?: PlayerAction["input"] & {
    position?: number
  };
}

/**
 * Tic-Tac-Toe Game Engine
 * Extends the base GameEngine with Tic-Tac-Toe specific logic
 */
export class TicTacToeEngine extends GameEngine<TicTacToeState, TicTacToeAction> {
  constructor() {
    // Initialize with minimal state - GameWork will provide complete state
    super({
      stage: 'playing',
      tick: 0,
      players: {},
      gameData: {
        board: Array(9).fill(null),
        currentPlayer: null,
        gameOver: false,
        winner: null
      }
    } as TicTacToeState);
  }

  static getInitialGameState(): Partial<TicTacToeState> {
    return {
      // Only TicTacToe-specific properties
      stage: 'playing',
      tick: 0,
      players: {},
      gameData: {
        board: Array(9).fill(null),
        currentPlayer: null,
        gameOver: false,
        winner: null
      }
    }
  }


  applyAction(action: TicTacToeAction): TicTacToeState {

    switch (action.action) {
      case 'PlayerMove':
        return this.applyPlayerMove(action);
      case 'RestartGame':
        return this.applyRestartGame();
      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }

  applyStateChange(stateChange: StateChange): TicTacToeState {
    // For TicTacToe, state changes are handled through actions
    // This method is required by the base class but not used in TicTacToe
    return this.state;
  }

  applyPlayerMove(action: TicTacToeAction): TicTacToeState {
    let newState = structuredClone(this.state as TicTacToeState);

    const player = newState.players[action.playerId];
    const cur = newState.gameData.currentPlayer;
    const sym: 'X' | 'O' | null = player.symbol;
    
    // Same logic as your if/else, just condensed:
    const next: 'X' | 'O' =
      cur === null
        ? (sym === null ? 'X' : 'O')
        : (sym === null ? 'O' : 'X');
    
    newState.gameData.currentPlayer = next;
    player.symbol = next;

    const pos = action.input?.position;
    if (pos != null) {
      newState.gameData.board[pos] = next;
    }

    newState = this.updateState(newState)

    return newState;
  };

  applyRestartGame(): TicTacToeState {
    return {
      ...this.state,
      ...TicTacToeEngine.getInitialGameState()
    } as TicTacToeState;
  }

  updateState(state: TicTacToeState): TicTacToeState {
    state.gameData.currentPlayer = state.gameData.currentPlayer === 'X' ? 'O' : 'X'
    state.tick = state.tick + 1
    const winner = this.getWinner(state.gameData.board)
    const gameOver = winner !== null || this.isBoardFull(state.gameData.board)

    if (gameOver) {
      state.stage = 'gameOver'
      state.gameData.winner = winner
      state.gameData.gameOver = gameOver
    }
    else {
      state.stage = 'playing'
    }

    return state
  }

  WINNING_LINES: [number, number, number][] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6],            // diagonals
  ];
  

  getWinner(board: ('X' | 'O' | null)[]): 'X' | 'O' | null {
    
    this.WINNING_LINES.forEach(line => {
      const [a, b, c] = line
      if (board[a] && board[a] === board[b] && board[b] === board[c] && board[a] !== null) {
        return board[a]
      }
    })
    return null;
  }


  isBoardFull(board: ('X' | 'O' | null)[]): boolean {
    return board.every(cell => cell !== null)
  }

  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Process player action - called directly by GameWork
   */
  processAction(gameState: TicTacToeState, action: TicTacToeAction): TicTacToeState {
    return this.applyAction(action);
  }
  
  /**
   * Update game state - called directly by GameWork
   */
  update(gameState: TicTacToeState, deltaTime: number): TicTacToeState {
    // TicTacToe doesn't need continuous updates, just return current state
    return gameState;
  }
}
