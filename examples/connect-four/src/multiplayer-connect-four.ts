// Import the GameWork framework
import { BaseMultiplayerGame } from '../../../client/multiplayer/BaseMultiplayerGame';
import { connectFourConfig, ConnectFourState, ConnectFourMove } from './connect-four-game';

console.log('GameWork Connect Four Multiplayer Game');
console.log('Loading GameWork framework...');

export class MultiplayerConnectFour extends BaseMultiplayerGame<ConnectFourState, ConnectFourMove> {
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
        // Board click handlers for Connect Four
        this.gameBoard?.addEventListener('click', (e) => {
            if (!this.gameActive) {
                return;
            }
            
            const column = (e.target as HTMLElement).closest('.column');
            if (!column || column.classList.contains('disabled')) {
                return;
            }
            
            const columnIndex = parseInt((column as HTMLElement).dataset.column || '0');
            this.makeMove(columnIndex);
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
        return connectFourConfig;
    }

    protected getInitialState(): ConnectFourState {
        return connectFourConfig.initialState;
    }

    protected updateBoard(): void {
        if (!this.currentState) return;
        
        const connectFourState = this.currentState;
        
        // Update Connect Four board
        document.querySelectorAll('.cell').forEach((cell, index) => {
            const row = Math.floor(index / 7);
            const col = index % 7;
            const value = connectFourState.board[row][col];
            
            cell.textContent = value || '';
            cell.classList.remove('red', 'yellow', 'winning', 'disabled');
            
            if (value) {
                cell.classList.add(value.toLowerCase());
            }
        });
        
        // Highlight winning cells if game is over
        if (connectFourState.gameOver && connectFourState.winner) {
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
                state: connectFourConfig.initialState,
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
        // First player (Player 1) is Red, Second player (Player 2) is Yellow
        const isFirstPlayer = (this.firstPlayerId === this.playerId);
        const myPlayerSymbol = isFirstPlayer ? 'Red' : 'Yellow';
        const isMyTurn = currentPlayer === myPlayerSymbol;
        
        return isMyTurn;
    }

    protected makeMove(moveData: any): void {
        if (!this.gameActive) return;
        
        try {
            const move = {
                type: 'drop',
                playerId: this.playerId || 'player1',
                timestamp: Date.now(),
                data: { column: moveData } as ConnectFourMove
            };
            
            let success = false;
            if (this.gameHost) {
                success = this.gameHost.applyMove(move);
            } else if (this.gameClient) {
                success = this.gameClient.sendMove('drop', { column: moveData });
            }
            
            if (success) {
                this.log(`Dropped piece in column ${moveData}`, 'info');
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

    // Connect Four specific methods
    private highlightWinningCells(): void {
        if (!this.currentState || !this.currentState.winner) return;
        
        // Connect Four winning logic would go here
        // This is a simplified version
        const winningCells = this.currentState.winningCells || [];
        winningCells.forEach(cellIndex => {
            const cell = document.querySelector(`[data-index="${cellIndex}"]`);
            if (cell) {
                cell.classList.add('winning');
            }
        });
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    (window as any).multiplayerConnectFour = new MultiplayerConnectFour();
});
