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
import { GameWork, BaseGameState, GameAction, GameConfig, EntityHandle, Role, Session, WebRTCNetworkEngine } from '../../src';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';

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
  private playAgainButton: HTMLElement | null = null;
  private localMark: 'X' | 'O' | null = null;

  initialize(): void {
    this.boardElement = document.getElementById('gameBoard');
    this.statusElement = document.getElementById('status');
    this.playAgainButton = document.getElementById('playAgainBtn');
  }

  setLocalMark(mark: 'X' | 'O'): void {
    this.localMark = mark;
  }

  render(state: TicTacToeState): void {
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
    // Room updates not needed for TicTacToe
  }

  private updateBoard(state: TicTacToeState): void {
    if (!this.boardElement) return;

    const cells = this.boardElement.querySelectorAll<HTMLElement>('.cell');
    const notMyTurn = this.localMark !== null && state.currentPlayer !== this.localMark;
    cells.forEach((cell, index) => {
      const value = state.board[index];
      cell.textContent = value || '';
      cell.classList.toggle('x', value === 'X');
      cell.classList.toggle('o', value === 'O');
      cell.classList.toggle('disabled', value !== null || state.gameOver || notMyTurn);
    });
  }

  private updateStatus(state: TicTacToeState): void {
    if (!this.statusElement) return;

    if (state.winner) {
      this.statusElement.textContent = state.winner === this.localMark ? 'You win!' : 'They win!';
    } else if (state.gameOver) {
      this.statusElement.textContent = "It's a tie!";
    } else if (this.localMark) {
      this.statusElement.textContent = state.currentPlayer === this.localMark ? 'Your turn' : 'Their turn';
    } else {
      this.statusElement.textContent = `Current Player: ${state.currentPlayer}`;
    }
  }
}

interface TicTacToeParts {
  game: GameWork<TicTacToeState, TicTacToeAction>;
  ui: TicTacToeUI;
  session: Session;
}

// One role, one channel: both players write moves and both read them. Nothing
// is nondeterministic and nothing is hidden, so there is no authority and no
// private channel — the plainest wiring the session layer allows.
const PLAYER_ROLE: Role = { name: 'player', reads: ['move'], writes: ['move'] };

// Multiplayer TicTacToe Game Factory
export function createTicTacToeGame(playerId: string): TicTacToeParts {
  const engine = new TicTacToeEngine();
  const ui = new TicTacToeUI();

  const networkEngine = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, playerId);

  const session = new Session(networkEngine, {
    mode: { connectivity: 'mesh', authority: 'replicated' },
    deviceId: playerId,
    roles: [PLAYER_ROLE],
    entities: [{ role: 'player' }],
    maxEntities: { player: 2 }
  });

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

  return { game, ui, session };
}

type ViewId = 'homeView' | 'inviteView' | 'joinView' | 'gameView';
const ALL_VIEWS: ViewId[] = ['homeView', 'inviteView', 'joinView', 'gameView'];

// Multiplayer TicTacToe Game Manager
class MultiplayerTicTacToeManager {
  private game: GameWork<TicTacToeState, TicTacToeAction> | null = null;
  private session: Session | null = null;
  private ui: TicTacToeUI | null = null;
  private playerId: string;
  private lastState: TicTacToeState;
  private roomRequestInFlight: boolean = false;
  private playing: boolean = false;
  private me: EntityHandle | null = null;

  constructor() {
    this.playerId = this.generatePlayerId();
    this.lastState = new TicTacToeEngine().getInitialState();
  }

  async initialize(): Promise<void> {
    try {
      const parts = createTicTacToeGame(this.playerId);
      this.game = parts.game;
      this.ui = parts.ui;
      this.session = parts.session;

      await this.session.initialize();
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
    if (!this.session || this.roomRequestInFlight) return;

    this.roomRequestInFlight = true;
    try {
      const roomCode = await this.session.host();
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
    if (!this.session || this.roomRequestInFlight) return;

    this.roomRequestInFlight = true;
    try {
      await this.session.join(roomCode);
      // Show the board straight away, as before. The seat — and with it the
      // mark — only becomes known once the host has seated us, which cannot
      // happen until the data channel is up.
      this.showMessage('Connecting…');
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
    if (!this.game || !this.session) return;

    this.game.on('game:stateChanged', (state) => {
      this.lastState = state as TicTacToeState;
      this.ui?.render(this.lastState);
    });

    // Bind once the registry lands — a joiner does not know its own entity id
    // before the host has assigned it. Admission order is the side: whoever
    // joined first takes the opening move.
    this.session.onRegistry(() => {
      const mine = this.session!.localEntityOfRole('player');
      const players = this.session!.entitiesOfRole('player');
      if (mine && !this.me) {
        this.me = this.session!.actAs(mine.entityId);
        // Both players read 'move', this device included, so a move reaches the
        // engine by exactly one path no matter who made it.
        this.me.on('move', (payload) => this.game?.dispatchAction(payload as TicTacToeAction));
        const index = players.findIndex((entity) => entity.entityId === mine.entityId);
        this.ui?.setLocalMark(index === 0 ? 'X' : 'O');
      }
      if (players.length === 2) this.beginPlay();
    });

    // The server sees the join long before the peer-to-peer channel is up (and
    // will see it even if that channel never comes up), so say so right away.
    this.session.onPeerJoined(() => {
      this.showMessage('Player joined, connecting…');
    });

    this.session.onPeerFailed(() => {
      this.showMessage('Could not connect to the other player. If you are both on mobile data, try Wi-Fi.');
    });

    this.setupUIEventHandlers();
  }

  /**
   * Both seats are filled, which is only knowable once the data channel carried
   * the seating across. This game takes no further players, so lock the table —
   * under mesh that drops signaling on both devices and the rest is peer-to-peer.
   */
  private beginPlay(): void {
    if (this.playing) return;
    this.playing = true;
    this.showMessage(null);
    this.session?.lock();
    this.startGame();
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

    const playAgainButton = document.getElementById('playAgainBtn');
    playAgainButton?.addEventListener('click', () => {
      this.restartGame();
    });
  }

  private restartGame(): void {
    this.me?.write('move', {
      type: 'RESTART',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: {}
    } as TicTacToeAction);
  }

  private makeMove(position: number): void {
    // Don't play against yourself while the opponent's channel is still connecting
    if (!this.me || !this.playing) return;

    this.me.write('move', {
      type: 'MOVE',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: { position }
    } as TicTacToeAction);
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
