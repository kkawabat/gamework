/**
 * Texas Hold'em reducer. Pure: no session, no DOM. The dealer is the only
 * device that runs this; everyone else sees a view the dealer publishes.
 */

import { BaseGameState, GameAction } from '../../src';

// --- Table constants -------------------------------------------------------

export const START_STACK = 100;
export const SMALL_BLIND = 1;
export const BIG_BLIND = 2;
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;

export type Stage = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

// --- Cards -----------------------------------------------------------------
// A card is an integer 0..51. rank = card % 13 (0=Two .. 12=Ace),
// suit = floor(card / 13) (0=spades 1=hearts 2=diamonds 3=clubs).

export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'];

export function cardRankIndex(card: number): number { return card % 13; }
export function cardSuit(card: number): number { return Math.floor(card / 13); }
export function cardRankValue(card: number): number { return (card % 13) + 2; } // 2..14
export function isRedCard(card: number): boolean { return cardSuit(card) === 1 || cardSuit(card) === 2; }

// --- Deterministic RNG (mulberry32) ---------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledDeck(seed: number): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const rng = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// --- Hand evaluation -------------------------------------------------------
// evaluate5 returns [category, ...tiebreakers] where a larger array compares
// higher lexicographically. Category: 8 straight flush, 7 quads, 6 full house,
// 5 flush, 4 straight, 3 trips, 2 two pair, 1 pair, 0 high card.

export const HAND_CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

function compareScore(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function evaluate5(cards: number[]): number[] {
  const ranks = cards.map(cardRankValue).sort((a, b) => b - a); // desc
  const suits = cards.map(cardSuit);
  const isFlush = suits.every(s => s === suits[0]);

  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5; // wheel A-2-3-4-5
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // Sort groups by count desc, then rank desc — yields correct kicker order.
  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const groupRanks = groups.map(g => g[0]);
  const groupCounts = groups.map(g => g[1]);

  if (isFlush && straightHigh) return [8, straightHigh];
  if (groupCounts[0] === 4) return [7, groupRanks[0], groupRanks[1]];
  if (groupCounts[0] === 3 && groupCounts[1] === 2) return [6, groupRanks[0], groupRanks[1]];
  if (isFlush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groupCounts[0] === 3) return [3, ...groupRanks]; // trip, kicker, kicker
  if (groupCounts[0] === 2 && groupCounts[1] === 2) return [2, groupRanks[0], groupRanks[1], groupRanks[2]];
  if (groupCounts[0] === 2) return [1, ...groupRanks]; // pair, k, k, k
  return [0, ...ranks];
}

// All C(7,5) = 21 index combinations, precomputed.
const COMBOS_7C5: number[][] = (() => {
  const out: number[][] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++)
            out.push([a, b, c, d, e]);
  return out;
})();

export function evaluate7(cards: number[]): number[] {
  let best: number[] | null = null;
  for (const combo of COMBOS_7C5) {
    const score = evaluate5(combo.map(i => cards[i]));
    if (best === null || compareScore(score, best) > 0) best = score;
  }
  return best!;
}

export function handCategoryName(score: number[]): string {
  return HAND_CATEGORY_NAMES[score[0]] ?? 'High Card';
}

// --- Side pots -------------------------------------------------------------
// Split the total contributed chips (committed[]) into a main pot and any side
// pots, tracking which non-folded seats are eligible to win each. Folded
// players' chips stay in the pots as dead money but they win nothing.

export interface Pot { amount: number; eligible: number[]; }

