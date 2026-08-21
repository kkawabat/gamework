/**
 * Would You Rather — an in-person icebreaker. The question is asked out loud;
 * only the answers are ever on the wire.
 *
 * Two things get called "host" in this game, and keeping them apart is most of
 * the design:
 *
 *  - The **hub** is the device that created the room. Under star it is the only
 *    node everyone is connected to, and it runs the reducer. It cannot move —
 *    host migration is not implemented (docs/TODO.md) — so its tab stays open
 *    for the evening.
 *  - The **asker** is the seat that asks the question and reads the tally. It
 *    is one field of the published state, so handing it over is a write, not a
 *    reconnection. The hub keeps routing after it gives the asking seat away,
 *    and the new asker's phone is not carrying anyone else's traffic.
 *
 * The tally is the only thing withheld in this game, and it is withheld by
 * routing rather than by the UI declining to draw it: the admin writes it to
 * `tally:{askerId}`, and the guest role reads `tally:{self}` and nothing else
 * private. A guest is therefore never sent the running split, and cannot
 * bandwagon onto the side that is winning.
 *
 * The session is never locked, which is what lets someone who wanders in at
 * round nine scan the QR and play. This is not the late join in docs/TODO.md —
 * nothing rejoins after a lock — it is a session that never closes admission.
 * The part that would otherwise be missing is state resync, and under
 * `authoritative` it is one line: the admin republishes on every registry
 * change, so a device that has just been admitted is immediately caught up.
 */

import { EntityHandle, EntityId, Role, Session } from '../../src';

export const GUEST_ROLE: Role = {
  name: 'guest',
  // `tally:{self}` — not `tally:*`, which would hand every guest the split.
  reads: ['public', 'tally:{self}'],
  writes: ['intent:{self}']
};

export const ADMIN_ROLE: Role = {
  name: 'admin',
  reads: ['public', 'intent:*'],
  writes: ['public', 'tally:*']
};

export const WOULD_YOU_RATHER_ROLES = [GUEST_ROLE, ADMIN_ROLE];

export const MAX_NAME_LENGTH = 20;

export type Choice = 'first' | 'second';

export interface PublicGuest {
  entityId: EntityId;
  name: string;
  answered: boolean;
}

/**
 * What every phone in the room may see. Deliberately not the counts: `answered`
 * is enough to show the room filling up without revealing which way it is
 * leaning.
 */
export interface PublicView {
  round: number;
  asker: EntityId | null;
  guests: PublicGuest[];
}

/** What the asker alone may see. */
export interface TallyView {
  round: number;
  first: number;
  second: number;
  answered: number;
  /** Everyone who could answer — the asker is talking, not voting. */
  eligible: number;
  /** 100 is a perfect 50/50. The whole point of the game. */
  split: number;
  /** The best split this asker has managed since they took the seat. */
  best: number;
}

export type Intent =
  | { kind: 'rename'; name: string }
  | { kind: 'answer'; round: number; choice: Choice }
  | { kind: 'next' }
  | { kind: 'pass'; to: EntityId };

/** `guest-2` → `Guest 3`, for anyone who did not type a name. */
export function defaultName(entityId: EntityId): string {
  const index = Number(entityId.split('-').pop());
  return Number.isInteger(index) ? `Guest ${index + 1}` : entityId;
}

/** How evenly a question divided the room: 100 for a dead split, 0 for consensus. */
export function splitScore(first: number, second: number): number {
  const total = first + second;
  if (total === 0) return 0;
  return Math.round(100 * (1 - Math.abs(first - second) / total));
}

export class WouldYouRatherDirector {
  private readonly session: Session;

  private admin: EntityHandle | null = null;
  private guest: EntityHandle | null = null;

  // Authority state. Only ever populated on the hub; every other device learns
  // what it is allowed to know from `public` and `tally:{self}`.
  private names = new Map<EntityId, string>();
  private answers = new Map<EntityId, Choice>();
  private bests = new Map<EntityId, number>();
  private round = 1;
  private asker: EntityId | null = null;

  /** This device's own answer to the current question. Local: nothing echoes it back. */
  private myAnswer: Choice | null = null;

  private publicHandlers = new Set<(view: PublicView) => void>();
  private tallyHandlers = new Set<(view: TallyView | null) => void>();

  publicView: PublicView = { round: 1, asker: null, guests: [] };
  tally: TallyView | null = null;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Bind to whichever entities this device turned out to hold. Call once the
   * registry has landed — a joiner does not know its own entity id before then.
   */
  attach(): void {
    const adminEntity = this.session.localEntityOfRole('admin');
    const guestEntity = this.session.localEntityOfRole('guest');
    this.admin = adminEntity ? this.session.actAs(adminEntity.entityId) : null;
    this.guest = guestEntity ? this.session.actAs(guestEntity.entityId) : null;

    const viewer = this.guest ?? this.admin;

    viewer?.on('public', (payload) => {
      const previous = this.publicView;
      this.publicView = payload as PublicView;
      if (this.publicView.round !== previous.round) this.myAnswer = null;
      // A tally is only ever valid for the seat that is currently asking, and
      // the device that just handed the seat over is still holding the last one.
      if (this.tally && this.publicView.asker !== this.guest?.id) this.setTally(null);
      this.publicHandlers.forEach((handler) => handler(this.publicView));
    });

    this.guest?.on('tally:{self}', (payload) => this.setTally(payload as TallyView));

    // Inert on every device but the hub: no other role may read intents at all.
    this.admin?.on('intent:*', (payload, meta) => this.reduce(payload as Intent, meta.author));

    // Admission never closes, so the registry keeps growing all evening. Under
    // `authoritative` catching a new arrival up is exactly this: republish.
    // The first publish is explicit rather than left to the registry event that
    // is already in flight when a hub attaches — nothing should hinge on
    // whether a handler added mid-notification gets called.
    if (this.admin) {
      this.session.onRegistry(() => this.publish());
      this.publish();
    }
  }

