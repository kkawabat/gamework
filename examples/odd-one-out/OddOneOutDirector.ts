/**
 * Odd One Out — N-player mesh, with genuine hidden information.
 *
 * Every device is a player. The host also brings an `admin` that starts rounds
 * and deals secrets; that is the same split poker uses for its dealer, and it
 * is why the host's own player entity never reads anyone else's word.
 *
 *  - Per-entity private channels. Every player reads `secret:{self}` and
 *    nothing else private, so the odd one out's ignorance is a routing fact
 *    rather than something the UI declines to draw.
 *  - `mesh` + `authoritative`. Everyone holds a channel to everyone else, and
 *    only the admin reduces — no phone is ever told the word or who the odd
 *    one out is, including the host's own seat.
 *
 * The director is deliberately free of the DOM so the whole flow can be driven
 * across several real Sessions in tests.
 */

import { EntityHandle, Role, Session } from '../../src';

export const PLAYER_ROLE: Role = {
  name: 'player',
  reads: ['public', 'secret:{self}'],
  writes: ['vote:{self}']
};

export const ADMIN_ROLE: Role = {
  name: 'admin',
  reads: ['public', 'vote:*'],
  writes: ['public', 'secret:*']
};

export const ODD_ONE_OUT_ROLES = [PLAYER_ROLE, ADMIN_ROLE];

export const MIN_PLAYERS = 3;

export const WORDS = [
  'Beach', 'Hospital', 'Airport', 'Casino', 'Submarine',
  'Space Station', 'Bank Vault', 'Theatre', 'Vineyard', 'Ski Lodge'
];

export type Phase = 'lobby' | 'voting' | 'reveal';

/** What every screen may see. Never contains the word during `voting`. */
export interface PublicView {
  phase: Phase;
  players: Array<{ entityId: string; voted: boolean }>;
  votes: Record<string, string>;
  /** Only ever populated at `reveal`. */
  word?: string;
  oddOneOut?: string;
}

/** What one player may see. The odd one out gets no word — that is the game. */
export interface SecretView {
  word: string | null;
  oddOneOut: boolean;
}

export interface Vote {
  target: string;
}

interface DirectorOptions {
  /** Injectable so tests get a deterministic round. */
  random?: () => number;
  words?: string[];
}

export class OddOneOutDirector {
  private readonly session: Session;
  private readonly random: () => number;
  private readonly words: string[];

  private admin: EntityHandle | null = null;
  private player: EntityHandle | null = null;

  private votes = new Map<string, string>();
  private word: string | null = null;
  private oddOneOut: string | null = null;

  private publicHandlers = new Set<(view: PublicView) => void>();
  private secretHandlers = new Set<(view: SecretView) => void>();

  publicView: PublicView = { phase: 'lobby', players: [], votes: {} };
  secret: SecretView | null = null;

  constructor(session: Session, options: DirectorOptions = {}) {
    this.session = session;
    this.random = options.random ?? Math.random;
    this.words = options.words ?? WORDS;
  }

  /**
   * Bind to whichever entities this device turned out to hold. Call once the
   * registry has landed — a joiner does not know its own entity id before then.
   */
  attach(): void {
    const adminEntity = this.session.localEntityOfRole('admin');
    const playerEntity = this.session.localEntityOfRole('player');
    this.admin = adminEntity ? this.session.actAs(adminEntity.entityId) : null;
    this.player = playerEntity ? this.session.actAs(playerEntity.entityId) : null;

    const viewer = this.player ?? (this.admin && this.admin.canRead('public') ? this.admin : null);

    viewer?.on('public', (payload) => {
      this.publicView = payload as PublicView;
      this.publicHandlers.forEach((handler) => handler(this.publicView));
    });

    this.player?.on('secret:{self}', (payload) => {
      this.secret = payload as SecretView;
      this.secretHandlers.forEach((handler) => handler(this.secret!));
    });

    // Only the admin is permitted to read votes at all, so this subscription is
    // inert on every other device rather than conditional on a flag.
    this.admin?.on('vote:*', (payload, meta) => {
      if (this.publicView.phase !== 'voting') return;
      this.votes.set(meta.author, (payload as Vote).target);
      this.publish(this.votes.size >= this.playerIds().length ? 'reveal' : 'voting');
    });
  }

  onPublic(handler: (view: PublicView) => void): () => void {
    this.publicHandlers.add(handler);
    return () => this.publicHandlers.delete(handler);
  }

  onSecret(handler: (view: SecretView) => void): () => void {
    this.secretHandlers.add(handler);
    return () => this.secretHandlers.delete(handler);
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

  /** Admin only. Deals a private word to everyone but the odd one out. */
  startRound(): void {
    if (!this.admin) throw new Error('Only the admin may start a round');
    const players = this.playerIds();
    if (players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players`);

    this.word = this.words[Math.floor(this.random() * this.words.length)];
    this.oddOneOut = players[Math.floor(this.random() * players.length)];
    this.votes.clear();
    this.secret = null;

    for (const entityId of players) {
      const isOdd = entityId === this.oddOneOut;
      this.admin.write(`secret:${entityId}`, { word: isOdd ? null : this.word, oddOneOut: isOdd });
    }
    this.publish('voting');
  }

  /** Player only. Accuses another player. */
  vote(target: string): void {
    if (!this.player) throw new Error('Only a player may vote');
    if (this.publicView.phase !== 'voting') return;
    this.player.write('vote:{self}', { target });
  }

  private publish(phase: Phase): void {
    if (!this.admin) return;
    const view: PublicView = {
      phase,
      players: this.playerIds().map((entityId) => ({ entityId, voted: this.votes.has(entityId) })),
      votes: Object.fromEntries(this.votes),
      // The word and the culprit exist on the authority throughout the round,
      // but only ever reach the public channel once the round is over.
      ...(phase === 'reveal' ? { word: this.word ?? undefined, oddOneOut: this.oddOneOut ?? undefined } : {})
    };
    this.admin.write('public', view);
  }
}
