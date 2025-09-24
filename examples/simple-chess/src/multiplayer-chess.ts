// Import the GameWork framework
import { GameHost, GameClient, WebSocketSignalingService, GameRoom, generateQRCode } from '../../../src/index';
import { chessConfig, ChessState, ChessMove } from './chess-game';
import { activeSignalingConfig } from '../../signaling-config';

console.log('GameWork Chess Multiplayer Game');
console.log('Loading GameWork framework...');

export class MultiplayerChess {
    private gameHost: GameHost | null = null;
    private gameClient: GameClient | null = null;
    private isHost: boolean = false;
    private gameActive: boolean = false;
    private currentState: ChessState | null = null;
    private playerId: string = '';
    private roomId: string = '';
    private firstPlayerId: string | null = null;
    private websocketDisconnected: boolean = false;
    private webrtcConnected: boolean = false;

    // UI elements
    private roomCode: HTMLElement | null = null;
    private gameStatus: HTMLElement | null = null;
    private player1Status: HTMLElement | null = null;
    private player2Status: HTMLElement | null = null;
    private playerCount: HTMLElement | null = null;
    private connectionStatus: HTMLElement | null = null;
    private connectionIndicator: HTMLElement | null = null;
    private chessBoard: HTMLElement | null = null;
    private whiteCaptured: HTMLElement | null = null;
    private blackCaptured: HTMLElement | null = null;
    private resetGame: HTMLElement | null = null;
    private gameLog: HTMLElement | null = null;

    constructor() {
        this.initializeUI();
        this.initializeGame();
    }

    private initializeUI(): void {
        this.roomCode = document.getElementById('roomCode');
        this.gameStatus = document.getElementById('gameStatus');
        this.player1Status = document.getElementById('player1Status');
        this.player2Status = document.getElementById('player2Status');
        this.playerCount = document.getElementById('playerCount');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionIndicator = document.getElementById('connectionIndicator');
        this.chessBoard = document.getElementById('chessBoard');
        this.whiteCaptured = document.getElementById('whiteCaptured');
        this.blackCaptured = document.getElementById('blackCaptured');
        this.resetGame = document.getElementById('resetGame');
        this.gameLog = document.getElementById('gameLog');

        // Add event listeners
        if (this.resetGame) {
            this.resetGame.addEventListener('click', () => this.resetGameState());
        }

        // Add chess board click handlers
        if (this.chessBoard) {
            this.chessBoard.addEventListener('click', (event) => {
                const target = event.target as HTMLElement;
                if (target.classList.contains('square')) {
                    this.handleSquareClick(target);
                }
            });
        }
    }

    private async initializeGame(): Promise<void> {
        try {
            this.log('Initializing GameWork framework...', 'info');
            
            // Check if we're joining an existing room
            const urlParams = new URLSearchParams(window.location.search);
            const roomCode = urlParams.get('room');
            
            if (roomCode) {
                this.log(`Joining existing room: ${roomCode}`, 'info');
                await this.joinExistingRoom(roomCode);
            } else {
                this.log('Creating new room...', 'info');
                await this.createNewRoom();
            }
        } catch (error) {
            this.log(`Failed to initialize game: ${(error as Error).message}`, 'error');
        }
    }

    private async createNewRoom(): Promise<void> {
        try {
            this.isHost = true;
            this.log('Creating new room as host...', 'info');
            
            // Generate room ID
            this.roomId = this.generateRoomId();
            if (this.roomCode) this.roomCode.textContent = this.roomId;
            
            // Initialize as host
            await this.initializeAsHost();
            
        } catch (error) {
            this.log(`Failed to create room: ${(error as Error).message}`, 'error');
        }
    }

    private async joinExistingRoom(roomCode: string): Promise<void> {
        try {
            this.isHost = false;
            this.log(`Joining room: ${roomCode}`, 'info');
            
            // Set the room ID
            this.roomId = roomCode;
            if (this.roomCode) this.roomCode.textContent = this.roomId;
            
            // Initialize as client
            await this.initializeAsClient();
            
        } catch (error) {
            this.log(`Failed to join room: ${(error as Error).message}`, 'error');
        }
    }

