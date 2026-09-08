/**
 * Set — N-player star, with a public board and a race to claim.
 *
 * There is nothing hidden: every phone sees the same twelve (or more) cards.
 * The hub exists to serialize claims, not to withhold anything. Two phones
 * tapping overlapping sets in the same breath would otherwise both believe
 * they had them. Claims travel as the three card ids, not board indices, so a
 * claim that is still in flight is not invalidated by the board shifting
 * under a claim that arrived a moment earlier.
 *
 * The host holds `admin` (the reducer) plus a `player` (its own seat).
 * Joiners hold a `player` and dial only the host.
 *
 * Solo never constructs a Session — it drives SetTable directly. This file
 * is the multiplayer wiring, driven across real Sessions in tests.
 */

import { EntityHandle, Role, Session } from '../../src';
import { PublicView, SetTable, TableOptions } from './SetEngine';

export const PLAYER_ROLE: Role = {
  name: 'player',
  reads: ['public'],
  writes: ['claim:{self}']
};

export const ADMIN_ROLE: Role = {
  name: 'admin',
  reads: ['public', 'claim:*'],
  writes: ['public']
};

export const SET_ROLES = [PLAYER_ROLE, ADMIN_ROLE];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export type Claim = { cards: number[] };

export class SetDirector {
  private readonly session: Session;
  private readonly table: SetTable;

  private admin: EntityHandle | null = null;
  private player: EntityHandle | null = null;

  private publicHandlers = new Set<(view: PublicView) => void>();

  publicView: PublicView = {
    phase: 'idle',
    board: [],
    deckRemaining: 0,
    scores: [],
    lastClaim: null
  };

  constructor(session: Session, options: TableOptions = {}) {
    this.session = session;
    this.table = new SetTable(options);
  }

  attach(): void {
    const adminEntity = this.session.localEntityOfRole('admin');
    const playerEntity = this.session.localEntityOfRole('player');
    this.admin = adminEntity ? this.session.actAs(adminEntity.entityId) : null;
    this.player = playerEntity ? this.session.actAs(playerEntity.entityId) : null;

    this.player?.on('public', (payload) => {
      this.publicView = payload as PublicView;
      this.publicHandlers.forEach((handler) => handler(this.publicView));
    });

    this.admin?.on('claim:*', (payload, meta) => {
      if (this.table.claim(meta.author, (payload as Claim).cards)) this.publish();
    });
  }

  onPublic(handler: (view: PublicView) => void): () => void {
    this.publicHandlers.add(handler);
    return () => this.publicHandlers.delete(handler);
  }

  get isAdmin(): boolean {
    return this.admin !== null;
  }

  get playerId(): string | null {
    return this.player?.id ?? null;
  }

  playerIds(): string[] {
    return this.session.entitiesOfRole('player').map((entity) => entity.entityId);
  }

  /** Admin only. Deals the board and opens claiming. */
  startGame(): void {
    if (!this.admin) throw new Error('Only the admin may start a game');
    const players = this.playerIds();
    if (players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players`);
    this.table.start(players);
    this.publish();
  }

  /** Player only. The three cards, not their positions on the board. */
  claim(cards: number[]): void {
    if (!this.player) throw new Error('Only a player may claim');
    if (this.publicView.phase !== 'playing') return;
    this.player.write('claim:{self}', { cards } satisfies Claim);
  }

  private publish(): void {
    if (!this.admin) return;
    this.admin.write('public', this.table.view());
  }
}

export type { PublicView } from './SetEngine';
