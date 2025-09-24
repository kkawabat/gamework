import { GameHost, GameClient, WebSocketSignalingService, GameRoom, generateQRCode } from '../index';
import { activeSignalingConfig } from '../../examples/signaling-config';

export interface GameState {
  // Base interface for game states
}

export interface GameMove {
  // Base interface for game moves
}

export interface MultiplayerGameConfig<TState extends GameState, TMove extends GameMove> {
  gameConfig: any;
  initialState: TState;
  roomName: string;
}

export abstract class BaseMultiplayerGame<TState extends GameState, TMove extends GameMove> {
  // Core multiplayer properties
  protected gameHost: GameHost | null = null;
  protected gameClient: GameClient | null = null;
  protected isHost: boolean = false;
  protected roomId: string | null = null;
  protected playerId: string | null = null;
  protected currentState: TState | null = null;
  protected gameActive: boolean = false;
  protected currentRoom: GameRoom | null = null;
  protected firstPlayerId: string | null = null;
  protected websocketDisconnected: boolean = false;
  protected webrtcConnected: boolean = false;
  
  // Common DOM elements
  protected gameStatus: HTMLElement | null = null;
  protected roomCode: HTMLElement | null = null;
  protected gameLog: HTMLElement | null = null;
  protected qrCodeContainer: HTMLElement | null = null;
  protected connectionIndicator: HTMLElement | null = null;
  protected connectionStatus: HTMLElement | null = null;
  protected playerCount: HTMLElement | null = null;
  protected roomCodeInput: HTMLInputElement | null = null;
  protected joinRoomBtn: HTMLButtonElement | null = null;

  constructor() {
    this.initializeCommonElements();
    this.setupCommonEventListeners();
    this.initializeGame();
  }

  // Abstract methods that games must implement
  protected abstract initializeGame(): Promise<void>;
  protected abstract updateBoard(): void;
  protected abstract updateGameStatus(): void;
  protected abstract resetGameState(): void;
  protected abstract isMyTurn(): boolean;
  protected abstract makeMove(moveData: any): void;
  protected abstract getGameConfig(): any;
  protected abstract getInitialState(): TState;

  // Common element initialization
  private initializeCommonElements() {
    this.gameStatus = document.getElementById('gameStatus');
    this.roomCode = document.getElementById('roomCode');
    this.gameLog = document.getElementById('gameLog');
    this.qrCodeContainer = document.getElementById('qrCodeContainer');
    this.connectionIndicator = document.getElementById('connectionIndicator');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.playerCount = document.getElementById('playerCount');
    this.roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
    this.joinRoomBtn = document.getElementById('joinRoomBtn') as HTMLButtonElement;
  }

