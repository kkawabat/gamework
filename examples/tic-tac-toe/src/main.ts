import { GameWork } from '../../../client';
import { TicTacToeEngine } from './game-engine';
import { TicTacToeUIEngine } from './ui-engine';
  

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
