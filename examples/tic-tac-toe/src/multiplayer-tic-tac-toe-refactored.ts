// Import the GameWork framework
import { BaseMultiplayerGame } from '../../../src/multiplayer/BaseMultiplayerGame';
import { ticTacToeConfig, TicTacToeState, TicTacToeMove } from './simple-tic-tac-toe';

console.log('GameWork Tic-Tac-Toe Multiplayer Game');
console.log('Loading GameWork framework...');

export class MultiplayerTicTacToeRefactored extends BaseMultiplayerGame<TicTacToeState, TicTacToeMove> {
    // Game-specific DOM elements
    private gameBoard: HTMLElement | null = null;
    private resetGame: HTMLButtonElement | null = null;

    constructor() {
        super();
        this.initializeGameElements();
        this.setupGameEventListeners();
    }

    // Game-specific element initialization
    private initializeGameElements() {
        this.gameBoard = document.getElementById('gameBoard');
        this.resetGame = document.getElementById('resetGame') as HTMLButtonElement;
    }

    // Game-specific event listeners
    private setupGameEventListeners() {
        // Board click handlers
        this.gameBoard?.addEventListener('click', (e) => {
            if (!this.gameActive) {
                return;
            }
            
            const cell = (e.target as HTMLElement).closest('.cell');
            if (!cell || cell.classList.contains('disabled')) {
                return;
            }
            
            const index = parseInt((cell as HTMLElement).dataset.index || '0');
            this.makeMove(index);
        });
        
        this.resetGame?.addEventListener('click', () => {
            this.resetGameState();
        });
    }

    // Abstract method implementations
    protected async initializeGame(): Promise<void> {
        try {
            // Check if there's a room parameter in the URL
            const urlParams = new URLSearchParams(window.location.search);
            const roomParam = urlParams.get('room');
            
            if (roomParam) {
                // User is trying to join an existing room via QR code
                const roomCode = roomParam.toUpperCase();
                await this.joinRoomAsClient(roomCode, 'qr');
            } else {
                // Generate new room ID and become host
                this.roomId = this.generateRoomId();
                this.playerId = this.generatePlayerId();
                
                await this.initializeAsHost();
                
                // Update UI
                if (this.roomCode) {
                    this.roomCode.textContent = this.roomId;
                }
                
                // Generate QR code
                await this.generateQRCode();
                
                // Enable controls
                this.enableControls();
            }
        } catch (error) {
            this.log(`Failed to initialize game: ${(error as Error).message}`, 'error');
            // Try to initialize as client as fallback
            try {
                await this.initializeAsClient();
            } catch (clientError) {
                this.log(`Failed to initialize as client: ${(clientError as Error).message}`, 'error');
            }
        }
    }

    protected getGameConfig() {
        return ticTacToeConfig;
    }

    protected getInitialState(): TicTacToeState {
        return ticTacToeConfig.initialState;
    }

    protected updateBoard(): void {
        if (!this.currentState) return;
        
        const ticTacToeState = this.currentState;
        
        document.querySelectorAll('.cell').forEach((cell, index) => {
            const value = ticTacToeState.board[index];
            cell.textContent = value || '';
            cell.classList.remove('x', 'o', 'winning', 'disabled');
            
            if (value) {
                cell.classList.add(value.toLowerCase());
            }
            
            // Disable cells if it's not the current player's turn or game is over
            const isMyTurn = this.isMyTurn();
            const isGameOver = ticTacToeState.gameOver;
            cell.classList.toggle('disabled', !isMyTurn || isGameOver || value !== null);
        });
        
        // Highlight winning cells if game is over
        if (ticTacToeState.gameOver && ticTacToeState.winner) {
            this.highlightWinningCells();
        }
    }

    protected updateGameStatus(): void {
        if (!this.currentState || !this.gameStatus) return;
        
        const state = this.currentState;
        
        if (state.gameOver) {
            if (state.winner) {
                this.gameStatus.textContent = `Game Over - ${state.winner} Wins!`;
                this.gameStatus.className = 'status game-over';
            } else {
                this.gameStatus.textContent = 'Game Over - Draw!';
                this.gameStatus.className = 'status game-over';
            }
        } else {
            const currentPlayer = state.currentPlayer;
            this.gameStatus.textContent = `Current Player: ${currentPlayer}`;
            this.gameStatus.className = 'status active';
        }
    }

    protected resetGameState(): void {
        if (!this.gameHost) {
            this.log('Only the host can reset the game', 'warning');
            return;
        }
        
        try {
            // Reset first player tracking
            this.firstPlayerId = null;
            
            // Create a proper exported state format
            const exportedState = JSON.stringify({
                state: ticTacToeConfig.initialState,
                moveHistory: [],
                version: 0
            });
            this.gameHost.importGameState(exportedState);
            this.gameActive = true;
            this.log('Game reset - board cleared!', 'success');
        } catch (error) {
            this.log(`Failed to reset game: ${(error as Error).message}`, 'error');
        }
    }

    protected isMyTurn(): boolean {
        if (!this.currentState) {
            return false;
        }
        
        // If no one has made the first move yet, allow any player to make the first move
        if (!this.firstPlayerId) {
            return true; // Allow first move from any player
        }
        
        // Check if it's the current player's turn
        const currentPlayer = this.currentState.currentPlayer;
        
        // Determine my symbol based on who made the first move
        // First player (Player 1) is X, Second player (Player 2) is O
        const isFirstPlayer = (this.firstPlayerId === this.playerId);
        const myPlayerSymbol = isFirstPlayer ? 'X' : 'O';
        const isMyTurn = currentPlayer === myPlayerSymbol;
        
        return isMyTurn;
    }

    protected makeMove(moveData: any): void {
        if (!this.gameActive) return;
        
        try {
            const move = {
                type: 'place',
                playerId: this.playerId || 'player1',
                timestamp: Date.now(),
                data: { position: moveData } as TicTacToeMove
            };
            
            let success = false;
            if (this.gameHost) {
                success = this.gameHost.applyMove(move);
            } else if (this.gameClient) {
                success = this.gameClient.sendMove('place', { position: moveData });
            }
            
            if (success) {
                this.log(`Made move at position ${moveData}`, 'info');
            } else {
                this.log('Invalid move', 'warning');
            }
        } catch (error) {
            this.log(`Failed to make move: ${(error as Error).message}`, 'error');
        }
    }

    protected enableControls(): void {
        if (this.resetGame) this.resetGame.disabled = false;
    }

    // Tic-tac-toe specific methods
    private highlightWinningCells(): void {
        if (!this.currentState || !this.currentState.winner) return;
        
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6] // Diagonals
        ];
        
        for (const line of lines) {
            const [a, b, c] = line;
            const board = this.currentState.board;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                // Highlight winning line
                line.forEach(index => {
                    const cell = document.querySelector(`[data-index="${index}"]`);
                    if (cell) {
                        cell.classList.add('winning');
                    }
                });
                break;
            }
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    (window as any).multiplayerTicTacToe = new MultiplayerTicTacToeRefactored();
});
