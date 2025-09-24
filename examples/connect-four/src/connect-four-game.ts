import { GameConfig, GameRules, GameState, GameMove } from 'gamework';

// Connect Four game state
export interface ConnectFourState extends GameState {
  board: (string | null)[][]; // 6x7 grid
  currentPlayer: 'red' | 'yellow';
  winner: string | null;
  gameOver: boolean;
}

// Connect Four move data
export interface ConnectFourMove {
  column: number; // 0-6
}

// Connect Four game rules
export const connectFourRules: GameRules = {
  applyMove: (state: GameState, move: GameMove): GameState => {
    const connectFourState = state as ConnectFourState;
    const moveData = move.data as ConnectFourMove;
    
    const newState: ConnectFourState = {
      ...connectFourState,
      board: connectFourState.board.map(row => [...row])
    };
    
    // Find the lowest empty spot in the column
    const column = moveData.column;
    for (let row = 5; row >= 0; row--) {
      if (newState.board[row][column] === null) {
        newState.board[row][column] = connectFourState.currentPlayer;
        break;
      }
    }
    
    // Switch players
    newState.currentPlayer = connectFourState.currentPlayer === 'red' ? 'yellow' : 'red';
    
    // Check for winner
    newState.winner = checkWinner(newState.board);
    newState.gameOver = newState.winner !== null || isBoardFull(newState.board);
    
    return newState;
  },
  
  isValidMove: (state: GameState, move: GameMove): boolean => {
    const connectFourState = state as ConnectFourState;
    const moveData = move.data as ConnectFourMove;
    
    if (connectFourState.gameOver) return false;
    if (moveData.column < 0 || moveData.column > 6) return false;
    
    // Check if column is not full
    return connectFourState.board[0][moveData.column] === null;
  },
  
  isGameOver: (state: GameState): boolean => {
    return (state as ConnectFourState).gameOver;
  },
  
  getWinner: (state: GameState): string | null => {
    return (state as ConnectFourState).winner;
  }
};

// Initial Connect Four state
export const initialConnectFourState: ConnectFourState = {
  version: 0,
  timestamp: Date.now(),
  board: Array(6).fill(null).map(() => Array(7).fill(null)),
  currentPlayer: 'red',
  winner: null,
  gameOver: false
};

// Game configuration
export const connectFourConfig: GameConfig = {
  gameType: 'connect-four',
  maxPlayers: 2,
  initialState: initialConnectFourState,
  rules: connectFourRules
};

// Helper functions
function checkWinner(board: (string | null)[][]): string | null {
  // Check horizontal
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      const cell = board[row][col];
      if (cell && cell === board[row][col + 1] && cell === board[row][col + 2] && cell === board[row][col + 3]) {
        return cell;
      }
    }
  }
  
  // Check vertical
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = board[row][col];
      if (cell && cell === board[row + 1][col] && cell === board[row + 2][col] && cell === board[row + 3][col]) {
        return cell;
      }
    }
  }
  
  // Check diagonal (top-left to bottom-right)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const cell = board[row][col];
      if (cell && cell === board[row + 1][col + 1] && cell === board[row + 2][col + 2] && cell === board[row + 3][col + 3]) {
        return cell;
      }
    }
  }
  
  // Check diagonal (top-right to bottom-left)
  for (let row = 0; row < 3; row++) {
    for (let col = 3; col < 7; col++) {
      const cell = board[row][col];
      if (cell && cell === board[row + 1][col - 1] && cell === board[row + 2][col - 2] && cell === board[row + 3][col - 3]) {
        return cell;
      }
    }
  }
  
  return null;
}

function isBoardFull(board: (string | null)[][]): boolean {
  return board[0].every(cell => cell !== null);
}
