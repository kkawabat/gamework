import { GameEngine, GameState, GameMove, GameRules, Player } from '../../../src';

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
  private boardElements: HTMLElement[] = [];
  private statusElement: HTMLElement | null = null;
  private currentPlayerElement: HTMLElement | null = null;
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
   * Set UI elements for updates
   */
  setUIElements(boardElements: HTMLElement[], statusElement: HTMLElement | null, currentPlayerElement: HTMLElement | null): void {
    this.boardElements = boardElements;
    this.statusElement = statusElement;
    this.currentPlayerElement = currentPlayerElement;
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
   * Set up event listeners for the new event system
   */
  public setupEventListeners(): void {
    if (!this.gamework) return;

    // Listen for player events
    this.gamework.getEventManager().on('playerJoined', (payload) => {
      console.log(`[TicTacToeEngine] Player joined: ${payload.playerId}`);
      this.addGameLogEntry(`Player joined: ${payload.playerName || payload.playerId}`, 'success');
      this.updateUI();
    });

    this.gamework.getEventManager().on('playerLeft', (payload) => {
      console.log(`[TicTacToeEngine] Player left: ${payload.playerId}`);
      this.addGameLogEntry(`Player left: ${payload.playerId}`, 'warning');
      this.updateUI();
    });

    // Listen for move events
    this.gamework.getEventManager().on('playerMove', (payload) => {
      console.log(`[TicTacToeEngine] Player move: ${payload.playerId} - ${payload.moveType}`);
      this.updateUI();
    });

    this.gamework.getEventManager().on('playerMoveApplied', (payload) => {
      console.log(`[TicTacToeEngine] Move applied: ${payload.playerId}`);
      this.updateUI();
    });

    // Listen for state change events
    this.gamework.getEventManager().on('stateChange', (payload) => {
      console.log(`[TicTacToeEngine] State changed`);
      this.updateUI();
    });

    // Listen for error events
    this.gamework.getEventManager().on('error', (payload) => {
      console.error(`[TicTacToeEngine] Error: ${payload.message}`);
      this.addGameLogEntry(`Error: ${payload.message}`, 'error');
      this.showError(payload.message);
    });

    // Listen for room events
    this.gamework.getEventManager().on('roomCreated', (payload) => {
      console.log(`[TicTacToeEngine] Room created: ${payload.roomId}`);
      this.addGameLogEntry(`Room created: ${payload.roomId}`, 'success');
    });

    this.gamework.getEventManager().on('roomClosed', (payload) => {
      console.log(`[TicTacToeEngine] Room closed: ${payload.roomId}`);
      this.addGameLogEntry(`Room closed: ${payload.roomId}`, 'info');
    });
  }

  /**
   * Update UI based on current game state (RenderingEngine interface)
   */
  public update(): void {
    this.updateUI();
  }

  /**
   * Update UI based on current game state
   */
  public updateUI(): void {
    const state = this.getTicTacToeState();
    
    // Update board
    this.updateBoard(state.board);
    
    // Update status
    this.updateStatus(state);
    
    // Update current player indicator
    this.updateCurrentPlayer(state.currentPlayer);
    
    // Update player count
    this.updatePlayerCount();
  }

  /**
   * Update the game board display
   */
  private updateBoard(board: (string | null)[]): void {
    this.boardElements.forEach((cell, index) => {
      const cellValue = board[index];
      cell.textContent = cellValue || '';
      cell.className = `cell ${cellValue ? `player-${cellValue.toLowerCase()}` : ''}`;
    });
  }

  /**
   * Update the game status
   */
  private updateStatus(state: any): void {
    if (!this.statusElement) return;

    if (state.gameOver) {
      if (state.winner) {
        this.statusElement.textContent = `Player ${state.winner} wins!`;
        this.statusElement.className = 'status winner';
      } else {
        this.statusElement.textContent = "It's a draw!";
        this.statusElement.className = 'status draw';
      }
    } else {
      // Check number of players in room instead of game state
      const playerCount = this.gamework?.getPlayers().length || 0;
      
      if (playerCount < 2) {
        this.statusElement.textContent = 'Waiting for player 2 to join';
        this.statusElement.className = 'status waiting';
      } else if (state.currentPlayer === null) {
        // Both players joined but game hasn't started yet
        this.statusElement.textContent = 'Ready to play! Make the first move';
        this.statusElement.className = 'status ready';
      } else {
        this.statusElement.textContent = `Player ${state.currentPlayer}'s turn`;
        this.statusElement.className = 'status playing';
      }
    }

    // Update player status indicators
    this.updatePlayerStatus();
  }

  /**
   * Update the current player indicator
   */
  private updateCurrentPlayer(currentPlayer: string | null): void {
    if (!this.currentPlayerElement) return;
    
    if (currentPlayer === null) {
      this.currentPlayerElement.textContent = 'Waiting for first move...';
      this.currentPlayerElement.className = 'current-player waiting';
    } else {
      this.currentPlayerElement.textContent = `Current Player: ${currentPlayer}`;
      this.currentPlayerElement.className = `current-player ${currentPlayer.toLowerCase()}`;
    }
  }

  /**
   * Update player status indicators
   */
  private updatePlayerStatus(): void {
    if (!this.gamework) return;
    
    const players = this.gamework.getPlayers();
    const currentPlayerId = this.gamework.getClientPlayer()?.id;
    
    // Update Player 1 (Host) status
    const player1Status = document.getElementById('player1Status');
    if (player1Status) {
      const hostPlayer = players.find(p => p.isHost);
      if (hostPlayer) {
        const role = this.getPlayerRole(hostPlayer.id);
        player1Status.textContent = `Host - ${role ? `Playing as ${role}` : 'Connected'}`;
      } else {
        player1Status.textContent = 'Host - Connecting...';
      }
    }
    
    // Update Player 2 status
    const player2Status = document.getElementById('player2Status');
    if (player2Status) {
      const otherPlayer = players.find(p => !p.isHost);
      if (otherPlayer) {
        const role = this.getPlayerRole(otherPlayer.id);
        player2Status.textContent = `Player 2 - ${role ? `Playing as ${role}` : 'Connected'}`;
      } else {
        player2Status.textContent = 'Waiting for player...';
      }
    }
  }

  /**
   * Update player count display
   */
  private updatePlayerCount(): void {
    const playerCountElement = document.getElementById('playerCount');
    if (playerCountElement && this.gamework) {
      const playerCount = this.gamework.getPlayers().length;
      playerCountElement.textContent = `Players: ${playerCount}`;
    }
  }

  /**
   * Add an entry to the game log
   */
  public addGameLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const gameLogElement = document.getElementById('gameLog');
    if (!gameLogElement) return;

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    gameLogElement.appendChild(logEntry);
    
    // Auto-scroll to bottom
    gameLogElement.scrollTop = gameLogElement.scrollHeight;
  }

  /**
   * Show error message to user
   */
  public showError(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = `Error: ${message}`;
      this.statusElement.className = 'status error';
    }
  }

}
