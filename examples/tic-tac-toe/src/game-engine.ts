import { GameEngine, GameState, GameMove, GameRules, Player } from '../../../client';

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
    
    // Assign roles when players make moves
    if (newState.currentPlayer === null) {
      // First player to move becomes X
      newState.playerRoles[move.playerId] = 'X';
      newState.currentPlayer = 'X';
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
  private gamework: any; // Will be set by the main game class
  private isHost: boolean = false;

  constructor() {
    super(initialTicTacToeState, ticTacToeRules);
  }

  /**
   * Set the GameWork instance for UI updates
   */
  setGameWork(gamework: any): void {
    this.gamework = gamework;
  }

  /**
   * Set host status
   */
  setHostStatus(isHost: boolean): void {
    this.isHost = isHost;
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


  /**
   * Check if the current player can make a move
   */
  private canMakeMove(): boolean {
    const state = this.getTicTacToeState();
    
    // Game is over
    if (state.gameOver) {
      return false;
    }
    
    // For the first move, any player can make it
    if (state.currentPlayer === null) {
      return true;
    }
    
    // For subsequent moves, check if it's the player's turn
    return state.currentPlayer === this.playerSymbol;
  }

    /**
   * Handle cell click
   */
    private handleCellClick(index: number): void {
      if (!this.canMakeMove()) {
        console.log('Cannot make move - not your turn or game over');
        this.uiEngine.addGameLogEntry('Cannot make move - not your turn or game over', 'warning');
        return;
      }
  
      const state = this.getTicTacToeState();
      if (state.board[index] !== null) {
        console.log('Cell already occupied');
        this.uiEngine.addGameLogEntry('Cell already occupied', 'warning');
        return;
      }
  
      // Send move to the game
      const success = this.gamework.sendMove({
        type: 'move',
        playerId: this.gamework.getOwner()?.id || '',
        timestamp: Date.now(),
        data: { position: index }
      });
  
      if (success) {
        console.log(`Move sent: position ${index}`);
        this.uiEngine.addGameLogEntry(`Move made at position ${index}`, 'info');
      } else {
        console.log('Failed to send move');
        this.uiEngine.addGameLogEntry('Move failed', 'error');
      }
    }

}
