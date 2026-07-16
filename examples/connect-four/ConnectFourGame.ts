/**
 * ConnectFourGame - Multiplayer Connect Four using GameWork v2
 *
 * Same architecture as the tic-tac-toe example: pure game engine,
 * DOM-bound UI engine, and a manager driving the invite/join lobby flow
 * over the WebRTC network engine. Host plays red (R), joiner yellow (Y).
 */

import QRCode from 'qrcode';
import { GameWork, BaseGameState, GameAction, GameConfig } from '../../src';
import { WebRTCNetworkEngine } from '../../src/engines/WebRTCNetworkEngine';
import { NetworkMessage } from '../../src/types/GameTypes';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';

export const COLS = 7;
export const ROWS = 6;

export type C4Mark = 'R' | 'Y';

export interface ConnectFourState extends BaseGameState {
  board: (C4Mark | null)[]; // row-major, row 0 = top
  currentPlayer: C4Mark;
  winner: C4Mark | null;
  winningCells: number[];
  gameOver: boolean;
  moveCount: number;
}

export interface ConnectFourAction extends GameAction {
  type: 'MOVE' | 'RESTART';
  payload: {
    column?: number;
  };
}

// Connect Four Game Engine
export class ConnectFourEngine {
  processAction(state: ConnectFourState, action: ConnectFourAction): ConnectFourState {
    switch (action.type) {
      case 'MOVE':
        return this.processMove(state, action);
      case 'RESTART':
        return this.getInitialState();
      default:
        return state;
    }
  }

  update(state: ConnectFourState, deltaTime: number): ConnectFourState {
    return state;
  }

  validateAction(action: ConnectFourAction): boolean {
    if (action.type === 'MOVE') {
      return action.payload.column !== undefined &&
             action.payload.column >= 0 &&
             action.payload.column < COLS;
    }
    return action.type === 'RESTART';
  }

  getInitialState(): ConnectFourState {
    return {
      id: 'connect-four',
      timestamp: Date.now(),
      version: 1,
      board: Array(COLS * ROWS).fill(null),
      currentPlayer: 'R',
      winner: null,
      winningCells: [],
      gameOver: false,
      moveCount: 0
    };
  }

  private processMove(state: ConnectFourState, action: ConnectFourAction): ConnectFourState {
    const column = action.payload.column!;

    if (state.gameOver) return state;

    // Drop to the lowest empty row in the column
    let landed = -1;
    for (let row = ROWS - 1; row >= 0; row--) {
      if (state.board[row * COLS + column] === null) {
        landed = row * COLS + column;
        break;
      }
    }
    if (landed === -1) return state; // Column full

    const newBoard = [...state.board];
    newBoard[landed] = state.currentPlayer;

    const newState: ConnectFourState = {
      ...state,
      board: newBoard,
      currentPlayer: state.currentPlayer === 'R' ? 'Y' : 'R',
      moveCount: state.moveCount + 1,
      timestamp: Date.now(),
      version: state.version + 1
    };

    const winningCells = this.findWinningCells(newBoard, landed);
    if (winningCells.length) {
      newState.winner = state.currentPlayer;
      newState.winningCells = winningCells;
      newState.gameOver = true;
    } else if (newState.moveCount === COLS * ROWS) {
      newState.gameOver = true;
    }

    return newState;
  }

  private findWinningCells(board: (C4Mark | null)[], lastIndex: number): number[] {
    const mark = board[lastIndex];
    if (!mark) return [];

    const row = Math.floor(lastIndex / COLS);
    const col = lastIndex % COLS;
    const directions: [number, number][] = [
      [0, 1],  // horizontal
      [1, 0],  // vertical
      [1, 1],  // diagonal down-right
      [1, -1]  // diagonal down-left
    ];

    for (const [dr, dc] of directions) {
      const line = [lastIndex];
      for (const sign of [1, -1]) {
        let r = row + dr * sign;
        let c = col + dc * sign;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === mark) {
          line.push(r * COLS + c);
          r += dr * sign;
          c += dc * sign;
        }
      }
      if (line.length >= 4) return line;
    }

    return [];
  }
}

// Connect Four UI Engine — renders into the static #gameBoard / #status elements
export class ConnectFourUI {
  private boardElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private playAgainButton: HTMLElement | null = null;
  private localMark: C4Mark | null = null;

  initialize(): void {
    this.boardElement = document.getElementById('gameBoard');
    this.statusElement = document.getElementById('status');
    this.playAgainButton = document.getElementById('playAgainBtn');
    this.createCells();
  }

  setLocalMark(mark: C4Mark): void {
    this.localMark = mark;
  }

  render(state: ConnectFourState): void {
    this.updateBoard(state);
    this.updateStatus(state);
    if (this.playAgainButton) {
      this.playAgainButton.hidden = !state.gameOver;
    }
  }

  destroy(): void {
    this.boardElement = null;
    this.statusElement = null;
    this.playAgainButton = null;
  }

  updateRoom(room: any): void {
    // Room updates not needed for Connect Four
  }

  private createCells(): void {
    if (!this.boardElement || this.boardElement.childElementCount) return;
    for (let i = 0; i < COLS * ROWS; i++) {
      const cell = document.createElement('div');
      cell.className = 'c4-cell';
      cell.dataset.index = i.toString();
      this.boardElement.appendChild(cell);
    }
  }

