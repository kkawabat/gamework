import { Session } from '../../src/session/Session';
import { SessionMode } from '../../src/session/SessionTypes';
import { FakeNet, FakeTransport } from '../helpers/fake-network';
import {
  attribute,
  BOARD_MIN,
  DECK_SIZE,
  findSets,
  formatElapsed,
  fullDeck,
  isSet,
  SetTable,
  thirdCard
} from '../../examples/set/SetEngine';
import {
  MIN_PLAYERS,
  SET_ROLES,
  SetDirector
} from '../../examples/set/SetDirector';

/**
 * A 12-card collection with no set, built greedily from the front of the
 * deck. The maximum cap in Set is 20, so twelve is always reachable.
 */
function cap(size: number, from: number[] = fullDeck()): number[] {
  const picked: number[] = [];
  for (const card of from) {
    if (picked.length >= size) break;
    if (findSets([...picked, card]).length === 0) picked.push(card);
  }
  if (picked.length < size) {
    throw new Error(`Could only pack a cap of ${picked.length}, wanted ${size}`);
  }
  return picked;
}

describe('Set — the rules', () => {
  it('treats three cards as a set iff each attribute is all-same or all-different', () => {
    // 0, 1, 2 differ only in the first attribute — a set.
    expect(isSet(0, 1, 2)).toBe(true);
    // All four attributes different: 0 (0000), 40 (1111), 80 (2222) in ternary.
    expect([0, 40, 80].map((card) => [0, 1, 2, 3].map((i) => attribute(card, i))))
      .toEqual([[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2]]);
    expect(isSet(0, 40, 80)).toBe(true);
    // Two the same in one place, not the third.
    expect(isSet(0, 1, 3)).toBe(false);
    expect(isSet(0, 0, 1)).toBe(false);
  });

  it('names the unique third card that completes any pair', () => {
    expect(thirdCard(0, 1)).toBe(2);
    expect(isSet(7, 23, thirdCard(7, 23))).toBe(true);
    for (let a = 0; a < 20; a += 1) {
      for (let b = a + 1; b < 20; b += 1) {
        const c = thirdCard(a, b);
        expect(isSet(a, b, c)).toBe(true);
        expect(c).not.toBe(a);
        expect(c).not.toBe(b);
      }
    }
  });

  it('finds every set on a small board', () => {
    expect(findSets([0, 1, 2, 3])).toEqual([[0, 1, 2]]);
  });

  it('formats a stopwatch without a leading space', () => {
    expect(formatElapsed(0)).toBe('0:00.0');
    expect(formatElapsed(1_230)).toBe('0:01.2');
    expect(formatElapsed(75_400)).toBe('1:15.4');
  });
});

describe('Set — a table', () => {
  it('deals twelve, then extra only when those twelve hold no set', () => {
    const withSet = new SetTable({ deck: fullDeck() });
    withSet.start(['solo']);
    expect(withSet.board).toHaveLength(BOARD_MIN);
    expect(withSet.board.length + withSet.deck.length).toBe(DECK_SIZE);
    expect(findSets(withSet.board).length).toBeGreaterThan(0);

    const packed = cap(12);
    const rest = fullDeck().filter((card) => !packed.includes(card));
    const noSet = new SetTable({ deck: [...packed, ...rest] });
    noSet.start(['solo']);
    expect(noSet.board.length).toBeGreaterThan(BOARD_MIN);
    expect(findSets(noSet.board).length).toBeGreaterThan(0);
  });

  it('gives the three cards to the claimant and keeps board + deck + taken = 81', () => {
    const table = new SetTable({ deck: fullDeck() });
    table.start(['a', 'b']);
    const [i, j, k] = findSets(table.board)[0];
    const cards = [table.board[i], table.board[j], table.board[k]];
    expect(table.claim('a', cards)).toBe(true);
    expect(table.scores.get('a')).toBe(3);
    expect(table.scores.get('b')).toBe(0);
    expect(table.board).not.toEqual(expect.arrayContaining(cards));
    const taken = [...table.scores.values()].reduce((sum, n) => sum + n, 0);
    expect(table.board.length + table.deck.length + taken).toBe(DECK_SIZE);
  });

  it('rejects a claim that is not a set, not on the board, or from a stranger', () => {
    const table = new SetTable({ deck: fullDeck() });
    table.start(['a']);
    expect(table.claim('a', [0, 1, 3])).toBe(false);
    expect(table.claim('a', [table.board[0], table.board[1], 80])).toBe(false);
    expect(table.claim('ghost', [table.board[0], table.board[1], table.board[2]])).toBe(false);
    expect(table.scores.get('a')).toBe(0);
  });

  it('identifies a set by the cards, so a later claim survives the board shifting', () => {
    const table = new SetTable({ deck: fullDeck() });
    table.start(['a', 'b']);
    const sets = findSets(table.board);
    expect(sets.length).toBeGreaterThan(1);
    const first = sets[0].map((index) => table.board[index]);
    const second = sets[1].map((index) => table.board[index]);
    // Disjoint enough? If they share a card the second should fail; that is
    // also correct. The point is the second claim is in card ids, not indexes.
    expect(table.claim('a', first)).toBe(true);
    const secondStillOnBoard = second.every((card) => table.board.includes(card));
    expect(table.claim('b', second)).toBe(secondStillOnBoard);
  });

  it('can clear a shuffled deck without getting stuck', () => {
    let seed = 1;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const table = new SetTable({ random });
    table.start(['solo']);
    let taken = 0;
    while (table.phase === 'playing') {
      const found = findSets(table.board);
      expect(found.length).toBeGreaterThan(0);
      const cards = found[0].map((index) => table.board[index]);
      expect(table.claim('solo', cards)).toBe(true);
      taken += 1;
      expect(taken).toBeLessThan(40);
    }
    expect(table.phase).toBe('over');
    expect((table.scores.get('solo') ?? 0) + table.board.length).toBe(DECK_SIZE);
  });

  it('ends when the deck is empty and the leftover cards hold no set', () => {
    const leftover = cap(4);
    let triple: number[] | null = null;
    for (let a = 0; a < DECK_SIZE && !triple; a += 1) {
      if (leftover.includes(a)) continue;
      for (let b = a + 1; b < DECK_SIZE && !triple; b += 1) {
        if (leftover.includes(b)) continue;
        const c = thirdCard(a, b);
        if (c >= 0 && c < DECK_SIZE && c !== a && c !== b && !leftover.includes(c)) {
          triple = [a, b, c];
        }
      }
    }
    const table = new SetTable({ deck: [...triple!, ...leftover] });
    table.start(['solo']);
    expect(table.deck).toHaveLength(0);
    expect(table.claim('solo', triple!)).toBe(true);
    expect(table.phase).toBe('over');
    expect(findSets(table.board)).toHaveLength(0);
    expect(table.board).toEqual(leftover);
  });
});

