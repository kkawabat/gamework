/**
 * Browser layer for two-phone tilt Pong. Game logic and physics live in
 * PongDirector, which is driven across two real sessions in
 * tests/unit/Pong.test.ts — this file handles canvas, tilt and the lobby.
 *
 * The host phone opens with no room code, shows a QR, and holds the referee.
 * The second phone scans it. Both tap Ready, which is also the user gesture iOS
 * requires before it will hand over device orientation.
 */

import QRCode from 'qrcode';
import { Session } from '../../src';
import { WebRTCNetworkEngine } from '../../src/engines/WebRTCNetworkEngine';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';
import { calibrateTilt, enableTilt, tiltState, tiltSteering } from './tilt';
import {
  BALL,
  FIELD,
  PADDLE,
  PONG_ROLES,
  PongDirector,
  PongState,
  WIN_SCORE
} from './PongDirector';

type ViewId = 'homeView' | 'lobbyView' | 'gameView';
const ALL_VIEWS: ViewId[] = ['homeView', 'lobbyView', 'gameView'];

const COLOURS = { green: '#5ad1a0', pink: '#e4739a', ball: '#f4f4f5', line: 'rgba(255,255,255,0.16)' };

class PongManager {
  private session: Session | null = null;
  private director: PongDirector | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly deviceId = `device_${Math.random().toString(36).slice(2, 11)}`;

  private attached = false;
  private isHost = false;
  private ready = false;
  private lastFrame = 0;
  private keyboardSteer = 0;

  async initialize(): Promise<void> {
    const roomCode = new URLSearchParams(window.location.search).get('room');
    this.isHost = !roomCode;

    const network = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, this.deviceId);
    this.session = new Session(network, {
      mode: { connectivity: 'mesh', authority: 'authoritative' },
      deviceId: this.deviceId,
      roles: PONG_ROLES,
      // The host brings the referee as a second entity; both devices bring a
      // paddle. Two players means mesh and star are the same one connection.
      entities: this.isHost ? [{ role: 'referee' }, { role: 'player' }] : [{ role: 'player' }],
      maxEntities: { referee: 1, player: 2 },
      // Both are absolute-value streams at 30Hz, so a lost write is superseded
      // 33ms later — far better than blocking the next one behind a retransmit.
      // `ready` and the registry stay reliable, which is what keeps a dropped
      // packet from hanging the lobby.
      unreliable: ['state', 'paddle:*']
    });

    this.director = new PongDirector(this.session);
    this.setupCanvas();

    this.session.onRegistry(() => {
      if (!this.attached && this.session!.localEntities.length > 0) {
        this.attached = true;
        this.director!.attach();
        this.showView('lobbyView');
      }
      this.renderLobby();
    });
    this.session.onPeerFailed(() => this.showMessage(
      'Could not connect to the other phone. If you are both on mobile data, try Wi-Fi.'
    ));

    try {
      await this.session.initialize();
      if (this.isHost) await this.startHost();
      else await this.session.join(roomCode!.toUpperCase());
    } catch (error) {
      this.showMessage(`Could not connect: ${(error as Error).message}`);
      return;
    }

