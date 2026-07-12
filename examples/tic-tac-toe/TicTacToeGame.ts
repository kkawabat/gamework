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

import QRCode from 'qrcode';
import { GameWork, BaseGameState, GameAction, GameConfig } from '../../src';
import { WebRTCNetworkEngine, WebRTCNetworkEngineConfig } from '../../src/engines/WebRTCNetworkEngine';
import { NetworkMessage } from '../../src/types/GameTypes';

// Replaced at build time by Vite's `define` (vite.config.ts); undefined in dev
declare const __SIGNALING_SERVER_URL__: string | undefined;

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

// TicTacToe UI Engine — renders into the static #gameBoard / #status elements
export class TicTacToeUI {
  private boardElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;

  initialize(): void {
    this.boardElement = document.getElementById('gameBoard');
    this.statusElement = document.getElementById('status');
  }

  render(state: TicTacToeState): void {
    this.updateBoard(state);
    this.updateStatus(state);
  }

  destroy(): void {
    this.boardElement = null;
    this.statusElement = null;
  }

  updateRoom(room: any): void {
    // Room updates not needed for TicTacToe
  }

  private updateBoard(state: TicTacToeState): void {
    if (!this.boardElement) return;

    const cells = this.boardElement.querySelectorAll<HTMLElement>('.cell');
    cells.forEach((cell, index) => {
      const value = state.board[index];
      cell.textContent = value || '';
      cell.classList.toggle('x', value === 'X');
      cell.classList.toggle('o', value === 'O');
      cell.classList.toggle('disabled', value !== null || state.gameOver);
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
export function createTicTacToeGame(playerId: string): GameWork<TicTacToeState, TicTacToeAction> {
  const engine = new TicTacToeEngine();
  const ui = new TicTacToeUI();

  const networkConfig: WebRTCNetworkEngineConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    signalingServerUrl:
      (typeof __SIGNALING_SERVER_URL__ !== 'undefined' && __SIGNALING_SERVER_URL__) ||
      'ws://localhost:8080'
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

type ViewId = 'homeView' | 'inviteView' | 'joinView' | 'gameView';
const ALL_VIEWS: ViewId[] = ['homeView', 'inviteView', 'joinView', 'gameView'];

// Multiplayer TicTacToe Game Manager
class MultiplayerTicTacToeManager {
  private game: GameWork<TicTacToeState, TicTacToeAction> | null = null;
  private networkEngine: WebRTCNetworkEngine | null = null;
  private ui: TicTacToeUI | null = null;
  private playerId: string;
  private lastState: TicTacToeState;
  private roomRequestInFlight: boolean = false;

  constructor() {
    this.playerId = this.generatePlayerId();
    this.lastState = new TicTacToeEngine().getInitialState();
  }

  async initialize(): Promise<void> {
    try {
      this.game = createTicTacToeGame(this.playerId);
      this.networkEngine = this.game['container'].resolve('NetworkEngine') as WebRTCNetworkEngine;
      this.ui = this.game['container'].resolve('UIEngine') as TicTacToeUI;

      await this.networkEngine.initialize();
      await this.game.initialize();

      this.setupEventHandlers();
      this.handleURLParameters();
    } catch (error) {
      console.error('Failed to initialize game:', error);
      this.showMessage(`Could not connect: ${(error as Error).message}`);
    }
  }

  private handleURLParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');

    if (roomCode && roomCode.length === 6) {
      // Auto-join room from QR-code URL
      this.joinRoom(roomCode.toUpperCase());
    }
  }

  private async createRoom(): Promise<void> {
    if (!this.networkEngine || this.roomRequestInFlight) return;

    this.roomRequestInFlight = true;
    try {
      const roomCode = await this.networkEngine.createRoom();
      this.showMessage(null);
      this.showRoomInvite(roomCode);
      await this.generateQRCode(roomCode);
    } catch (error) {
      console.error('Failed to create room:', error);
      this.showMessage(`Failed to create room: ${(error as Error).message}`);
      this.showView('homeView');
    } finally {
      this.roomRequestInFlight = false;
    }
  }

  private async joinRoom(roomCode: string): Promise<void> {
    if (!this.networkEngine || this.roomRequestInFlight) return;

    this.roomRequestInFlight = true;
    try {
      await this.networkEngine.joinRoom(roomCode);
      this.showMessage(null);
      this.startGame();
    } catch (error) {
      console.error('Failed to join room:', error);
      this.showMessage(`Failed to join room: ${(error as Error).message}`);
      this.showView('homeView');
    } finally {
      this.roomRequestInFlight = false;
    }
  }

  private startGame(): void {
    this.showView('gameView');
    this.ui?.render(this.lastState);
  }

  private setupEventHandlers(): void {
    if (!this.game || !this.networkEngine) return;

    this.game.on('game:stateChanged', (state) => {
      this.lastState = state;
      this.ui?.render(state);
    });

    this.networkEngine.onMessage((peerId, message) => {
      this.handleNetworkMessage(peerId, message);
    });

    // Both sides land on the board once the data channel is up:
    // the host leaves the QR screen, the joiner gets its cells enabled.
    this.networkEngine.onPeerConnected(() => {
      this.startGame();
    });

    this.setupUIEventHandlers();
  }

  private setupUIEventHandlers(): void {
    const inviteButton = document.getElementById('inviteBtn');
    inviteButton?.addEventListener('click', () => {
      this.createRoom();
    });

    const joinViewButton = document.getElementById('joinBtn');
    joinViewButton?.addEventListener('click', () => {
      this.showView('joinView');
      document.getElementById('roomCodeInput')?.focus();
    });

    const joinRoomButton = document.getElementById('joinRoomBtn');
    const roomInput = document.getElementById('roomCodeInput') as HTMLInputElement | null;
    const submitJoin = () => {
      const roomCode = roomInput?.value.trim().toUpperCase() || '';
      if (roomCode.length === 6) {
        this.joinRoom(roomCode);
      } else {
        this.showMessage('Please enter a valid 6-character room code');
      }
    };
    joinRoomButton?.addEventListener('click', submitJoin);
    roomInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitJoin();
    });

    const gameBoard = document.getElementById('gameBoard');
    gameBoard?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('cell') && !target.classList.contains('disabled')) {
        this.makeMove(parseInt(target.dataset.index!));
      }
    });
  }

  private makeMove(position: number): void {
    if (!this.game || !this.networkEngine) return;

    // Don't play against yourself while the opponent's channel is still connecting
    const hasOpponent = this.networkEngine.getConnections()
      .some(peerId => this.networkEngine!.isConnected(peerId));
    if (!hasOpponent) return;

    const action: TicTacToeAction = {
      type: 'MOVE',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: { position }
    };

    this.game.dispatchAction(action);

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

  private showView(viewId: ViewId): void {
    for (const id of ALL_VIEWS) {
      const element = document.getElementById(id);
      if (element) element.hidden = id !== viewId;
    }
  }

  private showRoomInvite(roomCode: string): void {
    const roomCodeElement = document.getElementById('roomCode');
    if (roomCodeElement) {
      roomCodeElement.textContent = roomCode;
    }
    this.showView('inviteView');
  }

  private async generateQRCode(roomCode: string): Promise<void> {
    const qrContainer = document.getElementById('qrCodeContainer');
    if (!qrContainer) return;

    const qrUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const canvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(canvas, qrUrl, { width: 200, margin: 2 });
      qrContainer.replaceChildren(canvas);
    } catch (error) {
      qrContainer.textContent = 'QR code generation failed';
      console.error('QR code generation failed:', error);
    }
  }

  private showMessage(message: string | null): void {
    const messageElement = document.getElementById('message');
    if (!messageElement) return;
    messageElement.textContent = message || '';
    messageElement.hidden = !message;
  }
}

// Initialize multiplayer game
export function startTicTacToeGame(): void {
  const gameManager = new MultiplayerTicTacToeManager();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => gameManager.initialize());
  } else {
    gameManager.initialize();
  }
}
