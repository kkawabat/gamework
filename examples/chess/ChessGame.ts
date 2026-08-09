/**
 * ChessGame - Multiplayer Chess using GameWork v2
 *
 * Same architecture as the tic-tac-toe example: pure game engine,
 * DOM-bound UI engine, and a manager driving the invite/join lobby flow
 * over the WebRTC network engine. Host plays white, joiner black.
 *
 * Rules (legal moves, castling, en passant, check/checkmate/stalemate)
 * come from chess.js; the engine state carries the FEN so every action
 * is replayed deterministically on both peers. Pawns auto-promote to queens.
 */

import QRCode from 'qrcode';
import { Chess } from 'chess.js';
import { GameWork, BaseGameState, GameAction, GameConfig, EntityHandle, Role, Session } from '../../src';
import { WebRTCNetworkEngine } from '../../src/engines/WebRTCNetworkEngine';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';

export type ChessColor = 'w' | 'b';

export interface ChessSquare {
  type: string;  // p n b r q k
  color: ChessColor;
}

export interface ChessState extends BaseGameState {
  fen: string;
  board: (ChessSquare | null)[]; // 64 squares, row-major from rank 8 (a8 = 0)
  turn: ChessColor;
  inCheck: boolean;
  gameOver: boolean;
  winner: ChessColor | null;
  isDraw: boolean;
  lastMove: { from: string; to: string } | null;
  moveCount: number;
}

export interface ChessAction extends GameAction {
  type: 'MOVE' | 'RESTART';
  payload: {
    from?: string;
    to?: string;
    promotion?: string;
  };
}

const SQUARE_RE = /^[a-h][1-8]$/;