  private updateBoard(state: ConnectFourState): void {
    if (!this.boardElement) return;

    const notMyTurn = this.localMark !== null && state.currentPlayer !== this.localMark;
    const cells = this.boardElement.querySelectorAll<HTMLElement>('.c4-cell');
    cells.forEach((cell, index) => {
      const value = state.board[index];
      cell.classList.toggle('r', value === 'R');
      cell.classList.toggle('y', value === 'Y');
      cell.classList.toggle('winning', state.winningCells.includes(index));
      cell.classList.toggle('disabled', state.gameOver || notMyTurn);
    });
  }

  private updateStatus(state: ConnectFourState): void {
    if (!this.statusElement) return;

    if (state.winner) {
      this.statusElement.textContent = state.winner === this.localMark ? 'You win!' : 'They win!';
    } else if (state.gameOver) {
      this.statusElement.textContent = "It's a tie!";
    } else if (this.localMark) {
      this.statusElement.textContent = state.currentPlayer === this.localMark ? 'Your turn' : 'Their turn';
    } else {
      this.statusElement.textContent = `Current player: ${state.currentPlayer === 'R' ? 'Red' : 'Yellow'}`;
    }
  }
}

// Multiplayer Connect Four Game Factory
export function createConnectFourGame(playerId: string): GameWork<ConnectFourState, ConnectFourAction> {
  const engine = new ConnectFourEngine();
  const ui = new ConnectFourUI();

  const networkEngine = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, playerId);

  const config: GameConfig<ConnectFourState, ConnectFourAction> = {
    initialState: engine.getInitialState(),
    maxPlayers: 2,
    gameName: 'ConnectFour',
    version: '1.0.0',
    debugMode: true
  };

  const game = new GameWork(config);

  game['container'].register('GameEngine', () => engine);
  game['container'].register('UIEngine', () => ui);
  game['container'].register('NetworkEngine', () => networkEngine);

  return game;
}

type ViewId = 'homeView' | 'inviteView' | 'joinView' | 'gameView';
const ALL_VIEWS: ViewId[] = ['homeView', 'inviteView', 'joinView', 'gameView'];

// Multiplayer Connect Four Game Manager
class MultiplayerConnectFourManager {
  private game: GameWork<ConnectFourState, ConnectFourAction> | null = null;
  private networkEngine: WebRTCNetworkEngine | null = null;
  private ui: ConnectFourUI | null = null;
  private playerId: string;
  private lastState: ConnectFourState;
  private roomRequestInFlight: boolean = false;

  constructor() {
    this.playerId = this.generatePlayerId();
    this.lastState = new ConnectFourEngine().getInitialState();
  }

  async initialize(): Promise<void> {
    try {
      this.game = createConnectFourGame(this.playerId);
      this.networkEngine = this.game['container'].resolve('NetworkEngine') as WebRTCNetworkEngine;
      this.ui = this.game['container'].resolve('UIEngine') as ConnectFourUI;

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
      this.joinRoom(roomCode.toUpperCase());
    }
  }

  private async createRoom(): Promise<void> {
    if (!this.networkEngine || this.roomRequestInFlight) return;

    this.roomRequestInFlight = true;
    try {
      const roomCode = await this.networkEngine.createRoom();
      this.ui?.setLocalMark('R');
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
      this.ui?.setLocalMark('Y');
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

    this.networkEngine.onPeerJoined(() => {
      this.showMessage('Player joined, connecting…');
    });

    this.networkEngine.onPeerConnected(() => {
      this.showMessage(null);
      // Both players are connected and this game takes no others, so the
      // signaling server is done; the rest runs peer-to-peer.
      this.networkEngine?.closeSignaling();
      this.startGame();
    });

    this.networkEngine.onPeerFailed(() => {
      this.showMessage('Could not connect to the other player. If you are both on mobile data, try Wi-Fi.');
    });

    this.setupUIEventHandlers();
  }

  private setupUIEventHandlers(): void {
    document.getElementById('inviteBtn')?.addEventListener('click', () => {
      this.createRoom();
    });

    document.getElementById('joinBtn')?.addEventListener('click', () => {
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

    document.getElementById('gameBoard')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('c4-cell') && !target.classList.contains('disabled')) {
        this.makeMove(parseInt(target.dataset.index!) % COLS);
      }
    });

    document.getElementById('playAgainBtn')?.addEventListener('click', () => {
      this.restartGame();
    });
  }

  private makeMove(column: number): void {
    if (!this.game || !this.networkEngine) return;

    const hasOpponent = this.networkEngine.getConnections()
      .some(peerId => this.networkEngine!.isConnected(peerId));
    if (!hasOpponent) return;

    const action: ConnectFourAction = {
      type: 'MOVE',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: { column }
    };

    this.game.dispatchAction(action);
    this.broadcastAction(action);
  }

  private restartGame(): void {
    if (!this.game) return;

    const action: ConnectFourAction = {
      type: 'RESTART',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: {}
    };

    this.game.dispatchAction(action);
    this.broadcastAction(action);
  }

  private broadcastAction(action: ConnectFourAction): void {
    if (!this.networkEngine) return;

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
      const action = message.payload as ConnectFourAction;

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
export function startConnectFourGame(): void {
  const gameManager = new MultiplayerConnectFourManager();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => gameManager.initialize());
  } else {
    gameManager.initialize();
  }
}