    document.getElementById('readyBtn')?.addEventListener('click', () => this.onReady());
    this.setupKeyboardFallback();
    requestAnimationFrame((time) => this.frame(time));
  }

  private async startHost(): Promise<void> {
    const roomCode = await this.session!.host();
    const label = document.getElementById('roomCode');
    if (label) label.textContent = roomCode;

    const container = document.getElementById('qrCodeContainer');
    if (!container) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const canvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(canvas, url, { width: 200, margin: 2 });
      container.replaceChildren(canvas);
    } catch {
      container.textContent = url;
    }
  }

  /**
   * The Ready tap does triple duty: it is the user gesture iOS requires before
   * releasing orientation data, the moment to zero the steering on however the
   * player is holding the phone, and the signal the referee waits for.
   */
  private async onReady(): Promise<void> {
    if (this.ready) return;
    const granted = await enableTilt();
    if (granted) calibrateTilt();
    else if (tiltState().supported) this.showMessage('Tilt was declined — use the arrow keys or a phone.');

    this.ready = true;
    this.director?.setReady();
    this.renderLobby();
  }

  /**
   * Player 2's field is drawn mirrored so they sit at the visual bottom.
   * Screen-left is then +x in field space — negate so a left tilt still
   * moves the paddle left on their screen.
   */
  private screenSteering(): number {
    const raw = tiltState().receiving ? tiltSteering() : this.keyboardSteer;
    return this.director?.myIndex === 1 ? -raw : raw;
  }

  // --- loop ----------------------------------------------------------------

  private frame(time: number): void {
    const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, 0.1) : 0;
    this.lastFrame = time;

    if (this.director && dt > 0) {
      this.director.steer(this.screenSteering(), dt);
      this.director.step(dt); // no-op unless this device holds the referee
      this.syncView();
      this.resizeCanvas();
      this.draw();
    }
    requestAnimationFrame((next) => this.frame(next));
  }

  private syncView(): void {
    const inGame = this.director!.state.phase !== 'lobby';
    if (inGame) {
      if (document.getElementById('gameView')?.hidden) this.showView('gameView');
    } else {
      this.renderLobby();
    }
  }

  // --- rendering -----------------------------------------------------------

  private setupCanvas(): void {
    this.canvas = document.getElementById('pongCanvas') as HTMLCanvasElement | null;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => this.resizeCanvas());
  }

  /**
   * `#gameView` starts `hidden`, so a measurement at load is 0×0. Skip that
   * rather than baking a blank bitmap; the frame loop retries once the view is
   * shown and laid out.
   */
  private resizeCanvas(): void {
    if (!this.canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Both phones render themselves at the bottom, so the canonical field is
   * flipped for whoever defends the top. Coordinates arrive in field units and
   * are letterboxed into whatever the screen is.
   */
  private draw(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const director = this.director;
    if (!ctx || !canvas || !director) return;

    const state = director.state;
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const originX = (canvas.width - FIELD.width * scale) / 2;
    const originY = (canvas.height - FIELD.height * scale) / 2;
    const flipped = director.myIndex === 1;
    const toX = (x: number): number => originX + (flipped ? FIELD.width - x : x) * scale;
    const toY = (y: number): number => originY + (flipped ? FIELD.height - y : y) * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(originX, originY, FIELD.width * scale, FIELD.height * scale);

    ctx.strokeStyle = COLOURS.line;
    ctx.lineWidth = Math.max(1, scale * 0.004);
    ctx.beginPath();
    ctx.moveTo(originX, toY(FIELD.height / 2));
    ctx.lineTo(originX + FIELD.width * scale, toY(FIELD.height / 2));
    ctx.stroke();

    const me = director.myId;
    for (const entityId of state.players) {
      const isMine = entityId === me;
      // Our own paddle comes from local tilt, not from the referee's copy of
      // it: waiting a round trip to see our own hand move is the one lag a
      // player always notices.
      const x = isMine ? director.myPaddle : state.paddles[entityId] ?? FIELD.width / 2;
      const y = state.players.indexOf(entityId) === 0 ? FIELD.height - PADDLE.inset : PADDLE.inset;
      ctx.fillStyle = state.players.indexOf(entityId) === 1 ? COLOURS.pink : COLOURS.green;
      ctx.fillRect(
        toX(x) - (PADDLE.width * scale) / 2,
        toY(y) - (PADDLE.thickness * scale) / 2,
        PADDLE.width * scale,
        PADDLE.thickness * scale
      );
    }

    if (state.phase === 'playing' || state.phase === 'countdown') {
      ctx.fillStyle = COLOURS.ball;
      ctx.beginPath();
      ctx.arc(toX(state.ball.x), toY(state.ball.y), BALL.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawOverlay(ctx, canvas, state);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: PongState): void {
    const me = this.director!.myId;
    const opponent = state.players.find((id) => id !== me);
    const mine = me ? state.scores[me] ?? 0 : 0;
    const theirs = opponent ? state.scores[opponent] ?? 0 : 0;

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.round(canvas.height * 0.05)}px system-ui, sans-serif`;
    ctx.fillText(`${theirs}`, canvas.width / 2, canvas.height * 0.42);
    ctx.fillText(`${mine}`, canvas.width / 2, canvas.height * 0.60);

    if (state.phase === 'countdown') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${Math.round(canvas.height * 0.12)}px system-ui, sans-serif`;
      ctx.fillText(`${Math.ceil(state.countdown)}`, canvas.width / 2, canvas.height / 2);
    } else if (state.phase === 'over') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `600 ${Math.round(canvas.height * 0.06)}px system-ui, sans-serif`;
      ctx.fillText(state.winner === me ? 'You win!' : 'They win!', canvas.width / 2, canvas.height / 2);
      ctx.font = `${Math.round(canvas.height * 0.03)}px system-ui, sans-serif`;
      ctx.fillText(`First to ${WIN_SCORE}`, canvas.width / 2, canvas.height / 2 + canvas.height * 0.05);
    }
  }

  private renderLobby(): void {
    const players = this.session?.entitiesOfRole('player') ?? [];
    const status = document.getElementById('lobbyStatus');
    if (status) {
      status.textContent = players.length < 2
        ? 'Waiting for the second phone…'
        : this.ready ? 'Waiting for the other player to be ready…'
        : 'Both phones connected. Hold your phone flat and tap Ready.';
    }
    const button = document.getElementById('readyBtn') as HTMLButtonElement | null;
    if (button) {
      button.disabled = players.length < 2 || this.ready;
      button.textContent = this.ready ? 'Ready ✓' : 'Ready';
    }
    const invite = document.getElementById('inviteBlock');
    if (invite) invite.hidden = !this.isHost || players.length >= 2;
  }

  /** Desktop fallback so the demo is playable without two phones. */
  private setupKeyboardFallback(): void {
    const set = (event: KeyboardEvent, value: number): void => {
      if (event.key === 'ArrowLeft') this.keyboardSteer = -value;
      if (event.key === 'ArrowRight') this.keyboardSteer = value;
    };
    window.addEventListener('keydown', (event) => set(event, 1));
    window.addEventListener('keyup', (event) => set(event, 0));
  }

  private showView(viewId: ViewId): void {
    for (const id of ALL_VIEWS) {
      const element = document.getElementById(id);
      if (element) element.hidden = id !== viewId;
    }
    // The game canvas is fixed and full-bleed; the lobby chrome around it would
    // otherwise still be scrollable underneath.
    const chrome = document.querySelector<HTMLElement>('.container');
    if (chrome) chrome.hidden = viewId === 'gameView';
    if (viewId === 'gameView') this.resizeCanvas();
  }

  private showMessage(message: string | null): void {
    const element = document.getElementById('message');
    if (!element) return;
    element.textContent = message || '';
    element.hidden = !message;
  }
}

export function startPong(): void {
  const manager = new PongManager();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.initialize());
  } else {
    manager.initialize();
  }
}