  // Common event listeners
  private setupCommonEventListeners() {
    this.joinRoomBtn?.addEventListener('click', () => {
      this.joinExistingRoom();
    });
    
    this.roomCodeInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinExistingRoom();
      }
    });
  }

  // Host initialization
  protected async initializeAsHost() {
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
        roomName: this.getGameConfig().roomName || 'Multiplayer Game',
        gameConfig: this.getGameConfig()
      }, signalingService);

      // Set up host event handlers
      this.setupHostEventHandlers();
      
      // Start the host
      await this.gameHost.start();
      
      this.updateConnectionStatus(true, 'Host - Connected');
      this.log('Successfully initialized as game host', 'success');
      
      // Check if we already have 2 players and start the game
      const players = this.gameHost.getPlayers();
      if (players.length >= 2) {
        this.startNewGame();
      }
      
    } catch (error) {
      this.log(`Failed to initialize as host: ${(error as Error).message}`, 'error');
      throw error;
    }
  }

  // Client initialization
  protected async initializeAsClient() {
    try {
      this.log('Initializing as game client...', 'info');
      this.log(`Using signaling server: ${activeSignalingConfig.serverUrl}`, 'info');
      
      // Clean up any existing host state
      if (this.gameHost) {
        await this.gameHost.disconnectSignaling();
        this.gameHost = null;
      }
      
      this.isHost = false;
      
      // Create WebSocket signaling service for client
      const signalingService = new WebSocketSignalingService(activeSignalingConfig);
      await signalingService.connect();
      
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

  // Host event handlers
  private setupHostEventHandlers() {
    if (!this.gameHost) return;

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
      this.log(`Room updated: ${room.players.size} players connected`, 'info');
      this.currentRoom = room;
      this.updatePlayerDisplay();
      
      // Auto-start game when both players are connected
      if (room.players.size >= 2 && !this.gameActive) {
        this.startNewGame();
      }
    });

    this.gameHost.setStateUpdateHandler((state) => {
      this.handleStateUpdate(state as TState);
    });

    // Set up connection change handler for host
    this.gameHost.setConnectionChangeHandler((peerId, isConnected) => {
      this.webrtcConnected = isConnected;
      
      if (isConnected && !this.websocketDisconnected) {
        // WebRTC is established, disconnect WebSocket to minimize signaling server load
        this.gameHost?.disconnectSignaling();
        this.websocketDisconnected = true;
        this.log('WebRTC connection established - WebSocket disconnected', 'success');
      } else if (!isConnected && this.websocketDisconnected) {
        // WebRTC dropped, need to reconnect WebSocket
        this.handleWebRTCDisconnection();
      }
    });
  }

  // Client event handlers
  private setupClientEventHandlers() {
    if (!this.gameClient) return;

    this.gameClient.setStateUpdateHandler((state, firstPlayerId) => {
      // Auto-start game when client receives first state update
      if (!this.gameActive) {
        this.gameActive = true;
        this.log('Game started!', 'success');
        this.updatePlayerDisplay();
      }
      this.handleStateUpdate(state as TState, firstPlayerId);
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
      } else if (!isConnected && this.webrtcConnected) {
        // WebRTC dropped, need to reconnect WebSocket
        this.handleWebRTCDisconnection();
      }
    });
  }

  // Room management
  protected generateRoomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  protected generatePlayerId(): string {
    return `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  protected async joinRoomAsClient(roomCode: string, source: 'qr' | 'manual') {
    try {
      this.roomId = roomCode;
      this.log(`Joining room ${roomCode} (${source})...`, 'info');
      await this.initializeAsClient();
    } catch (error) {
      this.log(`Failed to join room: ${(error as Error).message}`, 'error');
      this.updateConnectionStatus(false, `${source === 'qr' ? 'QR Code' : 'Connection'} Join Failed`);
    }
  }

  protected async joinExistingRoom() {
    const roomCode = this.roomCodeInput?.value?.trim().toUpperCase();
    if (!roomCode) {
      this.log('Please enter a room code', 'warning');
      return;
    }
    await this.joinRoomAsClient(roomCode, 'manual');
  }

  // QR Code generation
  protected async generateQRCode() {
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

  // Game state management
  protected handleStateUpdate(state: TState, firstPlayerId?: string) {
    this.currentState = state;
    
    // Use the firstPlayerId from the GameHost if provided
    if (firstPlayerId && !this.firstPlayerId) {
      this.firstPlayerId = firstPlayerId;
    }
    
    this.updateBoard();
    this.updateGameStatus();
    this.updatePlayerDisplay();
  }

  protected startNewGame() {
    if (!this.gameHost) return;
    
    try {
      // Reset first player tracking for new game
      this.firstPlayerId = null;
      
      // Create a proper exported state format
      const exportedState = JSON.stringify({
        state: this.getInitialState(),
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

  // UI utilities
  protected updatePlayerDisplay() {
    // Generic player display logic
    if (this.playerCount) {
      let playerCount = 0;
      if (this.isHost && this.gameHost) {
        const players = this.gameHost.getPlayers();
        playerCount = players.filter(p => p.isConnected).length;
      } else if (!this.isHost && this.currentRoom) {
        playerCount = this.gameActive ? 2 : this.currentRoom.players.size;
      } else if (!this.isHost && this.gameClient) {
        playerCount = this.gameActive ? 2 : 1;
      }
      
      this.playerCount.textContent = `Players: ${playerCount}`;
    }
  }

  protected updateConnectionStatus(connected: boolean, status: string) {
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

  protected enableControls() {
    // Generic control enabling - override in subclasses for game-specific controls
  }

  protected async handleWebRTCDisconnection() {
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

  protected log(message: string, type: string = 'info') {
    if (!this.gameLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    this.gameLog.appendChild(logEntry);
    this.gameLog.scrollTop = this.gameLog.scrollHeight;
  }
}
