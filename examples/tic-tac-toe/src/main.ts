import { GameWork } from '../../../src';
import { TicTacToeEngine } from './engine';

/**
 * Tic-Tac-Toe Game Manager
 * Handles UI initialization, game state updates, and user interactions
 */
export class TicTacToeGame {
  private gamework: GameWork;
  private engine: TicTacToeEngine;
  private boardElements: HTMLElement[] = [];
  private statusElement: HTMLElement | null = null;
  private currentPlayerElement: HTMLElement | null = null;
  private isHost: boolean = false;
  private playerSymbol: string = '';

  constructor() {
    this.engine = new TicTacToeEngine();
    this.gamework = new GameWork(this.engine, {
      roomId: this.getRoomId(),
      playerName: this.getPlayerName()
    });
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the game on page load
   */
  async initialize(): Promise<void> {
    console.log('Initializing Tic-Tac-Toe game...');
    
    // Initialize UI elements
    this.initializeUI();
    
    // Connect to the game
    await this.gamework.start();
    
    // Determine if this player is the host
    this.isHost = this.gamework.getCurrentPlayer()?.isHost || false;
    this.playerSymbol = this.engine.getPlayerRole(this.gamework.getCurrentPlayer()?.id || '');
    
    console.log(`Player role: ${this.playerSymbol}, Is host: ${this.isHost}`);
    
    // Update UI with initial state
    this.updateUI();
  }

  /**
   * Initialize UI elements and event listeners
   */
  private initializeUI(): void {
    // Get board elements
    this.boardElements = Array.from(document.querySelectorAll('.cell'));
    
    // Get status elements
    this.statusElement = document.getElementById('status');
    this.currentPlayerElement = document.getElementById('current-player');
    
    // Add click listeners to board cells
    this.boardElements.forEach((cell, index) => {
      cell.addEventListener('click', () => this.handleCellClick(index));
    });
    
    // Add restart button listener
    const restartButton = document.getElementById('restart');
    if (restartButton) {
      restartButton.addEventListener('click', () => this.restartGame());
    }
    
    // Add host controls if this player is the host
    if (this.isHost) {
      this.setupHostControls();
    }
  }

  /**
   * Handle cell click
   */
  private handleCellClick(index: number): void {
    if (!this.canMakeMove()) {
      console.log('Cannot make move - not your turn or game over');
      return;
    }

    const state = this.engine.getTicTacToeState();
    if (state.board[index] !== null) {
      console.log('Cell already occupied');
      return;
    }

    // Send move to the game
    const success = this.gamework.sendMove({
      type: 'move',
      playerId: this.gamework.getCurrentPlayer()?.id || '',
      timestamp: Date.now(),
      data: { position: index }
    });

    if (success) {
      console.log(`Move sent: position ${index}`);
    } else {
      console.log('Failed to send move');
    }
  }

  /**
   * Check if the current player can make a move
   */
  private canMakeMove(): boolean {
    const state = this.engine.getTicTacToeState();
    return !state.gameOver && state.currentPlayer === this.playerSymbol;
  }

  /**
   * Update UI based on current game state
   */
  private updateUI(): void {
    const state = this.engine.getTicTacToeState();
    
    // Update board
    this.updateBoard(state.board);
    
    // Update status
    this.updateStatus(state);
    
    // Update current player indicator
    this.updateCurrentPlayer(state.currentPlayer);
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
      this.statusElement.textContent = `Player ${state.currentPlayer}'s turn`;
      this.statusElement.className = 'status playing';
    }
  }

  /**
   * Update the current player indicator
   */
  private updateCurrentPlayer(currentPlayer: string): void {
    if (!this.currentPlayerElement) return;
    
    this.currentPlayerElement.textContent = `Current Player: ${currentPlayer}`;
    this.currentPlayerElement.className = `current-player ${currentPlayer.toLowerCase()}`;
  }

  /**
   * Setup event handlers for GameWork
   */
  private setupEventHandlers(): void {
    this.gamework.setEvents({
      onPlayerJoin: (player) => {
        console.log(`Player joined: ${player.name}`);
        this.updateUI();
      },
      
      onPlayerLeave: (playerId) => {
        console.log(`Player left: ${playerId}`);
        this.updateUI();
      },
      
      onStateUpdate: (state) => {
        console.log('Game state updated');
        this.updateUI();
      },
      
      onError: (error) => {
        console.error('Game error:', error);
        this.showError(error.message);
      }
    });
  }

  /**
   * Setup host-specific controls
   */
  private setupHostControls(): void {
    // Add host-specific UI elements or functionality
    console.log('Setting up host controls');
  }

  /**
   * Restart the game (host only)
   */
  private restartGame(): void {
    if (!this.isHost) {
      console.log('Only the host can restart the game');
      return;
    }

    // Reset the game engine
    this.engine = new TicTacToeEngine();
    
    // Update UI
    this.updateUI();
    
    console.log('Game restarted');
  }

  /**
   * Show error message to user
   */
  private showError(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = `Error: ${message}`;
      this.statusElement.className = 'status error';
    }
  }

  /**
   * Get room ID from URL or generate one
   */
  private getRoomId(): string {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    return roomId || `room-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get player name from input or generate one
   */
  private getPlayerName(): string {
    const nameInput = document.getElementById('player-name') as HTMLInputElement;
    return nameInput?.value || `Player ${Math.random().toString(36).substr(2, 4)}`;
  }

  /**
   * Get game statistics
   */
  getGameStats(): any {
    return {
      players: this.gamework.getPlayers(),
      currentState: this.engine.getTicTacToeState(),
      isHost: this.isHost,
      playerSymbol: this.playerSymbol
    };
  }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const game = new TicTacToeGame();
    await game.initialize();
    
    // Make game available globally for debugging
    (window as any).ticTacToeGame = game;
    
    console.log('Tic-Tac-Toe game initialized successfully');
  } catch (error) {
    console.error('Failed to initialize game:', error);
    
    // Show error to user
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = 'Failed to initialize game. Please refresh the page.';
      statusElement.className = 'status error';
    }
  }
});
