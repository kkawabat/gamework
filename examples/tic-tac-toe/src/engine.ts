import { GameEngine, GameState, GameMove, GameRules } from '../../../src';

// Tic-Tac-Toe game state
export interface TicTacToeState extends GameState {
  board: (string | null)[];
  currentPlayer: string | null;
  winner: string | null;
  gameOver: boolean;
  playerRoles: { [playerId: string]: string };
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
      playerRoles: { ...ticTacToeState.playerRoles },
      version: ticTacToeState.version + 1,
      timestamp: Date.now()
    };
    
    // Assign roles if this is the first move
    if (newState.currentPlayer === null) {
      // First player to move becomes X
      newState.playerRoles[move.playerId] = 'X';
      newState.currentPlayer = 'X';
    } else {
      // Assign O to the second player if they don't have a role yet
      if (!newState.playerRoles[move.playerId]) {
        newState.playerRoles[move.playerId] = 'O';
      }
    }
    
    // Apply the move with player's symbol
    const playerSymbol = newState.playerRoles[move.playerId];
    if (newState.board[moveData.position] === null) {
      newState.board[moveData.position] = playerSymbol;
    }
    
    // Toggle to next player for the next turn
    newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
    
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
    
    // For the first move, any player can make it
    if (ticTacToeState.currentPlayer === null) {
      return true;
    }
    
    // For subsequent moves, check if it's the player's turn
    const playerSymbol = ticTacToeState.playerRoles[move.playerId];
    return playerSymbol === ticTacToeState.currentPlayer;
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
  currentPlayer: null,
  winner: null,
  gameOver: false,
  playerRoles: {}
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

  getPlayerRole(playerId: string): string | null {
    const state = this.getTicTacToeState();
    return state.playerRoles[playerId] || null;
  }

  canPlayerMakeMove(playerId: string, move: GameMove): boolean {
    const state = this.getCurrentState() as TicTacToeState;
    
    // For the first move, any player can make it
    if (state.currentPlayer === null) {
      return this.rules.isValidMove(state, move);
    }
    
    // For subsequent moves, check if it's the player's turn
    const playerRole = this.getPlayerRole(playerId);
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
  getCurrentPlayerSymbol(): string | null {
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