const MODE: SessionMode = { connectivity: 'star', authority: 'authoritative' };

interface Device {
  session: Session;
  director: SetDirector;
  transport: FakeTransport;
  channelsSeen: string[];
}

async function makeGame(playerCount = 2, deck?: number[]): Promise<{ host: Device; guests: Device[] }> {
  const net = new FakeNet('star');

  const build = async (deviceId: string, entities: { role: string }[], isHost: boolean): Promise<Device> => {
    const transport = new FakeTransport(net, deviceId);
    const session = new Session(transport, { mode: MODE, deviceId, roles: SET_ROLES, entities });
    await session.initialize();
    if (isHost) await session.host();
    else {
      await session.join('ROOM01');
      transport.fireConnected(net.hostId!);
    }
    return { session, transport, director: new SetDirector(session, { deck }), channelsSeen: [] };
  };

  const host = await build('host', [{ role: 'admin' }, { role: 'player' }], true);
  const guests: Device[] = [];
  for (let index = 1; index < playerCount; index += 1) {
    guests.push(await build(`phone-${index}`, [{ role: 'player' }], false));
  }

  for (const device of [host, ...guests]) {
    device.director.attach();
    for (const entity of device.session.localEntities) {
      device.session.actAs(entity.entityId).on('*', (_payload, meta) =>
        device.channelsSeen.push(`${entity.entityId}:${meta.channel}`));
    }
  }

  return { host, guests };
}

describe('Set — a race', () => {
  it('gives the host an admin and a player, and each guest a player', async () => {
    const { host, guests } = await makeGame();
    expect(host.session.localEntities.map((e) => e.entityId)).toEqual(['admin-0', 'player-0']);
    expect(host.director.isAdmin).toBe(true);
    expect(host.director.playerId).toBe('player-0');
    expect(guests[0].director.playerId).toBe('player-1');
    expect(guests[0].director.isAdmin).toBe(false);
  });

  it('publishes the same board to every device, and credits the first valid claim', async () => {
    const { host, guests } = await makeGame(2, fullDeck());
    host.director.startGame();

    const board = host.director.publicView.board;
    expect(board).toHaveLength(BOARD_MIN);
    expect(guests[0].director.publicView.board).toEqual(board);

    const [i, j, k] = findSets(board)[0];
    const cards = [board[i], board[j], board[k]];
    guests[0].director.claim(cards);

    expect(host.director.publicView.scores).toEqual([
      { entityId: 'player-0', cards: 0 },
      { entityId: 'player-1', cards: 3 }
    ]);
    expect(guests[0].director.publicView.scores).toEqual(host.director.publicView.scores);
    expect(host.director.publicView.board).not.toEqual(expect.arrayContaining(cards));
  });

  it('lets the second of two disjoint claims still land after the board moves', async () => {
    const first = [0, 1, 2];
    const disjoint = [3, 4, 5];
    const rest = fullDeck().filter((card) => !first.includes(card) && !disjoint.includes(card));
    const { host, guests } = await makeGame(2, [...first, ...disjoint, ...rest]);
    host.director.startGame();

    guests[0].director.claim(first);
    host.director.claim(disjoint);
    expect(host.director.publicView.scores).toEqual([
      { entityId: 'player-0', cards: 3 },
      { entityId: 'player-1', cards: 3 }
    ]);
  });

  it('drops a claim for cards that have already been taken', async () => {
    const { host, guests } = await makeGame(2, fullDeck());
    host.director.startGame();
    const [i, j, k] = findSets(host.director.publicView.board)[0];
    const cards = [
      host.director.publicView.board[i],
      host.director.publicView.board[j],
      host.director.publicView.board[k]
    ];
    host.director.claim(cards);
    guests[0].director.claim(cards);
    expect(host.director.publicView.scores).toEqual([
      { entityId: 'player-0', cards: 3 },
      { entityId: 'player-1', cards: 0 }
    ]);
  });
});

describe('Set — permissions', () => {
  it('will not let a guest start a game or write the public view', async () => {
    const { guests } = await makeGame();
    expect(() => guests[0].director.startGame()).toThrow(/Only the admin/);
    expect(() => guests[0].session.actAs('player-1').write('public', { phase: 'over' }))
      .toThrow(/may not write/);
  });

  it('needs a minimum number of players', async () => {
    const { host } = await makeGame(1);
    expect(MIN_PLAYERS).toBe(2);
    expect(() => host.director.startGame()).toThrow(/at least 2/);
  });
});