    private async initializeAsHost(): Promise<void> {
        try {
            const signalingService = new WebSocketSignalingService(activeSignalingConfig);
            await signalingService.connect();
            
            this.gameHost = new GameHost({
                roomId: this.roomId,
                roomName: `Chess Room ${this.roomId}`,
                gameConfig: chessConfig
            }, signalingService);
            
            this.playerId = this.gameHost.getHostPlayerId();
            
            // Set up event handlers
            this.setupHostEventHandlers();
            
            this.log('Host initialized successfully', 'success');
            this.updateConnectionStatus(true, 'Host - Connected');
            
        } catch (error) {
            this.log(`Failed to initialize as host: ${(error as Error).message}`, 'error');
        }
    }

    private async initializeAsClient(): Promise<void> {
        try {
            const signalingService = new WebSocketSignalingService(activeSignalingConfig);
            await signalingService.connect();
            
            this.gameClient = new GameClient({
                roomId: this.roomId,
                playerName: 'Chess Player'
            }, signalingService);
            
            this.playerId = this.gameClient.getPlayerId();
            
            // Set up event handlers
            this.setupClientEventHandlers();
            
            this.log('Client initialized successfully', 'success');
            this.updateConnectionStatus(true, 'Client - Connected');
            
        } catch (error) {
            this.log(`Failed to initialize as client: ${(error as Error).message}`, 'error');
        }
    }

    private setupHostEventHandlers(): void {
        if (!this.gameHost) return;

        // Handle player joins
        this.gameHost.setOnPlayerJoin((playerId: string) => {
            this.log(`Player joined: ${playerId}`, 'success');
            this.updatePlayerDisplay();
        });

        // Handle player leaves
        this.gameHost.setOnPlayerLeave((playerId: string) => {
            this.log(`Player left: ${playerId}`, 'warning');
            this.updatePlayerDisplay();
        });

        // Handle state updates
        this.gameHost.setOnStateUpdate((state: ChessState) => {
            this.handleStateUpdate(state);
        });

        // Handle connection changes
        this.gameHost.setConnectionChangeHandler((peerId, isConnected) => {
            this.webrtcConnected = isConnected;
            
            if (isConnected && !this.websocketDisconnected) {
                // WebRTC is established, disconnect WebSocket to minimize signaling server load
                console.log('[Host] WebRTC connected, disconnecting WebSocket');
                this.gameHost?.disconnectSignaling();
                this.websocketDisconnected = true;
                this.log('WebRTC connection established - WebSocket disconnected', 'success');
            } else if (!isConnected && this.websocketDisconnected) {
                // WebRTC dropped, need to reconnect WebSocket
                console.log('[Host] WebRTC dropped, reconnecting WebSocket');
                this.handleWebRTCDisconnection();
            }
        });
    }

    private setupClientEventHandlers(): void {
        if (!this.gameClient) return;

        // Handle state updates
        this.gameClient.setOnStateUpdate((state: ChessState) => {
            this.handleStateUpdate(state);
        });

        // Handle connection changes
        this.gameClient.setConnectionChangeHandler((peerId, isConnected) => {
            this.webrtcConnected = isConnected;
            
            if (isConnected && !this.gameActive) {
                this.gameActive = true;
                this.log('Connected to host!', 'success');
                this.updatePlayerDisplay();
            }
            
            if (isConnected && !this.websocketDisconnected) {
                // WebRTC is established, disconnect WebSocket to minimize signaling server load
                console.log('[Client] WebRTC connected, disconnecting WebSocket');
                setTimeout(() => {
                    this.gameClient?.disconnectSignaling();
                    this.websocketDisconnected = true;
                    this.log('WebRTC connection established - WebSocket disconnected', 'success');
                }, 2000); // 2 second delay to allow ICE candidates to complete
            } else if (!isConnected && this.websocketDisconnected) {
                // WebRTC dropped, need to reconnect WebSocket
                console.log('[Client] WebRTC dropped, reconnecting WebSocket');
                this.handleWebRTCDisconnection();
            }
        });
    }

    private handleStateUpdate(state: ChessState): void {
        this.currentState = state;
        this.gameActive = true;
        
        // Update board display
        this.updateChessBoard();
        
        // Update captured pieces
        this.updateCapturedPieces();
        
        // Update player display
        this.updatePlayerDisplay();
        
        this.log(`Game state updated - Current player: ${state.currentPlayer}`, 'info');
    }

    private handleSquareClick(square: HTMLElement): void {
        if (!this.gameActive || !this.currentState) return;
        
        const row = parseInt(square.dataset.row || '0');
        const col = parseInt(square.dataset.col || '0');
        
        this.log(`Clicked square: ${row}, ${col}`, 'info');
        
        // Handle piece selection and movement
        // This would be implemented based on chess rules
        // For now, just log the click
    }

