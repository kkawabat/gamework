import { GameWork } from '../../../src';
import { TicTacToeEngine } from './engine';
import { generateQRCode, formatRoomId } from '../../../src/utils';

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
    this.gamework = new GameWork(this.engine, {});
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the game on page load
   */
  async initialize(): Promise<void> {
    console.log('Initializing Tic-Tac-Toe game...');
    
    // Initialize UI elements
    this.initializeUI();
    
    // Check if joining an existing room via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    let roomId: string;
    
    if (roomParam) {
      // Join existing room
      console.log(`Joining existing room: ${roomParam}`);
      roomId = roomParam;
      // Note: In a real implementation, you'd need a joinRoom method
      // For now, we'll still host a room but show the room code
    } else {
      // Host a new room
      roomId = await this.gamework.hostRoom();
    }
    
    // Determine if this player is the host
    this.isHost = this.gamework.getCurrentPlayer()?.isHost || false;
    this.playerSymbol = this.engine.getPlayerRole(this.gamework.getCurrentPlayer()?.id || '') || '';
    
    console.log(`Room Code: ${roomId.substring(0, 6).toUpperCase()}, Player role: ${this.playerSymbol}, Is host: ${this.isHost}`);
    
    // Update room code and QR code
    this.updateRoomCode(roomId);
    await this.generateQRCode(roomId);
    
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
    } else if (state.currentPlayer === null) {
      this.statusElement.textContent = 'Waiting for player 2 to join';
      this.statusElement.className = 'status waiting';
    } else {
      this.statusElement.textContent = `Player ${state.currentPlayer}'s turn`;
      this.statusElement.className = 'status playing';
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
    const players = this.gamework.getPlayers();
    const currentPlayerId = this.gamework.getCurrentPlayer()?.id;
    
    // Update Player 1 (Host) status
    const player1Status = document.getElementById('player1Status');
    if (player1Status) {
      const hostPlayer = players.find(p => p.isHost);
      if (hostPlayer) {
        const role = this.engine.getPlayerRole(hostPlayer.id);
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
        const role = this.engine.getPlayerRole(otherPlayer.id);
        player2Status.textContent = `Player 2 - ${role ? `Playing as ${role}` : 'Connected'}`;
      } else {
        player2Status.textContent = 'Waiting for player...';
      }
    }
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

  /**
   * Update room code display
   */
  private updateRoomCode(roomId: string): void {
    const roomCodeElement = document.getElementById('roomCode');
    if (roomCodeElement) {
      // Use 6 characters for convenience
      const shortCode = roomId.substring(0, 6).toUpperCase();
      roomCodeElement.textContent = shortCode;
    }
  }

  /**
   * Generate QR code for room joining
   */
  private async generateQRCode(roomId: string): Promise<void> {
    const qrContainer = document.getElementById('qrCodeContainer');
    if (!qrContainer) return;

    try {
      // Use the existing generateQRCode utility
      const qrCodeDataURL = await generateQRCode(roomId);
      const shortCode = roomId.substring(0, 6).toUpperCase();

      // Update QR code container
      qrContainer.innerHTML = `
        <img src="${qrCodeDataURL}" alt="QR Code for Room ${shortCode}" />
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          Scan to join room: ${shortCode}
        </p>
      `;
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      qrContainer.innerHTML = '<p style="color: red;">Failed to generate QR code</p>';
    }
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
