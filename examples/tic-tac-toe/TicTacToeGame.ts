/**
 * TicTacToeGame - Full multiplayer implementation using GameWork v2
 * 
 * Demonstrates clean architecture with:
 * - Type-safe game state
 * - Pure game logic
 * - Clean UI rendering
 * - Event-driven communication
 * - WebRTC multiplayer networking
 * - Room management
 * - Real-time synchronization
 */

import { GameWork, BaseGameState, GameAction, GameConfig } from '../../src';
import { WebRTCNetworkEngine, WebRTCNetworkEngineConfig } from '../../src/engines/WebRTCNetworkEngine';
import { NetworkMessage } from '../../src/types/GameTypes';

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

// Multiplayer TicTacToe Game Factory
export function createTicTacToeGame(playerId: string, playerName: string): GameWork<TicTacToeState, TicTacToeAction> {
  const engine = new TicTacToeEngine();
  const ui = new TicTacToeUI();
  
  // Configure WebRTC network engine
  const networkConfig: WebRTCNetworkEngineConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'balanced',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
    signalingServerUrl: process.env.SIGNALING_SERVER_URL || 'ws://localhost:8080',
    roomCodeLength: 6,
    maxRetries: 5,
    retryDelay: 2000
  };

  const dataChannelConfig = {
    ordered: true,
    maxRetransmits: 3
  };

  const networkEngine = new WebRTCNetworkEngine(networkConfig, dataChannelConfig, playerId);
  
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
  game['container'].register('NetworkEngine', () => networkEngine);
  
  return game;
}

// Multiplayer TicTacToe Game Manager
class MultiplayerTicTacToeManager {
  private game: GameWork<TicTacToeState, TicTacToeAction> | null = null;
  private networkEngine: WebRTCNetworkEngine | null = null;
  private playerId: string;
  private playerName: string;
  private isHost: boolean = false;
  private currentRoom: string = '';

  constructor() {
    this.playerId = this.generatePlayerId();
    this.playerName = this.getPlayerName();
  }

  async initialize(): Promise<void> {
    try {
      // Create game instance
      this.game = createTicTacToeGame(this.playerId, this.playerName);
      this.networkEngine = this.game['container'].resolve('NetworkEngine') as WebRTCNetworkEngine;
      
      // Initialize network engine
      await this.networkEngine.initialize();
      
      // Initialize game
      await this.game.initialize();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Check for room parameter in URL
      this.handleURLParameters();
      
      // Update UI
      this.updateConnectionStatus('Connected', true);
      this.logMessage('GameWork framework initialized', 'success');
      
    } catch (error) {
      console.error('Failed to initialize game:', error);
      this.updateConnectionStatus('Connection Failed', false);
      this.logMessage(`Initialization failed: ${error}`, 'error');
    }
  }