export function buildPots(committed: number[], folded: boolean[]): Pot[] {
  const remaining = committed.slice();
  const pots: Pot[] = [];
  while (true) {
    const positive = remaining.filter(r => r > 0);
    if (positive.length === 0) break;
    const level = Math.min(...positive);
    let amount = 0;
    const eligible: number[] = [];
    for (let s = 0; s < remaining.length; s++) {
      if (remaining[s] > 0) {
        amount += level;
        remaining[s] -= level;
        if (!folded[s]) eligible.push(s);
      }
    }
    // Merge into the previous pot when the eligible set is unchanged (avoids
    // spurious empty side pots when contributions are equal).
    const prev = pots[pots.length - 1];
    if (prev && sameSeats(prev.eligible, eligible)) prev.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

function sameSeats(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- State & actions -------------------------------------------------------

export interface HandResult {
  kind: 'fold' | 'showdown';
  winnings: number[];        // chips returned to each seat
  names: (string | null)[];  // hand name per revealed seat, else null
  revealed: boolean[];       // which seats expose their hole cards
  potTotal: number;
}

export interface PokerState extends BaseGameState {
  numPlayers: number;
  stage: Stage;
  deck: number[];
  deckPos: number;
  hole: number[][];          // [numPlayers][2]; empty for players not dealt in
  community: number[];
  stacks: number[];
  roundBet: number[];        // chips committed in the current betting round
  committed: number[];       // chips committed across the whole hand
  folded: boolean[];
  inHand: boolean[];         // dealt into this hand (had chips at hand start)
  needAct: boolean[];        // still owes an action this round
  pot: number;
  button: number;
  toAct: number;
  lastRaiseSize: number;     // minimum legal raise increment over the current bet
  handNumber: number;
  handOver: boolean;
  matchOver: boolean;
  matchWinner: number | null;
  result: HandResult | null;
  message: string;
}

export type PokerActionType =
  | 'DEAL' | 'NEW_MATCH'                  // host-authored, carry a shuffle seed
  | 'FOLD' | 'CHECK' | 'CALL' | 'RAISE'; // player betting actions

export interface PokerAction extends GameAction {
  type: PokerActionType;
  payload: {
    seed?: number;        // DEAL / NEW_MATCH
    numPlayers?: number;  // NEW_MATCH
    seat?: number;        // betting actions
    amount?: number;      // RAISE: target total for this player's roundBet ("raise to")
  };
}

// --- Legal-action helper (shared by engine validation and the UI) ----------

export interface LegalActions {
  isTurn: boolean;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

const NO_ACTIONS: LegalActions = {
  isTurn: false, canFold: false, canCheck: false, canCall: false, callAmount: 0,
  canRaise: false, minRaiseTo: 0, maxRaiseTo: 0
};

/** The betting fields a client needs — no hole cards, no deck. */
export type BettingState = Pick<PokerState,
  'numPlayers' | 'stage' | 'stacks' | 'roundBet' | 'folded' | 'inHand' |
  'toAct' | 'lastRaiseSize' | 'handOver'
>;

function currentBetOf(state: BettingState): number {
  let max = 0;
  for (let s = 0; s < state.numPlayers; s++) if (state.roundBet[s] > max) max = state.roundBet[s];
  return max;
}

export function legalActions(state: BettingState, seat: number): LegalActions {
  if (state.handOver || state.stage === 'idle' || state.stage === 'showdown') return NO_ACTIONS;
  if (state.toAct !== seat || seat < 0) return NO_ACTIONS;
  if (state.folded[seat] || !state.inHand[seat] || state.stacks[seat] === 0) return NO_ACTIONS;

  const currentBet = currentBetOf(state);
  const toCall = currentBet - state.roundBet[seat];
  const stack = state.stacks[seat];
  const maxRaiseTo = state.roundBet[seat] + stack; // all-in ceiling

  // A raise needs at least one other live opponent with chips to face it.
  let opponentWithChips = false;
  for (let s = 0; s < state.numPlayers; s++) {
    if (s !== seat && state.inHand[s] && !state.folded[s] && state.stacks[s] > 0) { opponentWithChips = true; break; }
  }
  const canRaise = stack > toCall && opponentWithChips;
  let minRaiseTo = currentBet + state.lastRaiseSize;
  if (minRaiseTo > maxRaiseTo) minRaiseTo = maxRaiseTo; // short all-in

  return {
    isTurn: true,
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, stack),
    canRaise,
    minRaiseTo,
    maxRaiseTo
  };
}

// --- Engine ----------------------------------------------------------------

export class PokerEngine {
  processAction(state: PokerState, action: PokerAction): PokerState {
    switch (action.type) {
      case 'DEAL':
        return this.startHand(state, action.payload.seed ?? 0, state.numPlayers);
      case 'NEW_MATCH':
        return this.startHand(state, action.payload.seed ?? 0,
          this.clampPlayers(action.payload.numPlayers ?? state.numPlayers), true);
      case 'FOLD':
      case 'CHECK':
      case 'CALL':
      case 'RAISE':
        return this.processBet(state, action);
      default:
        return state;
    }
  }

  update(state: PokerState): PokerState { return state; }

  validateAction(action: PokerAction): boolean {
    switch (action.type) {
      case 'DEAL':
        return typeof action.payload.seed === 'number';
      case 'NEW_MATCH':
        return typeof action.payload.seed === 'number' && typeof action.payload.numPlayers === 'number';
      case 'FOLD':
      case 'CHECK':
      case 'CALL':
        return typeof action.payload.seat === 'number';
      case 'RAISE':
        return typeof action.payload.seat === 'number' && typeof action.payload.amount === 'number';
      default:
        return false;
    }
  }

  getInitialState(numPlayers = MIN_PLAYERS): PokerState {
    const n = this.clampPlayers(numPlayers);
    return {
      id: 'poker',
      timestamp: Date.now(),
      version: 0,
      numPlayers: n,
      stage: 'idle',
      deck: [],
      deckPos: 0,
      hole: Array.from({ length: n }, () => []),
      community: [],
      stacks: Array(n).fill(START_STACK),
      roundBet: Array(n).fill(0),
      committed: Array(n).fill(0),
      folded: Array(n).fill(false),
      inHand: Array(n).fill(false),
      needAct: Array(n).fill(false),
      pot: 0,
      button: 0,
      toAct: -1,
      lastRaiseSize: BIG_BLIND,
      handNumber: 0,
      handOver: false,
      matchOver: false,
      matchWinner: null,
      result: null,
      message: 'Waiting to start…'
    };
  }

  private clampPlayers(n: number): number {
    return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(n)));
  }

  // Walk clockwise from `from`, returning the first seat satisfying `pred`, or
  // -1 if none in a full lap.
  private nextSeat(n: number, from: number, pred: (s: number) => boolean): number {
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (pred(s)) return s;
    }
    return -1;
  }

  private startHand(prev: PokerState, seed: number, numPlayers: number, newMatch = false): PokerState {
    const n = numPlayers;
    const stacks = newMatch ? Array(n).fill(START_STACK) : prev.stacks.slice();
    const handNumber = newMatch ? 1 : prev.handNumber + 1;
    const hasChips = (s: number) => stacks[s] > 0;

    // Button: first hand sits on seat 0; afterwards it advances to the next
    // seat that still has chips.
    const button = (newMatch || prev.handNumber === 0)
      ? this.nextSeat(n, n - 1, hasChips)          // first seat with chips (>= 0)
      : this.nextSeat(n, prev.button, hasChips);

    const inHand = Array.from({ length: n }, (_, s) => hasChips(s));
    const numDealt = inHand.filter(Boolean).length;

    const deck = shuffledDeck(seed);
    const hole: number[][] = Array.from({ length: n }, () => []);
    let pos = 0;
    // Deal two cards, one per player per pass, clockwise from the small blind.
    for (let pass = 0; pass < 2; pass++) {
      let seat = button;
      for (let i = 0; i < numDealt; i++) {
        seat = this.nextSeat(n, seat, s => inHand[s]);
        hole[seat].push(deck[pos++]);
      }
    }

    const roundBet = Array(n).fill(0);
    const committed = Array(n).fill(0);

    // Blind positions. Heads-up is the special case: the button posts the small
    // blind and acts first preflop.
    let sb: number, bb: number, firstToAct: number;
    if (numDealt === 2) {
      sb = button;
      bb = this.nextSeat(n, button, s => inHand[s]);
      firstToAct = sb;
    } else {
      sb = this.nextSeat(n, button, s => inHand[s]);
      bb = this.nextSeat(n, sb, s => inHand[s]);
      firstToAct = this.nextSeat(n, bb, s => inHand[s]);
    }

    const post = (seat: number, blind: number) => {
      const amount = Math.min(blind, stacks[seat]);
      stacks[seat] -= amount;
      roundBet[seat] = amount;
      committed[seat] = amount;
    };
    post(sb, SMALL_BLIND);
    post(bb, BIG_BLIND);

    let state: PokerState = {
      id: 'poker',
      timestamp: Date.now(),
      version: prev.version + 1,
      numPlayers: n,
      stage: 'preflop',
      deck,
      deckPos: pos,
      hole,
      community: [],
      stacks,
      roundBet,
      committed,
      folded: Array(n).fill(false),
      inHand,
      // Everyone dealt in still owes an action preflop (the big blind keeps the
      // option to raise), unless a blind already put them all-in.
      needAct: Array.from({ length: n }, (_, s) => inHand[s] && stacks[s] > 0),
      pot: committed.reduce((a, b) => a + b, 0),
      button,
      toAct: firstToAct,
      lastRaiseSize: BIG_BLIND,
      handNumber,
      handOver: false,
      matchOver: false,
      matchWinner: null,
      result: null,
      message: `Hand #${handNumber} — blinds posted`
    };

    // If the first player can't act (all-in from a blind), settle forward.
    state = this.settle(state, firstToAct);
    return state;
  }

  private processBet(state: PokerState, action: PokerAction): PokerState {
    if (state.handOver || state.stage === 'idle' || state.stage === 'showdown') return state;
    const seat = action.payload.seat as number;
    if (seat !== state.toAct) return state;

    const legal = legalActions(state, seat);
    if (!legal.isTurn) return state;
    const next = this.clone(state);

    if (action.type === 'FOLD') {
      next.folded[seat] = true;
      next.needAct[seat] = false;
      next.message = `${playerName(seat)} folds`;
    } else if (action.type === 'CHECK') {
      if (!legal.canCheck) return state;
      next.needAct[seat] = false;
      next.message = `${playerName(seat)} checks`;
    } else if (action.type === 'CALL') {
      if (!legal.canCall) return state;
      const pay = legal.callAmount;
      next.stacks[seat] -= pay;
      next.roundBet[seat] += pay;
      next.committed[seat] += pay;
      next.pot += pay;
      next.needAct[seat] = false;
      next.message = `${playerName(seat)} calls ${pay}`;
    } else { // RAISE
      if (!legal.canRaise) return state;
      let raiseTo = action.payload.amount ?? 0;
      if (raiseTo > legal.maxRaiseTo) raiseTo = legal.maxRaiseTo;
      const currentBet = currentBetOf(next);
      const isAllIn = raiseTo === legal.maxRaiseTo;
      if (raiseTo < legal.minRaiseTo && !isAllIn) return state;
      if (raiseTo <= currentBet) return state;

      const pay = raiseTo - next.roundBet[seat];
      next.stacks[seat] -= pay;
      next.committed[seat] += pay;
      next.pot += pay;
      const raiseIncrement = raiseTo - currentBet;
      next.roundBet[seat] = raiseTo;
      if (raiseIncrement >= next.lastRaiseSize) next.lastRaiseSize = raiseIncrement;
      // Everyone else still in the hand with chips owes a response.
      for (let s = 0; s < next.numPlayers; s++) {
        if (s !== seat && next.inHand[s] && !next.folded[s] && next.stacks[s] > 0) next.needAct[s] = true;
      }
      next.needAct[seat] = false;
      next.message = raiseTo === legal.maxRaiseTo && currentBet > 0
        ? `${playerName(seat)} goes all-in for ${raiseTo}`
        : `${playerName(seat)} ${currentBet > 0 ? 'raises' : 'bets'} to ${raiseTo}`;
    }

    return this.settle(next, seat);
  }

  // Advance the action, close betting rounds, deal streets and resolve the
  // hand. `from` is the seat that just acted (or the intended first actor).
  private settle(state: PokerState, from: number): PokerState {
    const n = state.numPlayers;
    for (let s = 0; s < n; s++) if (state.stacks[s] === 0) state.needAct[s] = false;

    const contesting = this.seats(state, s => state.inHand[s] && !state.folded[s]);
    if (contesting.length === 1) return this.awardFold(state, contesting[0]);

    const owes = (s: number) => state.inHand[s] && !state.folded[s] && state.stacks[s] > 0 && state.needAct[s];
    const roundClosed = this.seats(state, owes).length === 0;

    if (!roundClosed) {
      const nextToAct = this.nextSeat(n, from, owes);
      state.toAct = nextToAct;
      return state;
    }
    return this.advanceStreet(state);
  }

  private advanceStreet(state: PokerState): PokerState {
    const n = state.numPlayers;
    const canBet = () => this.seats(state, s => state.inHand[s] && !state.folded[s] && state.stacks[s] > 0);
    const noMoreBetting = canBet().length <= 1;

    while (true) {
      if (state.stage === 'preflop') {
        state.community = [state.deck[state.deckPos], state.deck[state.deckPos + 1], state.deck[state.deckPos + 2]];
        state.deckPos += 3;
        state.stage = 'flop';
      } else if (state.stage === 'flop') {
        state.community = [...state.community, state.deck[state.deckPos++]];
        state.stage = 'turn';
      } else if (state.stage === 'turn') {
        state.community = [...state.community, state.deck[state.deckPos++]];
        state.stage = 'river';
      } else if (state.stage === 'river') {
        return this.showdown(state);
      }

      if (noMoreBetting) continue; // run the board out to showdown

      // Open a fresh betting round; first active seat left of the button acts.
      for (let s = 0; s < n; s++) {
        state.roundBet[s] = 0;
        state.needAct[s] = state.inHand[s] && !state.folded[s] && state.stacks[s] > 0;
      }
      state.lastRaiseSize = BIG_BLIND;
      state.toAct = this.nextSeat(n, state.button, s => state.inHand[s] && !state.folded[s] && state.stacks[s] > 0);
      state.message = `${capitalize(state.stage)} — ${playerName(state.toAct)} to act`;
      return state;
    }
  }

  private showdown(state: PokerState): PokerState {
    state.stage = 'showdown';
    const n = state.numPlayers;
    const winnings = Array(n).fill(0);
    const names: (string | null)[] = Array(n).fill(null);
    const revealed: boolean[] = Array.from({ length: n }, (_, s) => state.inHand[s] && !state.folded[s]);
    const potTotal = state.committed.reduce((a, b) => a + b, 0);

    // Evaluate every contesting hand once.
    const scores: (number[] | null)[] = Array(n).fill(null);
    for (let s = 0; s < n; s++) {
      if (revealed[s]) {
        scores[s] = evaluate7([...state.hole[s], ...state.community]);
        names[s] = handCategoryName(scores[s]!);
      }
    }

    // Award each pot to the best eligible hand(s).
    for (const pot of buildPots(state.committed, state.folded)) {
      let best: number[] | null = null;
      let winners: number[] = [];
      for (const s of pot.eligible) {
        const score = scores[s];
        if (!score) continue;
        const cmp = best === null ? 1 : compareScore(score, best);
        if (cmp > 0) { best = score; winners = [s]; }
        else if (cmp === 0) winners.push(s);
      }
      if (winners.length === 0) continue;
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const s of winners) {
        let award = share;
        if (remainder > 0) { award += 1; remainder -= 1; } // odd chip to earliest seat
        winnings[s] += award;
      }
    }

    for (let s = 0; s < n; s++) state.stacks[s] += winnings[s];

    const topWinner = winnings.indexOf(Math.max(...winnings));
    state.result = { kind: 'showdown', winnings, names, revealed, potTotal };
    state.message = `${playerName(topWinner)} wins ${winnings[topWinner]} with ${names[topWinner]}`;
    return this.endHand(state);
  }

  private awardFold(state: PokerState, winner: number): PokerState {
    const n = state.numPlayers;
    const potTotal = state.committed.reduce((a, b) => a + b, 0);
    const winnings = Array(n).fill(0);
    winnings[winner] = potTotal;
    state.stacks[winner] += potTotal;
    state.result = {
      kind: 'fold', winnings, names: Array(n).fill(null),
      revealed: Array(n).fill(false), potTotal
    };
    state.message = `${playerName(winner)} wins ${potTotal} (everyone folded)`;
    return this.endHand(state);
  }

  private endHand(state: PokerState): PokerState {
    state.handOver = true;
    state.pot = 0;
    state.needAct = Array(state.numPlayers).fill(false);
    state.toAct = -1;
    const withChips = this.seats(state, s => state.stacks[s] > 0);
    if (withChips.length <= 1) {
      state.matchOver = true;
      state.matchWinner = withChips[0] ?? null;
      if (state.matchWinner !== null) state.message = `${playerName(state.matchWinner)} wins the match!`;
    }
    return state;
  }

  private seats(state: PokerState, pred: (s: number) => boolean): number[] {
    const out: number[] = [];
    for (let s = 0; s < state.numPlayers; s++) if (pred(s)) out.push(s);
    return out;
  }

  private clone(state: PokerState): PokerState {
    return {
      ...state,
      hole: state.hole.map(h => [...h]),
      community: [...state.community],
      stacks: [...state.stacks],
      roundBet: [...state.roundBet],
      committed: [...state.committed],
      folded: [...state.folded],
      inHand: [...state.inHand],
      needAct: [...state.needAct],
      result: state.result,
      version: state.version + 1,
      timestamp: Date.now()
    };
  }
}

// Seats are labelled generically by index; the manager maps them to names.
export function playerName(seat: number): string {
  return seat < 0 ? 'Nobody' : `Player ${seat + 1}`;
}
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