    private updateChessBoard(): void {
        if (!this.chessBoard || !this.currentState) return;
        
        const board = this.currentState.board;
        const squares = this.chessBoard.querySelectorAll('.square');
        
        squares.forEach((square, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const piece = board[row][col];
            
            if (piece) {
                square.textContent = this.getPieceSymbol(piece);
            } else {
                square.textContent = '';
            }
        });
    }

    private getPieceSymbol(piece: string): string {
        const symbols: { [key: string]: string } = {
            'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
            'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };
        return symbols[piece] || piece;
    }

    private updateCapturedPieces(): void {
        if (!this.currentState || !this.whiteCaptured || !this.blackCaptured) return;
        
        // Update white captured pieces
        this.whiteCaptured.innerHTML = this.currentState.capturedPieces.white
            .map(piece => this.getPieceSymbol(piece))
            .join(' ');
        
        // Update black captured pieces
        this.blackCaptured.innerHTML = this.currentState.capturedPieces.black
            .map(piece => this.getPieceSymbol(piece))
            .join(' ');
    }

    private updatePlayerDisplay(): void {
        if (!this.currentState) return;
        
        const isFirstPlayer = this.firstPlayerId === this.playerId;
        const currentPlayer = this.currentState.currentPlayer;
        
        // Update player 1 (white)
        if (this.player1Status) {
            if (isFirstPlayer) {
                this.player1Status.textContent = 'You (White)';
            } else {
                this.player1Status.textContent = 'Player 1 (White)';
            }
        }
        
        // Update player 2 (black)
        if (this.player2Status) {
            if (!isFirstPlayer) {
                this.player2Status.textContent = 'You (Black)';
            } else {
                this.player2Status.textContent = 'Player 2 (Black)';
            }
        }
        
        // Update current player highlighting
        const player1 = document.getElementById('player1');
        const player2 = document.getElementById('player2');
        
        if (player1 && player2) {
            player1.classList.toggle('current', currentPlayer === 'white');
            player2.classList.toggle('current', currentPlayer === 'black');
        }
    }

    private updateConnectionStatus(connected: boolean, status: string): void {
        if (this.connectionStatus) {
            this.connectionStatus.textContent = status;
        }
        
        if (this.connectionIndicator) {
            this.connectionIndicator.classList.toggle('connected', connected);
        }
        
        if (this.gameStatus) {
            this.gameStatus.textContent = connected ? 'Connected' : 'Disconnected';
            this.gameStatus.className = `status ${connected ? 'connected' : 'disconnected'}`;
        }
    }

    private resetGameState(): void {
        if (!this.gameHost || !this.isHost) return;
        
        try {
            this.gameHost.resetGame();
            this.firstPlayerId = null;
            this.log('Game reset successfully', 'success');
        } catch (error) {
            this.log(`Failed to reset game: ${(error as Error).message}`, 'error');
        }
    }

    private generateRoomId(): string {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        console.log(`[Chess] ${message}`);
        
        if (this.gameLog) {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${type}`;
            logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
            this.gameLog.appendChild(logEntry);
            this.gameLog.scrollTop = this.gameLog.scrollHeight;
        }
    }

    private async handleWebRTCDisconnection(): Promise<void> {
        this.log('WebRTC connection lost, attempting to reconnect...', 'warning');
        this.websocketDisconnected = false;
        this.webrtcConnected = false;
        
        try {
            if (this.isHost && this.gameHost) {
                // Reconnect host WebSocket
                const signalingService = new WebSocketSignalingService(activeSignalingConfig);
                await signalingService.connect();
                this.gameHost.setSignalingService(signalingService);
                this.log('Host WebSocket reconnected', 'success');
            } else if (!this.isHost && this.gameClient) {
                // Reconnect client WebSocket
                const signalingService = new WebSocketSignalingService(activeSignalingConfig);
                await signalingService.connect();
                this.gameClient.setSignalingService(signalingService);
                this.log('Client WebSocket reconnected', 'success');
            }
        } catch (error) {
            this.log(`Failed to reconnect WebSocket: ${(error as Error).message}`, 'error');
            // Retry after a delay
            setTimeout(() => {
                this.handleWebRTCDisconnection();
            }, 5000);
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerChess();
});