  private handleURLParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode && roomCode.length === 6) {
      // Auto-join room from URL
      this.joinRoom(roomCode);
      
      // Update input field
      const roomInput = document.getElementById('roomCodeInput') as HTMLInputElement;
      if (roomInput) {
        roomInput.value = roomCode;
      }
    }
  }

  async createRoom(): Promise<void> {
    if (!this.networkEngine) return;
    
    try {
      this.currentRoom = await this.networkEngine.createRoom();
      this.isHost = true;
      
      // Update UI
      this.updateRoomCode(this.currentRoom);
      this.updatePlayerStatus('host', 'You are the host');
      this.logMessage(`Room created: ${this.currentRoom}`, 'success');
      
    } catch (error) {
      console.error('Failed to create room:', error);
      this.logMessage(`Failed to create room: ${error}`, 'error');
    }
  }

  async joinRoom(roomCode: string): Promise<void> {
    if (!this.networkEngine) return;
    
    try {
      const success = await this.networkEngine.joinRoom(roomCode);
      if (success) {
        this.currentRoom = roomCode;
        this.isHost = false;
        
        // Update UI
        this.updateRoomCode(roomCode);
        this.updatePlayerStatus('guest', 'Connected to room');
        this.logMessage(`Joined room: ${roomCode}`, 'success');
      }
    } catch (error) {
      console.error('Failed to join room:', error);
      this.logMessage(`Failed to join room: ${error}`, 'error');
    }
  }

  private setupEventHandlers(): void {
    if (!this.game || !this.networkEngine) return;

    // Game state changes
    this.game.on('game:stateChanged', (state) => {
      const ui = this.game!['container'].resolve('UIEngine') as TicTacToeUI;
      ui.render(state);
    });

    // Network messages
    this.networkEngine.onMessage((peerId, message) => {
      this.handleNetworkMessage(peerId, message);
    });

    // UI event handlers
    this.setupUIEventHandlers();
  }

  private setupUIEventHandlers(): void {
    // Board clicks
    const gameBoard = document.getElementById('gameBoard');
    if (gameBoard) {
      gameBoard.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains('cell') && !target.classList.contains('disabled')) {
          const position = parseInt(target.dataset.index!);
          this.makeMove(position);
        }
      });
    }

    // Restart button
    const restartButton = document.getElementById('restart');
    if (restartButton) {
      restartButton.addEventListener('click', () => {
        this.restartGame();
      });
    }

    // Join room button
    const joinButton = document.getElementById('joinRoomBtn');
    const roomInput = document.getElementById('roomCodeInput') as HTMLInputElement;
    if (joinButton && roomInput) {
      joinButton.addEventListener('click', () => {
        const roomCode = roomInput.value.trim().toUpperCase();
        if (roomCode.length === 6) {
          this.joinRoom(roomCode);
        } else {
          this.logMessage('Please enter a valid 6-character room code', 'warning');
        }
      });
    }

    // Create room button (if exists)
    const createRoomButton = document.getElementById('createRoomBtn');
    if (createRoomButton) {
      createRoomButton.addEventListener('click', () => {
        this.createRoom();
      });
    }
  }

  private makeMove(position: number): void {
    if (!this.game || !this.networkEngine) return;

    const action: TicTacToeAction = {
      type: 'MOVE',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: { position }
    };

    // Dispatch locally
    this.game.dispatchAction(action);
    
    // Broadcast to other players
    const networkMessage: NetworkMessage = {
      type: 'GAME_ACTION',
      from: this.playerId,
      to: 'all',
      payload: action,
      timestamp: Date.now()
    };
    
    this.networkEngine.broadcast(networkMessage);
  }

  private restartGame(): void {
    if (!this.game || !this.networkEngine) return;

    const action: TicTacToeAction = {
      type: 'RESTART',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: {}
    };

    // Dispatch locally
    this.game.dispatchAction(action);
    
    // Broadcast to other players
    const networkMessage: NetworkMessage = {
      type: 'GAME_ACTION',
      from: this.playerId,
      to: 'all',
      payload: action,
      timestamp: Date.now()
    };
    
    this.networkEngine.broadcast(networkMessage);
  }

  private handleNetworkMessage(peerId: string, message: NetworkMessage): void {
    if (message.type === 'GAME_ACTION' && message.payload) {
      const action = message.payload as TicTacToeAction;
      
      // Only process actions from other players
      if (action.playerId !== this.playerId) {
        this.game?.dispatchAction(action);
      }
    }
  }

  private generatePlayerId(): string {
    return 'player_' + Math.random().toString(36).substr(2, 9);
  }

  private getPlayerName(): string {
    const nameInput = document.getElementById('player-name') as HTMLInputElement;
    return nameInput?.value || 'Player';
  }

  private updateRoomCode(code: string): void {
    const roomCodeElement = document.getElementById('roomCode');
    if (roomCodeElement) {
      roomCodeElement.textContent = code;
    }
    
    // Generate QR code
    this.generateQRCode(code);
  }

  private generateQRCode(roomCode: string): void {
    const qrContainer = document.getElementById('qrCodeContainer');
    if (!qrContainer) return;

    // Clear previous QR code
    qrContainer.innerHTML = '';

    // Generate QR code URL
    const currentUrl = window.location.origin + window.location.pathname;
    const qrUrl = `${currentUrl}?room=${roomCode}`;

    // Create QR code
    if (typeof (window as any).QRCode !== 'undefined') {
      (window as any).QRCode.toCanvas(qrContainer, qrUrl, {
        width: 200,
        height: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }, (error) => {
        if (error) {
          console.error('QR code generation failed:', error);
          qrContainer.innerHTML = '<p>QR code generation failed</p>';
        } else {
          qrContainer.innerHTML += `<p style="margin-top: 10px; font-size: 12px; color: #666;">Scan to join room: ${roomCode}</p>`;
        }
      });
    } else {
      qrContainer.innerHTML = '<p>QR code library not loaded</p>';
    }
  }

  private updatePlayerStatus(role: 'host' | 'guest', status: string): void {
    const player1Status = document.getElementById('player1Status');
    if (player1Status) {
      player1Status.textContent = status;
    }
  }

  private updateConnectionStatus(status: string, connected: boolean): void {
    const statusElement = document.getElementById('connectionStatus');
    const indicatorElement = document.getElementById('connectionIndicator');
    
    if (statusElement) {
      statusElement.textContent = status;
    }
    
    if (indicatorElement) {
      indicatorElement.className = `connection-indicator ${connected ? 'connected' : ''}`;
    }
  }

  private logMessage(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const logElement = document.getElementById('gameLog');
    if (logElement) {
      const entry = document.createElement('div');
      entry.className = `log-entry ${type}`;
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      logElement.appendChild(entry);
      logElement.scrollTop = logElement.scrollHeight;
    }
  }
}

// Initialize multiplayer game
export function startTicTacToeGame(): void {
  const gameManager = new MultiplayerTicTacToeManager();
  
  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    gameManager.initialize();
  });
}
