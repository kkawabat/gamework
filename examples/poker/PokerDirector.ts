/**
 * Poker — hub-and-spoke, with genuinely private hole cards.
 *
 * The host holds `dealer` (the hub and the only reducer) plus a `player` seat.
 * Joiners hold a `player` and dial only the host. Hole cards travel on
 * `hand:{self}`: a spoke is never sent anyone else's cards, and the public
 * view does not contain them until showdown.
 *
 * The director is free of the DOM so tests can drive several real Sessions
 * and assert routing rather than what a UI chose to draw.
 */

import { EntityHandle, Role, Session } from '../../src';
import {
  PokerAction,
  PokerActionType,
  PokerEngine,
  PokerState
} from './PokerEngine';

export const PLAYER_ROLE: Role = {
  name: 'player',
  reads: ['public', 'hand:{self}'],
  writes: ['intent:{self}', 'request']
};

export const DEALER_ROLE: Role = {
  name: 'dealer',
  reads: ['intent:*', 'request'],
  writes: ['public', 'hand:*']
};

export const POKER_ROLES = [PLAYER_ROLE, DEALER_ROLE];

export interface PokerPublicView {
  numPlayers: number;
  stage: PokerState['stage'];
  community: number[];
  stacks: number[];
  roundBet: number[];
  committed: number[];
  folded: boolean[];
  inHand: boolean[];
  needAct: boolean[];
  pot: number;
  button: number;
  toAct: number;
  lastRaiseSize: number;
  handNumber: number;
  handOver: boolean;
  matchOver: boolean;
  matchWinner: number | null;
  result: PokerState['result'];
  message: string;
  /**
   * Hole cards visible to everyone. Empty during play; filled for revealed
   * seats at showdown (and never for a fold-win, where nothing is shown).
   */
  shownHole: number[][];
}

export interface PokerSecretView {
  hole: number[];
}

export interface PokerIntent {
  type: Extract<PokerActionType, 'FOLD' | 'CHECK' | 'CALL' | 'RAISE'>;
  amount?: number;
}

export interface PokerRequest {
  type: 'REQUEST_DEAL' | 'REQUEST_NEW_MATCH';
}

const emptyView = (): PokerPublicView => ({
  numPlayers: 0,
  stage: 'idle',
  community: [],
  stacks: [],
  roundBet: [],
  committed: [],
  folded: [],
  inHand: [],
  needAct: [],
  pot: 0,
  button: 0,
  toAct: -1,
  lastRaiseSize: 0,
  handNumber: 0,
  handOver: false,
  matchOver: false,
  matchWinner: null,
  result: null,
  message: 'Waiting to start…',
  shownHole: []
});

interface DirectorOptions {
  /** Injectable so tests get a deterministic deck. */
  nextSeed?: () => number;
}

export class PokerDirector {
  private readonly session: Session;
  private readonly engine = new PokerEngine();
  private nextSeed: () => number;

  private dealer: EntityHandle | null = null;
  private player: EntityHandle | null = null;

  private state: PokerState;
  private seedCounter = 0;

  private publicHandlers = new Set<(view: PokerPublicView) => void>();
  private secretHandlers = new Set<(view: PokerSecretView) => void>();

  publicView: PokerPublicView = emptyView();
  secret: PokerSecretView | null = null;

  constructor(session: Session, options: DirectorOptions = {}) {
    this.session = session;
    this.state = this.engine.getInitialState();
    this.nextSeed = options.nextSeed ?? (() => this.defaultSeed());
  }

  attach(): void {
    const playerEntity = this.session.localEntityOfRole('player');
    const dealerEntity = this.session.localEntityOfRole('dealer');
    this.player = playerEntity ? this.session.actAs(playerEntity.entityId) : null;
    this.dealer = dealerEntity ? this.session.actAs(dealerEntity.entityId) : null;

    this.player?.on('public', (payload) => {
      this.publicView = payload as PokerPublicView;
      this.publicHandlers.forEach((handler) => handler(this.publicView));
    });

    this.player?.on('hand:{self}', (payload) => {
      this.secret = payload as PokerSecretView;
      this.secretHandlers.forEach((handler) => handler(this.secret!));
    });

    this.dealer?.on('intent:*', (payload, meta) => {
      const intent = payload as PokerIntent;
      const seat = this.seatOf(meta.author);
      if (seat < 0) return;
      this.reduce({
        type: intent.type,
        playerId: meta.author,
        timestamp: Date.now(),
        payload: { seat, ...(intent.amount !== undefined ? { amount: intent.amount } : {}) }
      });
    });

    this.dealer?.on('request', (payload) => {
      const request = payload as PokerRequest;
      this.deal(request.type === 'REQUEST_NEW_MATCH');
    });
  }

