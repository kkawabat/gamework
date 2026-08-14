/**
 * Two-phone tilt Pong. The first real-time game on the session layer, and the
 * first that is `authoritative` for a reason other than secrecy: one device has
 * to own the ball, because two simulations of a bouncing ball diverge within
 * seconds no matter how carefully they start.
 *
 * Wiring: `mesh` + `authoritative`. With two players mesh and star describe the
 * same single connection; mesh is the honest label.
 *
 *   referee   reads paddle:* and ready:*, writes state.  One entity, on the host.
 *   player    reads state, writes paddle:{self} and ready:{self}.
 *
 * The host device holds both — the same split poker uses for its dealer, and
 * the reason the referee cannot be steered by the player sharing its tab.
 *
 * Latency: each phone renders *its own* paddle straight from local tilt and
 * never waits for the referee to confirm it. The referee owns the ball, the
 * score, and the other player's paddle. That is the standard casual-pong trade:
 * your own paddle feels instant, and the referee's view of it lags by half a
 * round trip, which shows up only as slightly generous collisions.
 *
 * Transport: `state` and `paddle:*` are declared unreliable in the session
 * options, so they take the unordered, never-retransmitted channel. Both carry
 * absolute values, so a lost write is superseded by the next one 33ms later —
 * whereas a retransmit would hold the fresher value behind the stale one.
 * Unordered also means a late packet can arrive after a newer one: each stream
 * carries a seq, and a snapshot older than one already applied is ignored.
 * Everything else — the registry, and `ready`, which is written once and never
 * repeated — stays on the reliable channel, because losing any of those hangs
 * the lobby with no retry anywhere.
 */

import { EntityHandle, Role, Session } from '../../src';

export const REFEREE_ROLE: Role = {
  name: 'referee',
  reads: ['paddle:*', 'ready:*'],
  writes: ['state']
};

export const PLAYER_ROLE: Role = {
  name: 'player',
  reads: ['state'],
  writes: ['paddle:{self}', 'ready:{self}']
};

export const PONG_ROLES = [REFEREE_ROLE, PLAYER_ROLE];

/**
 * Simulation units. A fixed 1×1.6 field rather than the canvas size, so both
 * phones agree on the shape of the world regardless of their screens; the
 * renderer letterboxes it.
 */
export const FIELD = { width: 1, height: 1.6 };
export const PADDLE = { width: 0.26, thickness: 0.022, inset: 0.07 };
export const BALL = { radius: 0.018, baseSpeed: 0.85, speedGain: 1.05, maxSpeed: 2.4 };
export const WIN_SCORE = 7;
export const COUNTDOWN_SECONDS = 3;

/** Steepest bounce off a paddle edge. Keeps rallies from degenerating to vertical. */
const MAX_BOUNCE = 62 * (Math.PI / 180);
/** Physics substep. Small enough that the fastest ball cannot tunnel a paddle. */
const SUBSTEP = 1 / 240;
/** The referee publishes at this rate; the ball is simulated far more finely. */
const STATE_INTERVAL = 1 / 30;
/** Paddle writes are throttled to this, and skipped entirely when nothing moved. */
const PADDLE_INTERVAL = 1 / 30;
const PADDLE_EPSILON = 0.002;
/**
 * Resend a stationary paddle this often anyway. The paddle stream is
 * unreliable, so the last write before a player stopped moving may simply never
 * have arrived — and without a repeat the referee would defend the wrong spot
 * until they moved again.
 */
const PADDLE_KEEPALIVE = 0.5;

export type Phase = 'lobby' | 'countdown' | 'playing' | 'over';

export interface PongState {
  phase: Phase;
  /** Canonical order: index 0 defends the bottom edge, index 1 the top. */
  players: string[];
  ball: { x: number; y: number };
  paddles: Record<string, number>;
  scores: Record<string, number>;
  ready: Record<string, boolean>;
  countdown: number;
  /** Referee publish counter. Joiners ignore a snapshot older than one they have. */
  seq: number;
  winner?: string;
}

const emptyState = (): PongState => ({
  phase: 'lobby', players: [], ball: { x: FIELD.width / 2, y: FIELD.height / 2 },
  paddles: {}, scores: {}, ready: {}, countdown: 0, seq: 0
});

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface DirectorOptions {
  random?: () => number;
}

