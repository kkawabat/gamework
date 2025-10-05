import {GameState, PlayerAction, StateChange} from '../../../client/events/EventFlow';

import {GameEngine} from '../../../client/core/GameEngine';

// Tic-Tac-Toe game state
export interface TicTacToeState extends GameState {
  stage: 'playing' | 'gameOver';
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
    super(TicTacToeEngine.getInitialState());
  }

  static getInitialState(): TicTacToeState {
    return {
      stage: 'playing',
      tick: 0,
      players: {},
      gameData: {
        board: Array(9).fill(null),
        currentPlayer: null,
        gameOver: false,
        winner: null
      }
    } as TicTacToeState
  }


  applyAction(action: TicTacToeAction): TicTacToeState {
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
}