  onPublic(handler: (view: PokerPublicView) => void): () => void {
    this.publicHandlers.add(handler);
    return () => this.publicHandlers.delete(handler);
  }

  onSecret(handler: (view: PokerSecretView) => void): () => void {
    this.secretHandlers.add(handler);
    return () => this.secretHandlers.delete(handler);
  }

  get isDealer(): boolean {
    return this.dealer !== null;
  }

  get playerId(): string | null {
    return this.player?.id ?? null;
  }

  playerIds(): string[] {
    return this.session.entitiesOfRole('player').map((entity) => entity.entityId);
  }

  get localSeat(): number {
    const id = this.playerId;
    return id ? this.playerIds().indexOf(id) : -1;
  }

  /** Dealer only. Seats the table and deals the first hand. */
  startMatch(): void {
    if (!this.dealer) throw new Error('Only the dealer may start a match');
    const players = this.playerIds();
    if (players.length < 2) throw new Error('Need at least 2 players');
    this.reduce({
      type: 'NEW_MATCH',
      playerId: this.dealer.id,
      timestamp: Date.now(),
      payload: { seed: this.nextSeed(), numPlayers: players.length }
    });
  }

  act(type: PokerIntent['type'], amount?: number): void {
    if (!this.player) throw new Error('Only a player may act');
    if (this.publicView.toAct !== this.localSeat || this.publicView.handOver) return;
    this.player.write('intent:{self}', { type, ...(amount !== undefined ? { amount } : {}) } as PokerIntent);
  }

  requestDeal(newMatch: boolean): void {
    this.player?.write('request', {
      type: newMatch ? 'REQUEST_NEW_MATCH' : 'REQUEST_DEAL'
    } as PokerRequest);
  }

  private deal(newMatch: boolean): void {
    if (!this.dealer) return;
    this.reduce({
      type: newMatch ? 'NEW_MATCH' : 'DEAL',
      playerId: this.dealer.id,
      timestamp: Date.now(),
      payload: {
        seed: this.nextSeed(),
        ...(newMatch ? { numPlayers: this.playerIds().length } : {})
      }
    });
  }

  private reduce(action: PokerAction): void {
    if (!this.dealer) return;
    this.state = this.engine.processAction(this.state, action);
    this.publish();
  }

  private publish(): void {
    if (!this.dealer) return;
    const players = this.playerIds();
    const shownHole = this.state.hole.map((cards, seat) =>
      this.state.result?.revealed[seat] ? cards : []
    );
    const view: PokerPublicView = {
      numPlayers: this.state.numPlayers,
      stage: this.state.stage,
      community: this.state.community,
      stacks: this.state.stacks,
      roundBet: this.state.roundBet,
      committed: this.state.committed,
      folded: this.state.folded,
      inHand: this.state.inHand,
      needAct: this.state.needAct,
      pot: this.state.pot,
      button: this.state.button,
      toAct: this.state.toAct,
      lastRaiseSize: this.state.lastRaiseSize,
      handNumber: this.state.handNumber,
      handOver: this.state.handOver,
      matchOver: this.state.matchOver,
      matchWinner: this.state.matchWinner,
      result: this.state.result,
      message: this.state.message,
      shownHole
    };
    this.dealer.write('public', view);
    for (let seat = 0; seat < players.length; seat += 1) {
      this.dealer.write(`hand:${players[seat]}`, { hole: this.state.hole[seat] ?? [] });
    }
  }

  private seatOf(entityId: string): number {
    return this.playerIds().indexOf(entityId);
  }

  private defaultSeed(): number {
    this.seedCounter += 1;
    return (Math.floor(Math.random() * 0x7fffffff) ^ (this.seedCounter * 2654435761)) >>> 0;
  }
}