export class PongDirector {
  private readonly session: Session;
  private readonly random: () => number;

  private referee: EntityHandle | null = null;
  private player: EntityHandle | null = null;

  private velocity = { x: 0, y: 0 };
  private speed = BALL.baseSpeed;
  private publishTimer = 0;
  private paddleTimer = 0;
  private sincePaddleSent = 0;
  private lastSentPaddle = -1;
  private localPaddle = FIELD.width / 2;
  private paddleSeq = 0;
  private appliedPaddleSeq: Record<string, number> = {};

  private stateHandlers = new Set<(state: PongState) => void>();

  state: PongState = emptyState();

  constructor(session: Session, options: DirectorOptions = {}) {
    this.session = session;
    this.random = options.random ?? Math.random;
  }

  /** Bind once the registry lands; a joiner has no entity id before then. */
  attach(): void {
    const playerEntity = this.session.localEntityOfRole('player');
    const refereeEntity = this.session.localEntityOfRole('referee');
    if (playerEntity && !this.player) {
      this.player = this.session.actAs(playerEntity.entityId);
      this.player.on('state', (payload) => {
        // The referee already owns this object — adopting the copy of it that
        // loops back through its own player entity would be harmless but
        // confusing, and would quietly discard anything written since.
        if (!this.referee) this.adoptState(payload as PongState);
        this.stateHandlers.forEach((handler) => handler(this.state));
      });
    }
    if (refereeEntity && !this.referee) {
      this.referee = this.session.actAs(refereeEntity.entityId);
      this.referee.on('paddle:*', (payload, meta) => {
        const { x, seq } = payload as { x: number; seq?: number };
        if (seq !== undefined && seq <= (this.appliedPaddleSeq[meta.author] ?? 0)) return;
        if (seq !== undefined) this.appliedPaddleSeq[meta.author] = seq;
        this.state.paddles[meta.author] = x;
      });
      this.referee.on('ready:*', (payload, meta) => {
        this.state.ready[meta.author] = (payload as { ready: boolean }).ready;
        this.startIfReady();
      });
    }
  }

