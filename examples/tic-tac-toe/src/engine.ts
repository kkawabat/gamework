import { GameEngine, GameState, GameMove, GameRules } from '../../../src';

// Tic-Tac-Toe game state
export interface TicTacToeState extends GameState {
  board: (string | null)[];
  currentPlayer: string;
  winner: string | null;
  gameOver: boolean;
}

// Tic-Tac-Toe move data
export interface TicTacToeMove {
  position: number;
}

// Tic-Tac-Toe game rules
const ticTacToeRules: GameRules = {
  applyMove: (state: GameState, move: GameMove): GameState => {
    const ticTacToeState = state as TicTacToeState;
    const moveData = move.data as TicTacToeMove;
    
    // Create new state
    const newState: TicTacToeState = {
      ...ticTacToeState,
      board: [...ticTacToeState.board],
      currentPlayer: ticTacToeState.currentPlayer,
      version: ticTacToeState.version + 1,
      timestamp: Date.now()
    };
    
    // Apply the move with current player's symbol
    if (newState.board[moveData.position] === null) {
      newState.board[moveData.position] = ticTacToeState.currentPlayer;
    }
    
    // Toggle to next player for the next turn
    newState.currentPlayer = ticTacToeState.currentPlayer === 'X' ? 'O' : 'X';
    
    // Check for winner
    newState.winner = checkWinner(newState.board);
    newState.gameOver = newState.winner !== null || isBoardFull(newState.board);
    
    return newState;
  },
  
  isValidMove: (state: GameState, move: GameMove): boolean => {
    const ticTacToeState = state as TicTacToeState;
    const moveData = move.data as TicTacToeMove;
    
    // Check if game is over
    if (ticTacToeState.gameOver) {
      return false;
    }
    
    // Check if position is valid
    if (moveData.position < 0 || moveData.position >= 9) {
      return false;
    }
    
    // Check if position is empty
    if (ticTacToeState.board[moveData.position] !== null) {
      return false;
    }
    
    return true;
  },
  
  isGameOver: (state: GameState): boolean => {
    const ticTacToeState = state as TicTacToeState;
    return ticTacToeState.gameOver;
  },
  
  getWinner: (state: GameState): string | null => {
    const ticTacToeState = state as TicTacToeState;
    return ticTacToeState.winner;
  }
};

// Helper functions
function checkWinner(board: (string | null)[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];
  
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  
  return null;
}

function isBoardFull(board: (string | null)[]): boolean {
  return board.every(cell => cell !== null);
}

// Initial game state
const initialTicTacToeState: TicTacToeState = {
  version: 0,
  timestamp: Date.now(),
  board: Array(9).fill(null),
  currentPlayer: 'X',
  winner: null,
  gameOver: false
};

/**
 * Tic-Tac-Toe Game Engine
 * Extends the base GameEngine with Tic-Tac-Toe specific logic
 */
export class TicTacToeEngine extends GameEngine {
  constructor() {
    super(initialTicTacToeState, ticTacToeRules);
  }

  getGameType(): string {
    return 'tic-tac-toe';
  }

  getMaxPlayers(): number {
    return 2;
  }

  getPlayerRole(playerId: string): string {
    // First player is X, second is O
    const players = Array.from(this.getCurrentState().board).filter(cell => cell !== null);
    return players.length === 0 ? 'X' : 'O';
  }

  canPlayerMakeMove(playerId: string, move: GameMove): boolean {
    const state = this.getCurrentState() as TicTacToeState;
    const playerRole = this.getPlayerRole(playerId);
    
    // Check if it's the player's turn
    return playerRole === state.currentPlayer && this.rules.isValidMove(state, move);
  }

  /**
   * Get the current game state as TicTacToeState
   */
  getTicTacToeState(): TicTacToeState {
    return this.getCurrentState() as TicTacToeState;
  }

  /**
   * Check if the game is a draw
   */
  isDraw(): boolean {
    const state = this.getTicTacToeState();
    return state.gameOver && state.winner === null;
  }

  /**
   * Get the current player symbol
   */
  getCurrentPlayerSymbol(): string {
    return this.getTicTacToeState().currentPlayer;
  }

  /**
   * Get the board as a 2D array for easier rendering
   */
  getBoard2D(): (string | null)[][] {
    const board = this.getTicTacToeState().board;
    return [
      [board[0], board[1], board[2]],
      [board[3], board[4], board[5]],
      [board[6], board[7], board[8]]
    ];
  }
}
