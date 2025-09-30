import { GameWork } from '../../../src';
import { TicTacToeEngine } from './game-engine';
import { TicTacToeUIEngine } from './ui-engine';


export class TicTacToeGame {
  private gamework: GameWork;
  private uiEngine: TicTacToeUIEngine;
  private gameEngine: TicTacToeEngine;
  private isHost: boolean = false;

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
    this.uiEngine.updateJoinRoomButtonStatus('Connecting...', true);
    
    // Navigate to the room URL
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('room', roomCode);
    window.location.href = currentUrl.toString();
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
    this.gameEngine = new TicTacToeEngine();
    
    // Update UI
    this.uiEngine.updateUI();
    
    console.log('Game restarted');
  }
}
  

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const gameEngine = new TicTacToeEngine();
    const uiEngine = new TicTacToeUIEngine();
    const gamework = new GameWork(gameEngine, uiEngine);
    uiEngine.initialize();
    
    // Make game available globally for debugging
    (window as any).gamework = gamework;
    
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