  onState(handler: (state: PongState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  get isReferee(): boolean {
    return this.referee !== null;
  }

  get myId(): string | null {
    return this.player?.id ?? null;
  }

  /** 0 when this device defends the bottom edge, 1 the top. -1 before seating. */
  get myIndex(): number {
    return this.myId ? this.state.players.indexOf(this.myId) : -1;
  }

  /** The paddle this device is steering, which never waits on the referee. */
  get myPaddle(): number {
    return this.localPaddle;
  }

  setReady(): void {
    this.player?.write('ready:{self}', { ready: true });
  }

  /** Steering in -1..1 from the tilt module, integrated into a field position. */
  steer(steering: number, dt: number): void {
    const speed = 1.9; // field widths per second at full deflection
    this.localPaddle = clamp(
      this.localPaddle + steering * speed * dt,
      PADDLE.width / 2,
      FIELD.width - PADDLE.width / 2
    );
    this.paddleTimer += dt;
    this.sincePaddleSent += dt;
    if (this.paddleTimer < PADDLE_INTERVAL) return;

    const moved = Math.abs(this.localPaddle - this.lastSentPaddle) >= PADDLE_EPSILON;
    if (!moved && this.sincePaddleSent < PADDLE_KEEPALIVE) return;

    this.paddleTimer = 0;
    this.sincePaddleSent = 0;
    this.lastSentPaddle = this.localPaddle;
    this.player?.write('paddle:{self}', { x: this.localPaddle, seq: ++this.paddleSeq });
  }

  /**
   * Referee only. Everyone else's clock does nothing: the ball exists on one
   * device, and the others are told where it went.
   */
  step(dt: number): void {
    if (!this.referee) return;

    if (this.state.phase === 'countdown') {
      this.state.countdown = Math.max(0, this.state.countdown - dt);
      if (this.state.countdown === 0) this.state.phase = 'playing';
    } else if (this.state.phase === 'playing') {
      let remaining = Math.min(dt, 0.1); // a backgrounded tab must not teleport the ball
      // Re-check the phase every substep. A point scored part-way through a
      // frame ends play immediately, and the ball is still sitting past the
      // paddle plane — carrying on would score it again on the very next
      // substep, which is how a match-winning rally once ended 9-0 instead of 7-0.
      while (remaining > 0 && this.state.phase === 'playing') {
        const step = Math.min(SUBSTEP, remaining);
        this.advance(step);
        remaining -= step;
      }
    }

    this.publishTimer += dt;
    if (this.publishTimer >= STATE_INTERVAL) {
      this.publishTimer = 0;
      this.publish();
    }
  }

  // --- referee internals ----------------------------------------------------

  private startIfReady(): void {
    if (!this.referee || this.state.phase !== 'lobby') return;
    const players = this.session.entitiesOfRole('player').map((entity) => entity.entityId);
    if (players.length < 2 || !players.every((id) => this.state.ready[id])) return;

    this.state.players = players;
    this.state.scores = Object.fromEntries(players.map((id) => [id, 0]));
    for (const id of players) {
      if (this.state.paddles[id] === undefined) this.state.paddles[id] = FIELD.width / 2;
    }
    this.serve(players[Math.floor(this.random() * players.length)]);
  }

  /** Put the ball back in play, heading towards `towards`. */
  private serve(towards: string): void {
    const index = this.state.players.indexOf(towards);
    const direction = index === 0 ? 1 : -1; // +y is towards the bottom defender
    const spread = (this.random() - 0.5) * 0.6;
    this.speed = BALL.baseSpeed;
    this.state.ball = { x: FIELD.width / 2, y: FIELD.height / 2 };
    this.velocity = {
      x: this.speed * Math.sin(spread),
      y: this.speed * Math.cos(spread) * direction
    };
    this.state.phase = 'countdown';
    this.state.countdown = COUNTDOWN_SECONDS;
    this.publish();
  }

  private advance(dt: number): void {
    const ball = this.state.ball;
    ball.x += this.velocity.x * dt;
    ball.y += this.velocity.y * dt;

    if (ball.x < BALL.radius) {
      ball.x = BALL.radius;
      this.velocity.x = Math.abs(this.velocity.x);
    } else if (ball.x > FIELD.width - BALL.radius) {
      ball.x = FIELD.width - BALL.radius;
      this.velocity.x = -Math.abs(this.velocity.x);
    }

    const [bottom, top] = this.state.players;
    if (this.velocity.y > 0) this.checkPaddle(bottom, FIELD.height - PADDLE.inset, 1);
    else this.checkPaddle(top, PADDLE.inset, -1);
  }

  /**
   * `direction` is +1 for the defender at the bottom. A miss is only a point
   * once the ball is past the paddle plane by its own diameter, so a fast ball
   * that clips the very edge is still a save.
   */
  private checkPaddle(defender: string, planeY: number, direction: number): void {
    const ball = this.state.ball;
    const reached = direction > 0
      ? ball.y + BALL.radius >= planeY
      : ball.y - BALL.radius <= planeY;
    if (!reached) return;

    const paddleX = this.state.paddles[defender] ?? FIELD.width / 2;
    const offset = (ball.x - paddleX) / (PADDLE.width / 2);

    if (Math.abs(offset) <= 1) {
      const angle = clamp(offset, -1, 1) * MAX_BOUNCE;
      this.speed = Math.min(this.speed * BALL.speedGain, BALL.maxSpeed);
      this.velocity = {
        x: this.speed * Math.sin(angle),
        y: -this.speed * Math.cos(angle) * direction
      };
      ball.y = planeY - direction * (BALL.radius + PADDLE.thickness);
      return;
    }

    const beyond = direction > 0 ? ball.y > planeY + BALL.radius * 2 : ball.y < planeY - BALL.radius * 2;
    if (beyond) this.concede(defender);
  }

  private concede(defender: string): void {
    const scorer = this.state.players.find((id) => id !== defender)!;
    this.state.scores[scorer] = (this.state.scores[scorer] ?? 0) + 1;

    if (this.state.scores[scorer] >= WIN_SCORE) {
      this.state.phase = 'over';
      this.state.winner = scorer;
      this.publish();
      return;
    }
    this.serve(defender); // the player who conceded receives
  }

  /** Drop a reordered unreliable snapshot rather than rewind the scoreboard. */
  private adoptState(payload: PongState): void {
    if ((payload.seq ?? 0) < this.state.seq) return;
    this.state = payload;
  }

  private publish(): void {
    this.state.seq += 1;
    this.referee?.write('state', JSON.parse(JSON.stringify(this.state)) as PongState);
  }
}
