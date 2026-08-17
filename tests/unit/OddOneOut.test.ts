import { Session } from '../../src/session/Session';
import { SessionMode } from '../../src/session/SessionTypes';
import { FakeNet, FakeTransport } from '../helpers/fake-network';
import {
  ODD_ONE_OUT_ROLES,
  OddOneOutDirector,
  PublicView,
  SecretView
} from '../../examples/odd-one-out/OddOneOutDirector';

/**
 * Drives the demo across real Sessions over the fake mesh. This is the
 * check that the model actually withholds what it claims to: no browser is
 * involved, so the assertions are about routing rather than about what a UI
 * chose to draw.
 */

const MODE: SessionMode = { connectivity: 'mesh', authority: 'authoritative' };

// First call picks the word, second picks the odd one out. 0.5 of three
// players lands on the middle one, which is a more useful pick than the first.
const scriptedRandom = (values: number[]): (() => number) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

interface Device {
  session: Session;
  director: OddOneOutDirector;
  transport: FakeTransport;
  /** Every channel this device received anything on, for leak assertions. */
  channelsSeen: string[];
}

async function makeGame(playerCount = 3): Promise<{ host: Device; guests: Device[] }> {
  const net = new FakeNet('mesh');
  const random = scriptedRandom([0, 0.5]);

  const build = async (deviceId: string, entities: { role: string }[], isHost: boolean): Promise<Device> => {
    const transport = new FakeTransport(net, deviceId);
    const session = new Session(transport, { mode: MODE, deviceId, roles: ODD_ONE_OUT_ROLES, entities });
    await session.initialize();
    if (isHost) await session.host();
    else {
      await session.join('ROOM01');
      transport.fireConnected(net.hostId!);
    }
    return { session, transport, director: new OddOneOutDirector(session, { random }), channelsSeen: [] };
  };

  // The host is both the referee and a player — two entities, one tab.
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

describe('Odd One Out — registry', () => {
  it('gives the host an admin and a player entity, and each guest a player', async () => {
    const { host, guests } = await makeGame();

    expect(host.session.localEntities.map((e) => e.entityId)).toEqual(['admin-0', 'player-0']);
    expect(host.director.isAdmin).toBe(true);
    expect(host.director.playerId).toBe('player-0');
    expect(guests.map((p) => p.director.playerId)).toEqual(['player-1', 'player-2']);
    expect(guests[0].director.isAdmin).toBe(false);
  });
});

describe('Odd One Out — a round', () => {
  it('tells each player only their own secret, and the odd one out no word', async () => {
    const { host, guests } = await makeGame();

    host.director.startRound();

    const secrets = [host, ...guests].map((device) => device.director.secret as SecretView);
    expect(secrets.map((s) => s.oddOneOut)).toEqual([false, true, false]);
    expect(secrets[0].word).toBe('Beach');
    expect(secrets[2].word).toBe('Beach');
    // The whole game: the odd one out is never sent the word at all.
    expect(secrets[1].word).toBeNull();
  });

  it('never routes a secret to another player\'s device, including the host\'s admin', async () => {
    const { host, guests } = await makeGame();

    host.director.startRound();

    // The host's player receives its own secret; the admin that dealt it does not.
    // Public is delivered in local-entity order: admin first, then player.
    expect(host.channelsSeen).toEqual([
      'player-0:secret:player-0', 'admin-0:public', 'player-0:public'
    ]);
    expect(guests[0].channelsSeen).toEqual(['player-1:secret:player-1', 'player-1:public']);
    expect(guests[1].channelsSeen).toEqual(['player-2:secret:player-2', 'player-2:public']);
  });

  it('keeps the word off the public channel until the reveal', async () => {
    const { host, guests } = await makeGame();

    host.director.startRound();
    const duringVoting = guests[0].director.publicView;
    expect(duringVoting.phase).toBe('voting');
    expect(duringVoting.word).toBeUndefined();
    expect(duringVoting.oddOneOut).toBeUndefined();

    host.director.vote('player-1');
    guests[0].director.vote('player-2');
    expect(guests[0].director.publicView.phase).toBe('voting');

    guests[1].director.vote('player-1');

    const revealed: PublicView = guests[0].director.publicView;
    expect(revealed.phase).toBe('reveal');
    expect(revealed.word).toBe('Beach');
    expect(revealed.oddOneOut).toBe('player-1');
    expect(revealed.votes).toEqual({
      'player-0': 'player-1', 'player-1': 'player-2', 'player-2': 'player-1'
    });
  });

  it('shows every device the same public view', async () => {
    const { host, guests } = await makeGame();
    host.director.startRound();

    expect(host.director.publicView).toEqual(guests[0].director.publicView);
    expect(guests[0].director.publicView).toEqual(guests[1].director.publicView);
  });
});

describe('Odd One Out — permissions', () => {
  it('will not let a guest start a round or write the public view', async () => {
    const { guests } = await makeGame();

    expect(() => guests[0].director.startRound()).toThrow(/Only the admin/);
    expect(() => guests[0].session.actAs('player-1').write('public', { phase: 'reveal' }))
      .toThrow(/may not write/);
  });

  it('will not let the host\'s player write the public view, though it shares the admin\'s device', async () => {
    const { host } = await makeGame();

    expect(host.session.actAs('player-0').canWrite('public')).toBe(false);
    expect(() => host.session.actAs('player-0').write('public', {})).toThrow(/may not write/);
  });

  it('refuses a vote from a player impersonating another', async () => {
    const { guests } = await makeGame();

    // `vote:{self}` binds to the writer, so player-1 simply has no permission
    // to write player-2's vote channel.
    expect(() => guests[0].session.actAs('player-1').write('vote:player-2', { target: 'player-0' }))
      .toThrow(/may not write/);
  });

  it('needs a minimum number of players', async () => {
    const { host } = await makeGame(2);
    expect(() => host.director.startRound()).toThrow(/at least 3/);
  });
});
