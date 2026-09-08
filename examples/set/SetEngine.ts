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
    this.deal(BOARD_MIN);
    this.ensureSet();
  }

  /**
   * Take a set identified by the cards themselves, not by board indices — two
   * claims in flight would otherwise race over a board that shifted under them.
   */
  claim(playerId: string, cards: Card[]): boolean {
    if (this.phase !== 'playing') return false;
    if (!this.scores.has(playerId)) return false;
    if (cards.length !== 3 || new Set(cards).size !== 3) return false;
    if (cards.some((card) => !this.board.includes(card))) return false;
    if (!isSet(cards[0], cards[1], cards[2])) return false;

    this.board = this.board.filter((card) => !cards.includes(card));
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 3);
    this.lastClaim = { entityId: playerId, cards: cards.slice() };
    this.replenish();
    this.ensureSet();
    this.checkOver();
    return true;
  }

  view(): PublicView {
    return {
      phase: this.phase,
      board: this.board.slice(),
      deckRemaining: this.deck.length,
      scores: [...this.scores.entries()].map(([entityId, cards]) => ({ entityId, cards })),
      lastClaim: this.lastClaim
    };
  }

  private deal(count: number): void {
    const take = Math.min(count, this.deck.length);
    this.board.push(...this.deck.splice(0, take));
  }

  private replenish(): void {
    if (this.board.length < BOARD_MIN) this.deal(BOARD_MIN - this.board.length);
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
