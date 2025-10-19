/**
 * TicTacToeGame - Example implementation using GameWork v2
 * 
 * Demonstrates clean architecture with:
 * - Type-safe game state
 * - Pure game logic
 * - Clean UI rendering
 * - Event-driven communication
 */

import { GameWork, BaseGameState, GameAction, GameConfig } from '../../src';

// TicTacToe specific types
export interface TicTacToeState extends BaseGameState {
  board: ('X' | 'O' | null)[];
  currentPlayer: 'X' | 'O';
  winner: 'X' | 'O' | null;
  gameOver: boolean;
  moveCount: number;
}

export interface TicTacToeAction extends GameAction {
  type: 'MOVE' | 'RESTART';
  payload: {
    position?: number;
  };
}

// TicTacToe Game Engine
export class TicTacToeEngine {
  processAction(state: TicTacToeState, action: TicTacToeAction): TicTacToeState {
    switch (action.type) {
      case 'MOVE':
        return this.processMove(state, action);
      case 'RESTART':
        return this.getInitialState();
      default:
        return state;
    }
  }

  update(state: TicTacToeState, deltaTime: number): TicTacToeState {
    // TicTacToe doesn't need continuous updates
    return state;
  }

  validateAction(action: TicTacToeAction): boolean {
    if (action.type === 'MOVE') {
      return action.payload.position !== undefined && 
             action.payload.position >= 0 && 
             action.payload.position < 9;
    }
    return action.type === 'RESTART';
  }

  getInitialState(): TicTacToeState {
    return {
      id: 'tic-tac-toe',
      timestamp: Date.now(),
      version: 1,
      board: Array(9).fill(null),
      currentPlayer: 'X',
      winner: null,
      gameOver: false,
      moveCount: 0
    };
  }

  private processMove(state: TicTacToeState, action: TicTacToeAction): TicTacToeState {
    const { position } = action.payload;
    
    if (state.gameOver || state.board[position!] !== null) {
      return state; // Invalid move
    }

    const newBoard = [...state.board];
    newBoard[position!] = state.currentPlayer;
    
    const newState: TicTacToeState = {
      ...state,
      board: newBoard,
      currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
      moveCount: state.moveCount + 1,
      timestamp: Date.now(),
      version: state.version + 1
    };

    // Check for winner
    const winner = this.checkWinner(newBoard);
    if (winner) {
      newState.winner = winner;
      newState.gameOver = true;
    } else if (newState.moveCount === 9) {
      newState.gameOver = true;
    }

    return newState;
  }

  private checkWinner(board: ('X' | 'O' | null)[]): 'X' | 'O' | null {
    const winningLines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
      [0, 4, 8], [2, 4, 6] // diagonals
    ];

    for (const line of winningLines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return board[a];
      }
    }

    return null;
  }
}

// TicTacToe UI Engine
export class TicTacToeUI {
  private boardElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private restartButton: HTMLElement | null = null;

  initialize(): void {
    this.createBoard();
    this.createStatus();
    this.createRestartButton();
  }

  render(state: TicTacToeState): void {
    this.updateBoard(state.board);
    this.updateStatus(state);
  }

  destroy(): void {
    if (this.boardElement) {
      this.boardElement.remove();
    }
    if (this.statusElement) {
      this.statusElement.remove();
    }
    if (this.restartButton) {
      this.restartButton.remove();
    }
  }

  updateRoom(room: any): void {
    // Room updates not needed for TicTacToe
  }

  private createBoard(): void {
    this.boardElement = document.createElement('div');
    this.boardElement.className = 'tic-tac-toe-board';
    this.boardElement.style.display = 'grid';
    this.boardElement.style.gridTemplateColumns = 'repeat(3, 100px)';
    this.boardElement.style.gap = '5px';
    this.boardElement.style.margin = '20px auto';
    this.boardElement.style.width = 'fit-content';

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.width = '100px';
      cell.style.height = '100px';
      cell.style.border = '2px solid #333';
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';
      cell.style.justifyContent = 'center';
      cell.style.fontSize = '2em';
      cell.style.cursor = 'pointer';
      cell.dataset.position = i.toString();
      
      this.boardElement.appendChild(cell);
    }

    document.body.appendChild(this.boardElement);
  }

  private createStatus(): void {
    this.statusElement = document.createElement('div');
    this.statusElement.className = 'status';
    this.statusElement.style.textAlign = 'center';
    this.statusElement.style.fontSize = '1.5em';
    this.statusElement.style.margin = '20px';
    
    document.body.appendChild(this.statusElement);
  }

  private createRestartButton(): void {
    this.restartButton = document.createElement('button');
    this.restartButton.textContent = 'Restart Game';
    this.restartButton.style.padding = '10px 20px';
    this.restartButton.style.fontSize = '1em';
    this.restartButton.style.margin = '20px';
    this.restartButton.style.cursor = 'pointer';
    
    document.body.appendChild(this.restartButton);
  }

  private updateBoard(board: ('X' | 'O' | null)[]): void {
    if (!this.boardElement) return;

    const cells = this.boardElement.querySelectorAll('.cell');
    cells.forEach((cell, index) => {
      cell.textContent = board[index] || '';
    });
  }

  private updateStatus(state: TicTacToeState): void {
    if (!this.statusElement) return;

    if (state.winner) {
      this.statusElement.textContent = `Winner: ${state.winner}`;
    } else if (state.gameOver) {
      this.statusElement.textContent = "It's a tie!";
    } else {
      this.statusElement.textContent = `Current Player: ${state.currentPlayer}`;
    }
  }
}

// TicTacToe Game Factory
export function createTicTacToeGame(): GameWork<TicTacToeState, TicTacToeAction> {
  const engine = new TicTacToeEngine();
  const ui = new TicTacToeUI();
  
  const config: GameConfig<TicTacToeState, TicTacToeAction> = {
    initialState: engine.getInitialState(),
    maxPlayers: 2,
    gameName: 'TicTacToe',
    version: '1.0.0',
    debugMode: true
  };

  const game = new GameWork(config);
  
  // Register engines with DI container
  game['container'].register('GameEngine', () => engine);
  game['container'].register('UIEngine', () => ui);
  
  return game;
}

// Example usage
export function startTicTacToeGame(): void {
  const game = createTicTacToeGame();
  
  game.initialize().then(() => {
    console.log('TicTacToe game initialized');
    
    // Set up UI event handlers
    const boardElement = document.querySelector('.tic-tac-toe-board');
    if (boardElement) {
      boardElement.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains('cell')) {
          const position = parseInt(target.dataset.position!);
          game.dispatchAction({
            type: 'MOVE',
            playerId: 'player1',
            timestamp: Date.now(),
            payload: { position }
          });
        }
      });
    }
    
    const restartButton = document.querySelector('button');
    if (restartButton) {
      restartButton.addEventListener('click', () => {
        game.dispatchAction({
          type: 'RESTART',
          playerId: 'player1',
          timestamp: Date.now(),
          payload: {}
        });
      });
    }
    
    // Subscribe to state changes
    game.on('game:stateChanged', (state) => {
      const ui = game['container'].resolve('UIEngine');
      ui.render(state);
    });
  });
}
