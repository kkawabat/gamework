// Import the GameWork framework
import { GameHost, GameClient, WebSocketSignalingService } from '../index';
import { ticTacToeConfig, TicTacToeState, TicTacToeMove } from './simple-tic-tac-toe';
import { generateQRCode } from '../utils';
import { activeSignalingConfig } from './signaling-config';

console.log('GameWork Tic-Tac-Toe Multiplayer Game');
console.log('Loading GameWork framework...');

export class MultiplayerTicTacToe {
    private gameHost: GameHost | null = null;
    private gameClient: GameClient | null = null;
    private isHost: boolean = false;
    private roomId: string | null = null;
    private playerId: string | null = null;
    private currentState: TicTacToeState | null = null;
    private gameActive: boolean = false;
    
    // DOM elements
    private gameBoard: HTMLElement | null = null;
    private gameStatus: HTMLElement | null = null;
    private roomCode: HTMLElement | null = null;
    private gameLog: HTMLElement | null = null;
    private startGame: HTMLButtonElement | null = null;
    private resetGame: HTMLButtonElement | null = null;
    private exportState: HTMLButtonElement | null = null;
    private importState: HTMLButtonElement | null = null;
    private qrCodeContainer: HTMLElement | null = null;
    private connectionIndicator: HTMLElement | null = null;
    private connectionStatus: HTMLElement | null = null;
    private playerCount: HTMLElement | null = null;
    private roomCodeInput: HTMLInputElement | null = null;
    private joinRoomBtn: HTMLButtonElement | null = null;

    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.initializeGame();
    }

    private initializeElements() {
        this.gameBoard = document.getElementById('gameBoard');
        this.gameStatus = document.getElementById('gameStatus');
        this.roomCode = document.getElementById('roomCode');
        this.gameLog = document.getElementById('gameLog');
        this.startGame = document.getElementById('startGame') as HTMLButtonElement;
        this.resetGame = document.getElementById('resetGame') as HTMLButtonElement;
        this.exportState = document.getElementById('exportState') as HTMLButtonElement;
        this.importState = document.getElementById('importState') as HTMLButtonElement;
        this.qrCodeContainer = document.getElementById('qrCodeContainer');
        this.connectionIndicator = document.getElementById('connectionIndicator');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.playerCount = document.getElementById('playerCount');
        this.roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
        this.joinRoomBtn = document.getElementById('joinRoomBtn') as HTMLButtonElement;
    }

    private setupEventListeners() {
        // Board click handlers
        this.gameBoard?.addEventListener('click', (e) => {
            if (!this.gameActive || !this.gameClient) return;
            
            const cell = (e.target as HTMLElement).closest('.cell');
            if (!cell || cell.classList.contains('disabled')) return;
            
            const index = parseInt((cell as HTMLElement).dataset.index || '0');
            this.makeMove(index);
        });

        // Button handlers
        this.startGame?.addEventListener('click', () => this.startNewGame());
        this.resetGame?.addEventListener('click', () => this.resetGameState());
        this.exportState?.addEventListener('click', () => this.exportGameState());
        this.importState?.addEventListener('click', () => this.importGameState());
        this.joinRoomBtn?.addEventListener('click', () => this.joinExistingRoom());
        
        // Room code input handler
        this.roomCodeInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinExistingRoom();
            }
        });
    }

    private async initializeGame() {
        try {
            // Check if there's a room parameter in the URL
            const urlParams = new URLSearchParams(window.location.search);
            const roomParam = urlParams.get('room');
            
            if (roomParam) {
                // User is trying to join an existing room
                this.roomId = roomParam.toUpperCase();
                if (this.roomCode) this.roomCode.textContent = this.roomId;
                if (this.roomCodeInput) this.roomCodeInput.value = this.roomId;
                this.log(`Joining room from URL: ${this.roomId}`, 'info');
                await this.initializeAsClient();
            } else {
                // Generate new room ID and become host
                this.roomId = this.generateRoomId();
                if (this.roomCode) this.roomCode.textContent = this.roomId;
                
                // Try to become host first
                await this.initializeAsHost();
            }
            
        } catch (error) {
            this.log('Failed to initialize as host, trying as client...', 'warning');
            await this.initializeAsClient();
        }
    }

    private async initializeAsHost() {
        try {
            this.log('Initializing as game host...', 'info');
            this.log(`Using signaling server: ${activeSignalingConfig.serverUrl}`, 'info');
            this.isHost = true;
            
            // Create WebSocket signaling service
            const signalingService = new WebSocketSignalingService(activeSignalingConfig);
            await signalingService.connect();
            
            // Create game host
            this.gameHost = new GameHost({
                roomId: this.roomId!,
                roomName: 'Tic-Tac-Toe Game',
                gameConfig: ticTacToeConfig
            }, signalingService);

            // Set up host event handlers
            this.gameHost.setPlayerJoinHandler((player) => {
                this.log(`Player ${player.id} joined the game`, 'success');
                this.updatePlayerDisplay();
            });

            this.gameHost.setPlayerLeaveHandler((playerId) => {
                this.log(`Player ${playerId} left the game`, 'warning');
                this.updatePlayerDisplay();
            });

            this.gameHost.setStateUpdateHandler((state) => {
                this.handleStateUpdate(state as TicTacToeState);
            });

            // Start the host
            await this.gameHost.start();
            
            this.updateConnectionStatus(true, 'Host - Connected');
            this.log('Successfully initialized as game host', 'success');
            
            // Generate QR code
            await this.generateQRCode();
            
            // Enable controls
            this.enableControls();
            
        } catch (error) {
            this.log(`Failed to initialize as host: ${(error as Error).message}`, 'error');
            throw error;
        }
    }

    private async initializeAsClient() {
        try {
            this.log('Initializing as game client...', 'info');
            this.log(`Using signaling server: ${activeSignalingConfig.serverUrl}`, 'info');
            this.isHost = false;
            
            // Create WebSocket signaling service for client
            const signalingService = new WebSocketSignalingService(activeSignalingConfig);
            await signalingService.connect();
            
            // Create game client
            this.gameClient = new GameClient({
                roomId: this.roomId!,
                playerName: `Player_${Math.floor(Math.random() * 1000)}`
            }, signalingService);
            
            // Set up client event handlers
            this.setupClientEventHandlers();
            
            // Connect to the game
            await this.gameClient.connect();
            
            this.updateConnectionStatus(true, 'Client - Connected');
            this.log('Successfully connected as game client', 'success');
            
            // Generate QR code for joining
            await this.generateQRCode();
            
            // Enable controls
            this.enableControls();
            
        } catch (error) {
            this.log(`Failed to initialize as client: ${(error as Error).message}`, 'error');
            this.updateConnectionStatus(false, 'Client - Connection Failed');
            throw error;
        }
    }

    private generateRoomId(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    private generatePlayerId(): string {
        return `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }

    private setupClientEventHandlers() {
        if (!this.gameClient) return;

        // Set up client event handlers
        this.gameClient.setStateUpdateHandler((state) => {
            this.handleStateUpdate(state as TicTacToeState);
        });

        this.gameClient.setPlayerJoinHandler((player) => {
            this.log(`Player ${player.id} joined the game`, 'success');
            this.updatePlayerDisplay();
        });

        this.gameClient.setPlayerLeaveHandler((playerId) => {
            this.log(`Player ${playerId} left the game`, 'warning');
            this.updatePlayerDisplay();
        });

        this.gameClient.setErrorHandler((error) => {
            this.log(`Client error: ${error.message}`, 'error');
        });
    }

    private async joinExistingRoom() {
        const roomCode = this.roomCodeInput?.value.trim().toUpperCase() || '';
        
        if (!roomCode || roomCode.length !== 6) {
            this.log('Please enter a valid 6-character room code', 'error');
            return;
        }
        
        try {
            this.log(`Attempting to join room: ${roomCode}`, 'info');
            if (this.joinRoomBtn) {
                this.joinRoomBtn.disabled = true;
                this.joinRoomBtn.textContent = 'Joining...';
            }
            
            // Set the room ID to the entered code
            this.roomId = roomCode;
            if (this.roomCode) this.roomCode.textContent = this.roomId;
            
            // Try to connect as a client to the existing room
            await this.initializeAsClient();
            
        } catch (error) {
            this.log(`Failed to join room ${roomCode}: ${(error as Error).message}`, 'error');
            if (this.joinRoomBtn) {
                this.joinRoomBtn.disabled = false;
                this.joinRoomBtn.textContent = 'Join Room';
            }
            this.updateConnectionStatus(false, 'Connection Failed');
        }
    }

    private async generateQRCode() {
        try {
            const joinUrl = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
            const qrDataUrl = await generateQRCode(this.roomId!, window.location.origin + window.location.pathname);
            
            const qrImg = document.createElement('img');
            qrImg.src = qrDataUrl;
            qrImg.alt = 'QR Code for joining game';
            qrImg.style.maxWidth = '200px';
            
            if (this.qrCodeContainer) {
                this.qrCodeContainer.innerHTML = '';
                this.qrCodeContainer.appendChild(qrImg);
            }
            
            this.log('QR code generated successfully', 'success');
        } catch (error) {
            this.log(`Failed to generate QR code: ${(error as Error).message}`, 'error');
            
            // Fallback QR code display
            if (this.qrCodeContainer) {
                this.qrCodeContainer.innerHTML = `
                    <div style="width: 200px; height: 200px; border: 2px solid #ddd; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; margin: 0 auto;">
                        <div style="text-align: center;">
                            <div style="font-size: 24px; margin-bottom: 10px;">📱</div>
                            <div style="font-size: 12px; color: #666;">QR Code</div>
                            <div style="font-size: 10px; color: #999; margin-top: 5px;">${this.roomId}</div>
                        </div>
                    </div>
                `;
            }
        }
    }

    private makeMove(index: number) {
        if (!this.gameActive) return;
        
        try {
            const move = {
                type: 'place',
                playerId: this.playerId || 'player1',
                timestamp: Date.now(),
                data: { position: index } as TicTacToeMove
            };
            
            let success = false;
            if (this.gameHost) {
                success = this.gameHost.applyMove(move);
            } else if (this.gameClient) {
                success = this.gameClient.sendMove(move);
            }
            
            if (success) {
                this.log(`Made move at position ${index}`, 'info');
            } else {
                this.log('Invalid move', 'warning');
            }
        } catch (error) {
            this.log(`Failed to make move: ${(error as Error).message}`, 'error');
        }
    }

    private handleStateUpdate(state: TicTacToeState) {
        this.currentState = state;
        this.updateBoard();
        this.updateGameStatus();
        this.updatePlayerDisplay();
    }

    private updateBoard() {
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
        
        // Highlight winning cells
        if (ticTacToeState.winner) {
            this.highlightWinningCells();
        }
    }

    private updateGameStatus() {
        if (!this.currentState || !this.gameStatus) return;
        
        const state = this.currentState;
        
        if (state.gameOver) {
            if (state.winner) {
                this.gameStatus.textContent = `Player ${state.winner} wins! 🎉`;
                this.gameStatus.className = 'status connected';
            } else {
                this.gameStatus.textContent = "It's a draw! 🤝";
                this.gameStatus.className = 'status waiting';
            }
            this.gameActive = false;
        } else {
            this.gameStatus.textContent = `Player ${state.currentPlayer}'s turn`;
            this.gameStatus.className = 'status connected';
        }
    }

    private updatePlayerDisplay() {
        if (!this.currentState) return;
        
        const state = this.currentState;
        const isMyTurn = this.isMyTurn();
        
        const player1 = document.getElementById('player1');
        const player2 = document.getElementById('player2');
        
        player1?.classList.toggle('current', state.currentPlayer === 'X' && isMyTurn);
        player2?.classList.toggle('current', state.currentPlayer === 'O' && isMyTurn);
        
        // Update player status
        if (this.isHost) {
            const player1Status = document.getElementById('player1Status');
            const player2Status = document.getElementById('player2Status');
            if (player1Status) player1Status.textContent = 'Host - Connected';
            if (player2Status) player2Status.textContent = 'Waiting for player...';
        }
    }

    private isMyTurn(): boolean {
        if (!this.currentState) return false;
        
        // Check if it's the current player's turn
        const currentPlayer = this.currentState.currentPlayer;
        const myPlayerSymbol = this.isHost ? 'X' : 'O';
        
        return currentPlayer === myPlayerSymbol;
    }

    private highlightWinningCells() {
        if (!this.currentState || !this.currentState.winner) return;
        
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6] // diagonals
        ];
        
        for (const [a, b, c] of lines) {
            const board = this.currentState.board;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                document.querySelector(`[data-index="${a}"]`)?.classList.add('winning');
                document.querySelector(`[data-index="${b}"]`)?.classList.add('winning');
                document.querySelector(`[data-index="${c}"]`)?.classList.add('winning');
                break;
            }
        }
    }

    private startNewGame() {
        if (!this.gameHost) return;
        
        try {
            // Reset the game state by importing the initial state
            const initialState = JSON.stringify(ticTacToeConfig.initialState);
            this.gameHost.importGameState(initialState);
            this.gameActive = true;
            this.log('New game started!', 'success');
        } catch (error) {
            this.log(`Failed to start new game: ${(error as Error).message}`, 'error');
        }
    }

    private resetGameState() {
        if (!this.gameHost) return;
        
        try {
            const initialState = JSON.stringify(ticTacToeConfig.initialState);
            this.gameHost.importGameState(initialState);
            this.gameActive = false;
            this.log('Game reset', 'info');
        } catch (error) {
            this.log(`Failed to reset game: ${(error as Error).message}`, 'error');
        }
    }

    private exportGameState() {
        if (!this.currentState) return;
        
        try {
            const stateStr = JSON.stringify(this.currentState, null, 2);
            navigator.clipboard.writeText(stateStr).then(() => {
                this.log('Game state exported to clipboard', 'success');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = stateStr;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.log('Game state exported to clipboard', 'success');
            });
        } catch (error) {
            this.log(`Failed to export game state: ${(error as Error).message}`, 'error');
        }
    }

    private importGameState() {
        const stateStr = prompt('Paste the exported game state:');
        if (stateStr && this.gameHost) {
            try {
                const state = JSON.parse(stateStr);
                this.gameHost.importGameState(stateStr);
                this.log('Game state imported successfully', 'success');
            } catch (error) {
                this.log('Failed to import game state: Invalid format', 'error');
            }
        }
    }

    private updateConnectionStatus(connected: boolean, status: string) {
        if (this.connectionIndicator) {
            this.connectionIndicator.className = `connection-indicator ${connected ? 'connected' : ''}`;
        }
        if (this.connectionStatus) {
            this.connectionStatus.textContent = status;
        }
    }

    private enableControls() {
        if (this.startGame) this.startGame.disabled = false;
        if (this.resetGame) this.resetGame.disabled = false;
        if (this.exportState) this.exportState.disabled = false;
        if (this.importState) this.importState.disabled = false;
    }

    private log(message: string, type: string = 'info') {
        if (!this.gameLog) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        this.gameLog.appendChild(logEntry);
        this.gameLog.scrollTop = this.gameLog.scrollHeight;
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    (window as any).multiplayerTicTacToe = new MultiplayerTicTacToe();
});