export function squareName(index: number): string {
  const row = Math.floor(index / 8); // 0 = rank 8
  const col = index % 8;             // 0 = file a
  return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function snapshotState(chess: Chess, previous: Pick<BaseGameState, 'version'>, lastMove: { from: string; to: string } | null, moveCount: number): ChessState {
  const board = chess.board().flat().map(square =>
    square ? { type: square.type, color: square.color as ChessColor } : null
  );
  return {
    id: 'chess',
    timestamp: Date.now(),
    version: previous.version + 1,
    fen: chess.fen(),
    board,
    turn: chess.turn() as ChessColor,
    inCheck: chess.isCheck(),
    gameOver: chess.isGameOver(),
    winner: chess.isCheckmate() ? (chess.turn() === 'w' ? 'b' : 'w') : null,
    isDraw: chess.isGameOver() && !chess.isCheckmate(),
    lastMove,
    moveCount
  };
}

// Chess Game Engine — chess.js provides the rules, FEN carries the state
export class ChessEngine {
  processAction(state: ChessState, action: ChessAction): ChessState {
    switch (action.type) {
      case 'MOVE':
        return this.processMove(state, action);
      case 'RESTART':
        return this.getInitialState();
      default:
        return state;
    }
  }

  update(state: ChessState, deltaTime: number): ChessState {
    return state;
  }

  validateAction(action: ChessAction): boolean {
    if (action.type === 'MOVE') {
      return typeof action.payload.from === 'string' && SQUARE_RE.test(action.payload.from) &&
             typeof action.payload.to === 'string' && SQUARE_RE.test(action.payload.to);
    }
    return action.type === 'RESTART';
  }

  getInitialState(): ChessState {
    const chess = new Chess();
    return snapshotState(chess, { version: 0 }, null, 0);
  }

  private processMove(state: ChessState, action: ChessAction): ChessState {
    if (state.gameOver) return state;

    const { from, to, promotion } = action.payload;
    const chess = new Chess(state.fen);
    try {
      chess.move({ from: from!, to: to!, promotion: promotion || 'q' });
    } catch {
      return state; // Illegal move
    }

    return snapshotState(chess, state, { from: from!, to: to! }, state.moveCount + 1);
  }
}

const PIECE_GLYPHS: Record<ChessColor, Record<string, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

// Chess UI Engine — renders into the static #gameBoard / #status elements.
// The board is flipped for black so each player sees their pieces at the bottom.
export class ChessUI {
  private boardElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private playAgainButton: HTMLElement | null = null;
  private localColor: ChessColor | null = null;
  private selectedSquare: string | null = null;
  private targetSquares: string[] = [];

  initialize(): void {
    this.boardElement = document.getElementById('gameBoard');
    this.statusElement = document.getElementById('status');
    this.playAgainButton = document.getElementById('playAgainBtn');
    this.createSquares();
  }

  setLocalColor(color: ChessColor): void {
    this.localColor = color;
  }

  setSelection(square: string | null, targets: string[]): void {
    this.selectedSquare = square;
    this.targetSquares = targets;
  }

  render(state: ChessState): void {
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
    // Room updates not needed for Chess
  }

  private createSquares(): void {
    if (!this.boardElement || this.boardElement.childElementCount) return;
    for (let i = 0; i < 64; i++) {
      const square = document.createElement('div');
      const row = Math.floor(i / 8);
      const col = i % 8;
      square.className = `chess-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
      this.boardElement.appendChild(square);
    }
  }

  private updateBoard(state: ChessState): void {
    if (!this.boardElement) return;

    const flipped = this.localColor === 'b';
    const squares = this.boardElement.querySelectorAll<HTMLElement>('.chess-square');
    squares.forEach((element, displayIndex) => {
      const index = flipped ? 63 - displayIndex : displayIndex;
      const name = squareName(index);
      const piece = state.board[index];

      element.dataset.square = name;
      element.textContent = piece ? PIECE_GLYPHS[piece.color][piece.type] : '';
      element.classList.toggle('white-piece', piece?.color === 'w');
      element.classList.toggle('black-piece', piece?.color === 'b');
      element.classList.toggle('selected', this.selectedSquare === name);
      element.classList.toggle('target', this.targetSquares.includes(name));
      element.classList.toggle('last-move', state.lastMove !== null && (state.lastMove.from === name || state.lastMove.to === name));
    });
  }

  private updateStatus(state: ChessState): void {
    if (!this.statusElement) return;

    if (state.winner) {
      this.statusElement.textContent = state.winner === this.localColor ? 'Checkmate — you win!' : 'Checkmate — they win!';
    } else if (state.isDraw) {
      this.statusElement.textContent = 'Draw';
    } else if (this.localColor) {
      const turnText = state.turn === this.localColor ? 'Your turn' : 'Their turn';
      this.statusElement.textContent = state.inCheck ? `${turnText} — check!` : turnText;
    } else {
      this.statusElement.textContent = `${state.turn === 'w' ? 'White' : 'Black'} to move`;
    }
  }
}

// Multiplayer Chess Game Factory
// One role, one channel: both players write moves and both read them. Nothing
// is nondeterministic and nothing is hidden, so there is no authority and no
// private channel — the plainest wiring the session layer allows.
const PLAYER_ROLE: Role = { name: 'player', reads: ['move'], writes: ['move'] };

export function createChessGame(playerId: string): { game: GameWork<ChessState, ChessAction>; ui: ChessUI; session: Session } {
  const engine = new ChessEngine();
  const ui = new ChessUI();

  const networkEngine = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, playerId);

  const session = new Session(networkEngine, {
    mode: { connectivity: 'mesh', authority: 'replicated' },
    deviceId: playerId,
    roles: [PLAYER_ROLE],
    entities: [{ role: 'player' }],
    maxEntities: { player: 2 }
  });

  const config: GameConfig<ChessState, ChessAction> = {
    initialState: engine.getInitialState(),
    maxPlayers: 2,
    gameName: 'Chess',
    version: '1.0.0',
    debugMode: true
  };

  const game = new GameWork(config);

  game['container'].register('GameEngine', () => engine);
  game['container'].register('UIEngine', () => ui);
  game['container'].register('NetworkEngine', () => networkEngine);

  return { game, ui, session };
}

type ViewId = 'homeView' | 'inviteView' | 'joinView' | 'gameView';
const ALL_VIEWS: ViewId[] = ['homeView', 'inviteView', 'joinView', 'gameView'];

// Multiplayer Chess Game Manager
class MultiplayerChessManager {
  private game: GameWork<ChessState, ChessAction> | null = null;
  private session: Session | null = null;
  private ui: ChessUI | null = null;
  private playerId: string;
  private localColor: ChessColor | null = null;
  private lastState: ChessState;
  private selectedSquare: string | null = null;
  private roomRequestInFlight: boolean = false;
  private playing: boolean = false;
  private me: EntityHandle | null = null;

  constructor() {
    this.playerId = this.generatePlayerId();
    this.lastState = new ChessEngine().getInitialState();
  }

  async initialize(): Promise<void> {
    try {
      const parts = createChessGame(this.playerId);
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
      // The colour arrives with the seating, once the host has seated us.
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

  private setLocalColor(color: ChessColor): void {
    this.localColor = color;
    this.ui?.setLocalColor(color);
  }

  private startGame(): void {
    this.showView('gameView');
    this.ui?.render(this.lastState);
  }

  private setupEventHandlers(): void {
    if (!this.game || !this.session) return;

    this.game.on('game:stateChanged', (state) => {
      this.lastState = state as ChessState;
      this.clearSelection();
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
        this.me.on('move', (payload) => this.game?.dispatchAction(payload as ChessAction));
        const index = players.findIndex((entity) => entity.entityId === mine.entityId);
        this.setLocalColor(index === 0 ? 'w' : 'b');
      }
      if (players.length === 2) this.beginPlay();
    });

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
      if (target.classList.contains('chess-square') && target.dataset.square) {
        this.handleSquareClick(target.dataset.square);
      }
    });

    document.getElementById('playAgainBtn')?.addEventListener('click', () => {
      this.restartGame();
    });
  }

  private handleSquareClick(square: string): void {
    if (!this.session || !this.playing || !this.localColor) return;
    if (this.lastState.gameOver || this.lastState.turn !== this.localColor) return;

    const chess = new Chess(this.lastState.fen);

    // Second click on a highlighted target completes the move
    if (this.selectedSquare && this.selectedSquare !== square) {
      const legal = chess.moves({ square: this.selectedSquare as any, verbose: true }) as any[];
      if (legal.some(move => move.to === square)) {
        this.makeMove(this.selectedSquare, square);
        return;
      }
    }

    // Otherwise (re)select one of your own pieces
    const piece = chess.get(square as any);
    if (piece && piece.color === this.localColor && this.selectedSquare !== square) {
      const targets = (chess.moves({ square: square as any, verbose: true }) as any[]).map(move => move.to);
      this.selectedSquare = square;
      this.ui?.setSelection(square, targets);
    } else {
      this.clearSelection();
    }
    this.ui?.render(this.lastState);
  }

  private clearSelection(): void {
    this.selectedSquare = null;
    this.ui?.setSelection(null, []);
  }

  private makeMove(from: string, to: string): void {
    this.me?.write('move', {
      type: 'MOVE',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: { from, to, promotion: 'q' }
    });
  }

  private restartGame(): void {
    this.me?.write('move', {
      type: 'RESTART',
      playerId: this.playerId,
      timestamp: Date.now(),
      payload: {}
    });
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
export function startChessGame(): void {
  const gameManager = new MultiplayerChessManager();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => gameManager.initialize());
  } else {
    gameManager.initialize();
  }
}
