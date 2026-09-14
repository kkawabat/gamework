/**
 * The rules of Set, free of the DOM and of any session. A card is a number
 * 0–80 whose four ternary digits are number, colour, shading and shape.
 * Three cards are a set when each digit is all-same or all-different — which
 * is exactly `(a + b + c) % 3 === 0` in each place.
 *
 * Solo and multiplayer both reduce through this table. The session layer only
 * exists to serialize who claimed a set first; it does not know what a set is.
 */

export const DECK_SIZE = 81;
export const BOARD_MIN = 12;
export const BOARD_STEP = 3;
export const ATTRIBUTES = 4;

/** 0–80. Each ternary digit is one attribute. */
export type Card = number;

export type Phase = 'idle' | 'playing' | 'over';

export interface PublicView {
  phase: Phase;
  board: Card[];
  deckRemaining: number;
  scores: Array<{ entityId: string; cards: number }>;
  lastClaim: { entityId: string; cards: Card[] } | null;
  paused: boolean;
}

export interface TableOptions {
  /** Injectable so tests get a deterministic shuffle. */
  random?: () => number;
  /** Skip the shuffle entirely — the remaining cards are dealt in this order. */
  deck?: Card[];
}

export function attribute(card: Card, index: number): number {
  return Math.floor(card / 3 ** index) % 3;
}

/** The unique card that completes a set with `a` and `b`. */
export function thirdCard(a: Card, b: Card): Card {
  let third = 0;
  for (let index = 0; index < ATTRIBUTES; index += 1) {
    const va = attribute(a, index);
    const vb = attribute(b, index);
    const vc = (3 - ((va + vb) % 3)) % 3;
    third += vc * 3 ** index;
  }
  return third;
}

export function isSet(a: Card, b: Card, c: Card): boolean {
  if (a === b || a === c || b === c) return false;
  for (let index = 0; index < ATTRIBUTES; index += 1) {
    if ((attribute(a, index) + attribute(b, index) + attribute(c, index)) % 3 !== 0) {
      return false;
    }
  }
  return true;
}

export function findSets(board: Card[]): Array<[number, number, number]> {
  const found: Array<[number, number, number]> = [];
  for (let i = 0; i < board.length; i += 1) {
    for (let j = i + 1; j < board.length; j += 1) {
      for (let k = j + 1; k < board.length; k += 1) {
        if (isSet(board[i], board[j], board[k])) found.push([i, j, k]);
      }
    }
  }
  return found;
}

/** One card from a set on the board, or null if there is none to hint. */
export function firstHintCard(board: Card[]): Card | null {
  const found = findSets(board);
  return found.length ? board[found[0][0]] : null;
}

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, card) => card);
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function formatElapsed(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalTenths = Math.floor(clamped / 100);
  const tenths = totalTenths % 10;
  const seconds = Math.floor(totalTenths / 10) % 60;
  const minutes = Math.floor(totalTenths / 600);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

export class SetTable {
  board: Card[] = [];
  deck: Card[] = [];
  scores = new Map<string, number>();
  phase: Phase = 'idle';
  lastClaim: PublicView['lastClaim'] = null;
  private away = new Set<string>();

  private readonly random: () => number;
  private readonly presetDeck: Card[] | null;

  constructor(options: TableOptions = {}) {
    this.random = options.random ?? Math.random;
    this.presetDeck = options.deck ?? null;
  }

  start(playerIds: string[]): void {
    if (playerIds.length < 1) throw new Error('Need at least one player');
    this.deck = this.presetDeck ? this.presetDeck.slice() : shuffle(fullDeck(), this.random);
    this.board = [];
    this.scores = new Map(playerIds.map((id) => [id, 0]));
    this.phase = 'playing';
    this.lastClaim = null;
    this.away.clear();
    this.deal(BOARD_MIN);
    this.ensureSet();
  }

  /**
   * Take a set identified by the cards themselves, not by board indices — two
   * claims in flight would otherwise race over slots that were just replaced.
   * Each taken card is swapped in place from the deck so the rest of the grid
   * does not slide up; leftover holes are dropped only when the deck is empty.
   */
  claim(playerId: string, cards: Card[]): boolean {
    if (this.phase !== 'playing' || this.paused) return false;
    if (!this.scores.has(playerId)) return false;
    if (cards.length !== 3 || new Set(cards).size !== 3) return false;
    if (cards.some((card) => !this.board.includes(card))) return false;
    if (!isSet(cards[0], cards[1], cards[2])) return false;

    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 3);
    this.lastClaim = { entityId: playerId, cards: cards.slice() };
    this.replaceInPlace(cards);
    this.ensureSet();
    this.checkOver();
    return true;
  }

  /** A player left the tab. The table stays paused until every device is back. */
  setAway(entityId: string, hidden: boolean): void {
    if (this.phase !== 'playing') return;
    if (hidden) this.away.add(entityId);
    else this.away.delete(entityId);
  }

  get paused(): boolean {
    return this.phase === 'playing' && this.away.size > 0;
  }

  /** Drop away flags for seats that left the table, so a closed tab cannot freeze play forever. */
  retainAway(playerIds: string[]): void {
    const living = new Set(playerIds);
    for (const id of [...this.away]) {
      if (!living.has(id)) this.away.delete(id);
    }
  }

  view(): PublicView {
    return {
      phase: this.phase,
      board: this.board.slice(),
      deckRemaining: this.deck.length,
      scores: [...this.scores.entries()].map(([entityId, cards]) => ({ entityId, cards })),
      lastClaim: this.lastClaim,
      paused: this.paused
    };
  }

  private deal(count: number): void {
    const take = Math.min(count, this.deck.length);
    this.board.push(...this.deck.splice(0, take));
  }

  /** Put the next deck card in each taken slot. Skip a slot only if the deck is empty. */
  private replaceInPlace(taken: Card[]): void {
    const claimed = new Set(taken);
    const next: Card[] = [];
    for (const card of this.board) {
      if (!claimed.has(card)) {
        next.push(card);
        continue;
      }
      const replacement = this.deck.shift();
      if (replacement !== undefined) next.push(replacement);
    }
    this.board = next;
  }

  private ensureSet(): void {
    while (findSets(this.board).length === 0 && this.deck.length > 0) {
      this.deal(BOARD_STEP);
    }
  }

  private checkOver(): void {
    if (findSets(this.board).length === 0 && this.deck.length === 0) {
      this.phase = 'over';
    }
  }
}
