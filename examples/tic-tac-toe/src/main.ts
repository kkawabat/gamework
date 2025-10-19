import { TicTacToeGameWork } from './tic-tac-toe-gamework';
  

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // New pattern: Game-specific GameWork extension
    const gamework = new TicTacToeGameWork();
    
    // Make game available globally for debugging
    (window as any).gamework = gamework;
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