  onPublic(handler: (view: PublicView) => void): () => void {
    this.publicHandlers.add(handler);
    return () => this.publicHandlers.delete(handler);
  }

  onTally(handler: (view: TallyView | null) => void): () => void {
    this.tallyHandlers.add(handler);
    return () => this.tallyHandlers.delete(handler);
  }

  get isHub(): boolean {
    return this.admin !== null;
  }

  get guestId(): EntityId | null {
    return this.guest?.id ?? null;
  }

  get isAsker(): boolean {
    return this.guest !== null && this.publicView.asker === this.guest.id;
  }

  /** What this device answered, or null before it has answered this question. */
  get myChoice(): Choice | null {
    return this.myAnswer;
  }

  guests(): PublicGuest[] {
    return this.publicView.guests;
  }

  // --- What a guest can do -------------------------------------------------

  /** An empty name puts the guest back to `Guest 3`. */
  setName(name: string): void {
    this.guest?.write('intent:{self}', { kind: 'rename', name } satisfies Intent);
  }

  answer(choice: Choice): void {
    if (!this.guest || this.isAsker) return;
    this.myAnswer = choice;
    // The round travels with the answer: a tap that was already in flight when
    // the asker moved on belongs to the question it was aimed at, not this one.
    this.guest.write('intent:{self}', { kind: 'answer', round: this.publicView.round, choice } satisfies Intent);
  }

  // --- What the asker can do -----------------------------------------------

  askNewQuestion(): void {
    if (!this.isAsker) return;
    this.guest!.write('intent:{self}', { kind: 'next' } satisfies Intent);
  }

  passSeat(to: EntityId): void {
    if (!this.isAsker) return;
    this.guest!.write('intent:{self}', { kind: 'pass', to } satisfies Intent);
  }

  /**
   * Hub only, and the one action that is not an intent — the hub reduces, so it
   * needs nobody's permission. That is the point: it is what recovers a game
   * whose asker has pocketed their phone, and nothing else can, because only
   * the asker may pass the seat and a dropped device is gone for the session.
   */
  takeSeat(): void {
    const seat = this.session.localEntityOfRole('guest');
    if (!this.admin || !seat || this.asker === seat.entityId) return;
    this.closeRound();
    this.asker = seat.entityId;
    this.publish();
  }

  // --- Authority -----------------------------------------------------------

  private reduce(intent: Intent, author: EntityId): void {
    switch (intent.kind) {
      case 'rename': {
        const name = intent.name.trim().slice(0, MAX_NAME_LENGTH);
        if (name) this.names.set(author, name);
        else this.names.delete(author);
        break;
      }
      case 'answer':
        // The asker is asking, not answering, and a stale round is a tap that
        // missed its question.
        if (author === this.asker || intent.round !== this.round) return;
        this.answers.set(author, intent.choice);
        break;
      case 'next':
        if (author !== this.asker) return;
        this.closeRound();
        break;
      case 'pass':
        if (author !== this.asker) return;
        if (intent.to === this.asker || !this.guestIds().includes(intent.to)) return;
        this.closeRound();
        this.asker = intent.to;
        break;
    }
    this.publish();
  }

  /** Score what the room just did, credit it to whoever asked, and move on. */
  private closeRound(): void {
    const { first, second } = this.counts();
    if (this.asker && first + second > 0) {
      const score = splitScore(first, second);
      this.bests.set(this.asker, Math.max(this.bests.get(this.asker) ?? 0, score));
    }
    this.answers.clear();
    this.round += 1;
  }

  private publish(): void {
    if (!this.admin) return;
    const guestIds = this.guestIds();
    // Seats the first asker, and nothing else: entities are never removed, so
    // an asker cannot fall out of the registry once it is in.
    if (!this.asker || !guestIds.includes(this.asker)) this.asker = guestIds[0] ?? null;

    this.admin.write('public', {
      round: this.round,
      asker: this.asker,
      guests: guestIds.map((entityId) => ({
        entityId,
        name: this.names.get(entityId) ?? defaultName(entityId),
        answered: this.answers.has(entityId)
      }))
    } satisfies PublicView);

    if (!this.asker) return;
    const { first, second } = this.counts();
    this.admin.write(`tally:${this.asker}`, {
      round: this.round,
      first,
      second,
      answered: first + second,
      eligible: Math.max(guestIds.length - 1, 0),
      split: splitScore(first, second),
      best: this.bests.get(this.asker) ?? 0
    } satisfies TallyView);
  }

  private counts(): { first: number; second: number } {
    let first = 0;
    let second = 0;
    for (const choice of this.answers.values()) {
      if (choice === 'first') first += 1;
      else second += 1;
    }
    return { first, second };
  }

  private guestIds(): EntityId[] {
    return this.session.entitiesOfRole('guest').map((entity) => entity.entityId);
  }

  private setTally(view: TallyView | null): void {
    this.tally = view;
    this.tallyHandlers.forEach((handler) => handler(view));
  }
}
