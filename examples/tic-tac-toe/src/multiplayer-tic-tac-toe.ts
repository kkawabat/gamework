// Import the GameWork framework
import { GameHost, GameClient, WebSocketSignalingService, GameRoom, generateQRCode } from '../../../src/index';
import { ticTacToeConfig, TicTacToeState, TicTacToeMove } from './simple-tic-tac-toe';
import { activeSignalingConfig } from '../../signaling-config';

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
    private currentRoom: GameRoom | null = null;
    private firstPlayerId: string | null = null; // Track who made the first move
    private websocketDisconnected: boolean = false; // Track if WebSocket was disconnected
    private webrtcConnected: boolean = false; // Track WebRTC connection state
    
    // DOM elements
    private gameBoard: HTMLElement | null = null;
    private gameStatus: HTMLElement | null = null;
    private roomCode: HTMLElement | null = null;
    private gameLog: HTMLElement | null = null;
    private qrCodeContainer: HTMLElement | null = null;
    private connectionIndicator: HTMLElement | null = null;
    private connectionStatus: HTMLElement | null = null;
    private playerCount: HTMLElement | null = null;
    private roomCodeInput: HTMLInputElement | null = null;
    private joinRoomBtn: HTMLButtonElement | null = null;
    private resetGame: HTMLButtonElement | null = null;

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
        this.qrCodeContainer = document.getElementById('qrCodeContainer');
        this.connectionIndicator = document.getElementById('connectionIndicator');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.playerCount = document.getElementById('playerCount');
        this.roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
        this.joinRoomBtn = document.getElementById('joinRoomBtn') as HTMLButtonElement;
        this.resetGame = document.getElementById('resetGame') as HTMLButtonElement;
    }

    private setupEventListeners() {
        // Board click handlers
        this.gameBoard?.addEventListener('click', (e) => {
            console.log('[Debug] Tile clicked, gameActive:', this.gameActive, 'currentState:', !!this.currentState, 'firstPlayerId:', this.firstPlayerId);
            
            if (!this.gameActive) {
                console.log('[Debug] Click ignored - game not active');
                return;
            }
            
            const cell = (e.target as HTMLElement).closest('.cell');
            if (!cell || cell.classList.contains('disabled')) {
                console.log('[Debug] Click ignored - cell not found or disabled');
                return;
            }
            
            const index = parseInt((cell as HTMLElement).dataset.index || '0');
            console.log('[Debug] Making move at index:', index);
            this.makeMove(index);
        });

        this.joinRoomBtn?.addEventListener('click', () => {
            console.log('[Client] Join room button clicked');
            this.joinExistingRoom();
        });
        
        this.resetGame?.addEventListener('click', () => {
            console.log('[Game] Reset game button clicked');
            this.resetGameState();
        });
        
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
                // User is trying to join an existing room via QR code
                const roomCode = roomParam.toUpperCase();
                await this.joinRoomAsClient(roomCode, 'qr');
            } else {
                // Generate new room ID and become host
                this.roomId = this.generateRoomId();
                if (this.roomCode) this.roomCode.textContent = this.roomId;
                
                // Try to become host first
                await this.initializeAsHost();
            }
            
        } catch (error) {
            this.log('Failed to initialize as host, trying as client...', 'warning');
            console.log('[Game] About to call initializeAsClient() from catch block');
            await this.initializeAsClient();
        }
    }

    private async initializeAsHost() {
        try {
            console.log('[Game] initializeAsHost called');
            this.log('Initializing as game host...', 'info');
            this.log(`Using signaling server: ${activeSignalingConfig.serverUrl}`, 'info');
            this.isHost = true;
            console.log('[Game] isHost set to true');
            
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
                
                // Reset game when a player leaves
                this.gameActive = false;
                this.log('Game paused - waiting for player to rejoin', 'warning');
            });

            this.gameHost.setRoomUpdateHandler((room) => {
                console.log('[Host] Room update handler called with room:', room);
                this.log(`Room updated: ${room.players.size} players connected`, 'info');
                this.currentRoom = room; // Store the room data
                this.updatePlayerDisplay();
                
                // Auto-start game when both players are connected
                if (room.players.size >= 2 && !this.gameActive) {
                    console.log('[Host] Auto-starting game because room has 2+ players');
                    this.startNewGame();
                }
            });

            this.gameHost.setStateUpdateHandler((state) => {
                this.handleStateUpdate(state as TicTacToeState);
            });

            // Set up connection change handler for host
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

            // Start the host
            await this.gameHost.start();
            
            this.updateConnectionStatus(true, 'Host - Connected');
            this.log('Successfully initialized as game host', 'success');
            
            // Check if we already have 2 players and start the game
            const players = this.gameHost.getPlayers();
            if (players.length >= 2) {
                console.log('[Host] Already have 2+ players, starting game immediately');
                this.startNewGame();
            }
            
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
            console.log('[Game] initializeAsClient called');
            console.log('[Game] Room ID:', this.roomId);
            this.log('Initializing as game client...', 'info');
            this.log(`Using signaling server: ${activeSignalingConfig.serverUrl}`, 'info');
            
            // Clean up any existing host state
            if (this.gameHost) {
                console.log('[Client] Cleaning up existing gameHost');
                await this.gameHost.disconnectSignaling();
                this.gameHost = null;
            }
            
            this.isHost = false;
            console.log('[Game] isHost set to false');
            
            // Create WebSocket signaling service for client
            console.log('[Client] Creating WebSocket signaling service');
            const signalingService = new WebSocketSignalingService(activeSignalingConfig);
            console.log('[Client] Connecting to signaling service');
            await signalingService.connect();
            console.log('[Client] Signaling service connected');
            
            // Create game client
            this.gameClient = new GameClient({
                roomId: this.roomId!,
                playerName: `Player_${Math.floor(Math.random() * 1000)}`
            }, signalingService);
            
            // Set playerId from GameClient
            this.playerId = this.gameClient.getPlayerId();
            
            
            // Set up client event handlers
            this.setupClientEventHandlers();
            
            // Connect to the game
            await this.gameClient.connect();
            
            this.updateConnectionStatus(true, 'Client - Connected');
            this.log('Successfully connected as game client', 'success');
            
            // Update player display for client
            this.updatePlayerDisplay();
            
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
        this.gameClient.setStateUpdateHandler((state, firstPlayerId) => {
            console.log('[Client] State update received:', state, 'firstPlayerId:', firstPlayerId);
            // Auto-start game when client receives first state update
            if (!this.gameActive) {
                console.log('[Client] Setting gameActive to true');
                this.gameActive = true;
                this.log('Game started!', 'success');
                // Update display when game becomes active
                this.updatePlayerDisplay();
            }
            this.handleStateUpdate(state as TicTacToeState, firstPlayerId);
        });

        this.gameClient.setPlayerJoinHandler((player) => {
            this.log(`Player ${player.id} joined the game`, 'success');
            this.updatePlayerDisplay();
        });

        this.gameClient.setPlayerLeaveHandler((playerId) => {
            this.log(`Player ${playerId} left the game`, 'warning');
            this.updatePlayerDisplay();
        });

        this.gameClient.setRoomUpdateHandler((room) => {
            this.currentRoom = room;
            this.log(`Room updated: ${room.players.size} players connected`, 'info');
            this.updatePlayerDisplay();
        });

        this.gameClient.setErrorHandler((error) => {
            this.log(`Client error: ${error.message}`, 'error');
        });

        // Set up connection change handler to activate game when WebRTC connects
        this.gameClient.setConnectionChangeHandler((peerId, isConnected) => {
            this.webrtcConnected = isConnected;
            
            if (isConnected && !this.gameActive) {
                this.gameActive = true;
                this.log('Connected to host!', 'success');
                this.updatePlayerDisplay();
                
                // Update join room button to show connected status
                if (this.joinRoomBtn) {
                    this.joinRoomBtn.disabled = false;
                    this.joinRoomBtn.textContent = 'Joined!';
                }
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

    private async joinExistingRoom() {
        console.log('[Client] joinExistingRoom called');
        const roomCode = this.roomCodeInput?.value.trim().toUpperCase() || '';
        console.log('[Client] Room code:', roomCode);
        
        if (!roomCode || roomCode.length !== 6) {
            this.log('Please enter a valid 6-character room code', 'error');
            return;
        }
        
        await this.joinRoomAsClient(roomCode, 'manual');
    }

    private async joinRoomAsClient(roomCode: string, source: 'qr' | 'manual' = 'manual') {
        try {
            this.log(`Attempting to join room: ${roomCode} (${source})`, 'info');
            
            // Update UI for manual joining
            if (source === 'manual' && this.joinRoomBtn) {
                this.joinRoomBtn.disabled = true;
                this.joinRoomBtn.textContent = 'Joining...';
            }
            
            // Set the room ID
            this.roomId = roomCode;
            if (this.roomCode) this.roomCode.textContent = this.roomId;
            if (this.roomCodeInput) this.roomCodeInput.value = roomCode;
            
            // Try to connect as a client to the existing room
            console.log(`[Client] About to call initializeAsClient() from ${source}`);
            await this.initializeAsClient();
            console.log(`[Client] initializeAsClient() completed successfully from ${source}`);
            
            // Set a timeout to reset button if connection takes too long (manual only)
            if (source === 'manual') {
                setTimeout(() => {
                    if (this.joinRoomBtn && this.joinRoomBtn.textContent === 'Joining...') {
                        this.joinRoomBtn.disabled = false;
                        this.joinRoomBtn.textContent = 'Join Room';
                        this.log('Connection timeout - please try again', 'warning');
                    }
                }, 10000); // 10 second timeout
            }
            
        } catch (error) {
            this.log(`Failed to join room ${roomCode} (${source}): ${(error as Error).message}`, 'error');
            
            // Reset UI for manual joining
            if (source === 'manual' && this.joinRoomBtn) {
                this.joinRoomBtn.disabled = false;
                this.joinRoomBtn.textContent = 'Join Room';
            }
            
            this.updateConnectionStatus(false, `${source === 'qr' ? 'QR Code' : 'Connection'} Join Failed`);
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
                success = this.gameClient.sendMove('place', { position: index });
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

    private handleStateUpdate(state: TicTacToeState, firstPlayerId?: string) {
        this.currentState = state;
        
        // Use the firstPlayerId from the GameHost if provided
        if (firstPlayerId && !this.firstPlayerId) {
            this.firstPlayerId = firstPlayerId;
            console.log('[Client] Received firstPlayerId from host:', firstPlayerId);
        }
        
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
        
        // Update player count display
        this.updatePlayerCount();
        
        // Update player status
        if (this.isHost) {
            const player1Status = document.getElementById('player1Status');
            const player2Status = document.getElementById('player2Status');
            if (player1Status) player1Status.textContent = 'Host - Connected';
            
            // Check if there are actually players in the room
            const players = this.gameHost?.getPlayers() || [];
            const connectedPlayers = players.filter(p => p.isConnected);
            
            if (player2Status) {
                if (connectedPlayers.length >= 2) {
                    player2Status.textContent = 'Player 2 - Connected';
                } else {
                    player2Status.textContent = 'Waiting for player...';
                }
            }
        } else {
            // Client display logic
            const player1Status = document.getElementById('player1Status');
            const player2Status = document.getElementById('player2Status');
            
            if (player1Status) {
                // For client, player 1 is the host
                // Check if WebRTC connection is established, not room player count
                const hostText = this.gameActive ? 'Host - Connected' : 'Host - Connecting...';
                player1Status.textContent = hostText;
            }
            
            if (player2Status) {
                // For client, player 2 is themselves
                const clientText = this.gameActive ? 'You - Connected' : 'You - Connecting...';
                player2Status.textContent = clientText;
            }
        }
        
        // Only update game-specific display if we have a current state
        if (!this.currentState) return;
        
        const state = this.currentState;
        const isMyTurn = this.isMyTurn();
        
        const player1 = document.getElementById('player1');
        const player2 = document.getElementById('player2');
        
        // Update player labels to show dynamic Player 1/2 assignment
        if (this.firstPlayerId) {
            const isFirstPlayer = (this.firstPlayerId === this.playerId);
            
            // First player (who made first move) is always Player 1
            // Second player is always Player 2
            const player1Label = isFirstPlayer ? 'You (Player 1)' : 'Player 1';
            const player2Label = isFirstPlayer ? 'Player 2' : 'You (Player 2)';
            
            if (player1) {
                const labelElement = player1.querySelector('div:first-child');
                if (labelElement) labelElement.textContent = player1Label;
            }
            if (player2) {
                const labelElement = player2.querySelector('div:first-child');
                if (labelElement) labelElement.textContent = player2Label;
            }
        } else {
            // Before first move, show generic labels
            if (player1) {
                const labelElement = player1.querySelector('div:first-child');
                if (labelElement) labelElement.textContent = this.isHost ? 'You (Host)' : 'Player 1';
            }
            if (player2) {
                const labelElement = player2.querySelector('div:first-child');
                if (labelElement) labelElement.textContent = this.isHost ? 'Player 2' : 'You (Client)';
            }
        }
        
        // Update current player highlighting based on X/O symbols
        if (this.firstPlayerId) {
            const isFirstPlayer = (this.firstPlayerId === this.playerId);
            const isMyTurn = this.isMyTurn();
            
            // First player (Player 1) is X, Second player (Player 2) is O
            player1?.classList.toggle('current', state.currentPlayer === 'X' && isMyTurn && isFirstPlayer);
            player2?.classList.toggle('current', state.currentPlayer === 'O' && isMyTurn && !isFirstPlayer);
        } else {
            // Before first move, allow both players to make first move
            const isMyTurn = this.isMyTurn();
            player1?.classList.toggle('current', isMyTurn && this.isHost);
            player2?.classList.toggle('current', isMyTurn && !this.isHost);
        }
    }

    private updatePlayerCount() {
        if (!this.playerCount) return;
        
        let playerCount = 0;
        if (this.isHost && this.gameHost) {
            const players = this.gameHost.getPlayers();
            playerCount = players.filter(p => p.isConnected).length;
        } else if (!this.isHost && this.currentRoom) {
            // For client, show 2 players when WebRTC is connected, 1 when not
            playerCount = this.gameActive ? 2 : this.currentRoom.players.size;
        } else if (!this.isHost && this.gameClient) {
            // Fallback estimation
            playerCount = this.gameActive ? 2 : 1;
        }
        
        this.playerCount.textContent = `Players: ${playerCount}`;
    }

    private isMyTurn(): boolean {
        if (!this.currentState) {
            console.log('[Debug] isMyTurn: false - no current state');
            return false;
        }
        
        // If no one has made the first move yet, allow any player to make the first move
        if (!this.firstPlayerId) {
            console.log('[Debug] isMyTurn: true - first move allowed');
            return true; // Allow first move from any player
        }
        
        // Check if it's the current player's turn
        const currentPlayer = this.currentState.currentPlayer;
        
        // Determine my symbol based on who made the first move
        // First player (Player 1) is X, Second player (Player 2) is O
        const isFirstPlayer = (this.firstPlayerId === this.playerId);
        const myPlayerSymbol = isFirstPlayer ? 'X' : 'O';
        const isMyTurn = currentPlayer === myPlayerSymbol;
        
        console.log('[Debug] isMyTurn:', isMyTurn, 'currentPlayer:', currentPlayer, 'myPlayerSymbol:', myPlayerSymbol, 'isFirstPlayer:', isFirstPlayer, 'firstPlayerId:', this.firstPlayerId, 'playerId:', this.playerId);
        
        return isMyTurn;
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
            // Reset first player tracking for new game
            this.firstPlayerId = null;
            
            // Create a proper exported state format
            const exportedState = JSON.stringify({
                state: ticTacToeConfig.initialState,
                moveHistory: [],
                version: 0
            });
            this.gameHost.importGameState(exportedState);
            this.gameActive = true;
            this.log('New game started!', 'success');
        } catch (error) {
            this.log(`Failed to start new game: ${(error as Error).message}`, 'error');
        }
    }

    private resetGameState() {
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




    private updateConnectionStatus(connected: boolean, status: string) {
        if (this.connectionIndicator) {
            this.connectionIndicator.className = `connection-indicator ${connected ? 'connected' : ''}`;
        }
        if (this.connectionStatus) {
            this.connectionStatus.textContent = status;
        }
        
        // Hide demo note when connected to real signaling server
        if (connected) {
            const demoNote = document.querySelector('.demo-note') as HTMLElement;
            if (demoNote) {
                demoNote.style.display = 'none';
            }
        }
    }

    private enableControls() {
        if (this.resetGame) this.resetGame.disabled = false;
    }

    private async handleWebRTCDisconnection() {
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
