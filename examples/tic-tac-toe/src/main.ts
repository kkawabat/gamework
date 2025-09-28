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
    this.gamework = new GameWork(this.engine);
    
    // Set up the engine with GameWork reference
    this.engine.setGameWork(this.gamework);
    
    // Set up event listeners
    this.engine.setupEventListeners();
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
      // Join existing room by room code
      console.log(`Looking up room with code: ${roomParam}`);
      this.engine.addGameLogEntry(`Looking up room: ${roomParam.toUpperCase()}`, 'info');
      
      try {
        const fullRoomId = await this.gamework.lookupRoom(roomParam);
        if (fullRoomId) {
          this.engine.addGameLogEntry(`Found room: ${fullRoomId.substring(0, 6).toUpperCase()}`, 'success');
          await this.gamework.joinRoom(fullRoomId);
          roomId = fullRoomId;
        } else {
          throw new Error('Room not found');
        }
      } catch (error) {
        this.engine.addGameLogEntry(`Room lookup failed: ${error.message}`, 'error');
        throw error;
      }
    } else {
      // Host a new room
      this.engine.addGameLogEntry('Creating new game room...', 'info');
      roomId = await this.gamework.hostRoom();
    }
    
    // Determine if this player is the host
    this.isHost = this.gamework.getClientPlayer()?.isHost || false;
    
    // Assign player roles based on connection order
    const players = this.gamework.getPlayers();
    const playerCount = players.length;
    
    console.log(`Room Code: ${roomId.substring(0, 6).toUpperCase()}, Is host: ${this.isHost}, Player count: ${playerCount}`);
    
    // Update room code and QR code
    this.updateRoomCode(roomId);
    await this.generateQRCode(roomId);
    
    // Update join room button status if we joined an existing room
    if (roomParam) {
      this.updateJoinRoomButtonStatus('Joined!', true);
    }
    
    // Update game log with successful initialization
    this.engine.addGameLogEntry('Game initialized successfully!', 'success');
    this.engine.addGameLogEntry(`Room Code: ${roomId.substring(0, 6).toUpperCase()}`, 'info');
    this.engine.addGameLogEntry(`Status: ${this.isHost ? 'Host' : 'Player'}`, 'info');
    
    if (roomParam) {
      this.engine.addGameLogEntry(`Joined existing room: ${roomId.substring(0, 6).toUpperCase()}`, 'success');
    } else {
      this.engine.addGameLogEntry(`Hosted new room: ${roomId.substring(0, 6).toUpperCase()}`, 'success');
    }
    
    // Update UI with initial state
    this.engine.updateUI();
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
    
    // Set up the engine with UI elements
    this.engine.setUIElements(this.boardElements, this.statusElement, this.currentPlayerElement);
    this.engine.setHostStatus(this.isHost);
    
    // Add click listeners to board cells
    this.boardElements.forEach((cell, index) => {
      cell.addEventListener('click', () => this.handleCellClick(index));
    });
    
    // Add restart button listener
    const restartButton = document.getElementById('restart');
    if (restartButton) {
      restartButton.addEventListener('click', () => this.restartGame());
    }
    
    // Add join room button listener
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => this.handleJoinRoom());
    }
    
    // Add enter key listener for room code input
    const roomCodeInput = document.getElementById('roomCodeInput');
    if (roomCodeInput) {
      roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleJoinRoom();
        }
      });
    }
  }

  /**
   * Handle cell click
   */
  private handleCellClick(index: number): void {
    if (!this.canMakeMove()) {
      console.log('Cannot make move - not your turn or game over');
      this.engine.addGameLogEntry('Cannot make move - not your turn or game over', 'warning');
      return;
    }

    const state = this.engine.getTicTacToeState();
    if (state.board[index] !== null) {
      console.log('Cell already occupied');
      this.engine.addGameLogEntry('Cell already occupied', 'warning');
      return;
    }

    // Send move to the game
    const success = this.gamework.sendMove({
      type: 'move',
      playerId: this.gamework.getClientPlayer()?.id || '',
      timestamp: Date.now(),
      data: { position: index }
    });

    if (success) {
      console.log(`Move sent: position ${index}`);
      this.engine.addGameLogEntry(`Move made at position ${index}`, 'info');
    } else {
      console.log('Failed to send move');
      this.engine.addGameLogEntry('Move failed', 'error');
    }
  }

  /**
   * Check if the current player can make a move
   */
  private canMakeMove(): boolean {
    const state = this.engine.getTicTacToeState();
    
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
   * Handle join room button click
   */
  private handleJoinRoom(): void {
    const roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
    const joinRoomBtn = document.getElementById('joinRoomBtn') as HTMLButtonElement;
    
    if (!roomCodeInput || !joinRoomBtn) return;
    
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    
    if (!roomCode) {
      alert('Please enter a room code');
      return;
    }
    
    if (roomCode.length !== 6) {
      alert('Room code must be 6 characters long');
      return;
    }
    
    // Update button to show connecting status
    this.updateJoinRoomButtonStatus('Connecting...', true);
    
    // Navigate to the room URL
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('room', roomCode);
    window.location.href = currentUrl.toString();
  }

  /**
   * Update join room button status
   */
  private updateJoinRoomButtonStatus(text: string, disabled: boolean = false): void {
    const joinRoomBtn = document.getElementById('joinRoomBtn') as HTMLButtonElement;
    if (joinRoomBtn) {
      joinRoomBtn.textContent = text;
      joinRoomBtn.disabled = disabled;
      
      // Update button styling based on status
      if (text === 'Connecting...') {
        joinRoomBtn.style.background = '#ffc107';
        joinRoomBtn.style.color = '#000';
      } else if (text === 'Joined!') {
        joinRoomBtn.style.background = '#28a745';
        joinRoomBtn.style.color = '#fff';
      } else {
        // Reset to default styling
        joinRoomBtn.style.background = '#28a745';
        joinRoomBtn.style.color = '#fff';
      }
    }
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
    this.engine.updateUI();
    
    console.log('Game restarted');
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
