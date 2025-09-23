import { GameConfig, GameRules, GameState, GameMove } from '../types';

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
export const ticTacToeRules: GameRules = {
  applyMove: (state: GameState, move: GameMove): GameState => {
    const ticTacToeState = state as TicTacToeState;
    const moveData = move.data as TicTacToeMove;
    
    // Create new state
    const newState: TicTacToeState = {
      ...ticTacToeState,
      board: [...ticTacToeState.board],
      currentPlayer: ticTacToeState.currentPlayer // Keep current player for this move
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
    
    // Check if it's the player's turn
    // The currentPlayer field indicates whose turn it is ('X' or 'O')
    // We need to check if the move is from the correct player for this turn
    // This validation should be done by the game host, not here
    // For now, just return true - the host will validate the player
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
export const initialTicTacToeState: TicTacToeState = {
  version: 0,
  timestamp: Date.now(),
  board: Array(9).fill(null),
  currentPlayer: 'X',
  winner: null,
  gameOver: false
};

// Game configuration
export const ticTacToeConfig: GameConfig = {
  gameType: 'tic-tac-toe',
  maxPlayers: 2,
  initialState: initialTicTacToeState,
  rules: ticTacToeRules
};

