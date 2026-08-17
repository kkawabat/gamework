import { Session } from '../../src/session/Session';
import { SessionMode } from '../../src/session/SessionTypes';
import { FakeNet, FakeTransport } from '../helpers/fake-network';
import { POKER_ROLES, PokerDirector, PokerPublicView } from '../../examples/poker/PokerDirector';

/**
 * Drives the demo across real Sessions over the fake star. Assertions are
 * about routing: a spoke is never sent another seat's hole cards.
 */

const MODE: SessionMode = { connectivity: 'star', authority: 'authoritative' };

interface Device {
  session: Session;
  director: PokerDirector;
  transport: FakeTransport;
  channelsSeen: string[];
}

async function makeGame(playerCount = 3): Promise<{ host: Device; guests: Device[] }> {
  const net = new FakeNet('star');
  let seeds = 0;
  const nextSeed = (): number => {
    seeds += 1;
    return seeds;
  };

  const build = async (deviceId: string, entities: { role: string }[], isHost: boolean): Promise<Device> => {
    const transport = new FakeTransport(net, deviceId);
    const session = new Session(transport, { mode: MODE, deviceId, roles: POKER_ROLES, entities });
    await session.initialize();
    if (isHost) await session.host();
    else {
      await session.join('ROOM01');
      transport.fireConnected(net.hostId!);
    }
    return { session, transport, director: new PokerDirector(session, { nextSeed }), channelsSeen: [] };
  };

  const host = await build('host', [{ role: 'dealer' }, { role: 'player' }], true);
  const guests: Device[] = [];
  for (let index = 1; index < playerCount; index += 1) {
    guests.push(await build(`seat-${index}`, [{ role: 'player' }], false));
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

describe('Poker — registry', () => {
  it('gives the host a dealer and a player, and each guest a player', async () => {
    const { host, guests } = await makeGame();

    expect(host.session.localEntities.map((e) => e.entityId)).toEqual(['dealer-0', 'player-0']);
    expect(host.director.isDealer).toBe(true);
    expect(host.director.playerId).toBe('player-0');
    expect(guests.map((g) => g.director.playerId)).toEqual(['player-1', 'player-2']);
    expect(guests[0].director.isDealer).toBe(false);
  });
});

describe('Poker — dealing', () => {
  it('tells each player only their own hole cards', async () => {
    const { host, guests } = await makeGame();

    host.director.startMatch();

    const holes = [host, ...guests].map((device) => device.director.secret?.hole ?? []);
    expect(holes.every((hole) => hole.length === 2)).toBe(true);
    expect(holes[0]).not.toEqual(holes[1]);
    expect(holes[1]).not.toEqual(holes[2]);
  });

  it('never routes a hand to another player\'s device or to the dealer entity', async () => {
    const { host, guests } = await makeGame();

    host.director.startMatch();

    expect(host.channelsSeen).toEqual(['player-0:public', 'player-0:hand:player-0']);
    expect(guests[0].channelsSeen).toEqual(['player-1:public', 'player-1:hand:player-1']);
    expect(guests[1].channelsSeen).toEqual(['player-2:public', 'player-2:hand:player-2']);
  });

  it('keeps hole cards off the public view until a showdown reveal', async () => {
    const { host, guests } = await makeGame();

    host.director.startMatch();
    const view: PokerPublicView = guests[0].director.publicView;
    expect(view.stage).toBe('preflop');
    expect(view.shownHole.every((cards) => cards.length === 0)).toBe(true);
    expect(view.community).toEqual([]);
  });
});

describe('Poker — permissions', () => {
  it('will not let a guest start a match or write the public view', async () => {
    const { guests } = await makeGame();

    expect(() => guests[0].director.startMatch()).toThrow(/Only the dealer/);
    expect(() => guests[0].session.actAs('player-1').write('public', { stage: 'showdown' }))
      .toThrow(/may not write/);
  });

  it('will not let the host\'s player write a deal, though it shares the dealer\'s device', async () => {
    const { host } = await makeGame();

    expect(host.session.actAs('player-0').canWrite('public')).toBe(false);
    expect(host.session.actAs('player-0').canWrite('hand:player-1')).toBe(false);
    expect(() => host.session.actAs('player-0').write('public', {})).toThrow(/may not write/);
  });

  it('applies a bet from a spoke and publishes the new public view to every seat', async () => {
    const { host, guests } = await makeGame();
    host.director.startMatch();

    const toAct = host.director.publicView.toAct;
    const actor = [host, ...guests][toAct];
    actor.director.act('FOLD');

    expect(host.director.publicView.folded[toAct]).toBe(true);
    expect(guests[0].director.publicView.folded[toAct]).toBe(true);
    expect(guests[1].director.publicView.folded[toAct]).toBe(true);
  });
});
