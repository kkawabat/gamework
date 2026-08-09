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
 * Drives the demo across four real Sessions over the fake mesh. This is the
 * check that the model actually withholds what it claims to: no browser is
 * involved, so the assertions are about routing rather than about what a UI
 * chose to draw.
 */

const MODE: SessionMode = { connectivity: 'star', authority: 'authoritative' };

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

async function makeGame(playerCount = 3): Promise<{ pc: Device; phones: Device[] }> {
  const net = new FakeNet('star');
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

  // The PC is both the referee and the shared screen — two entities, one tab.
  const pc = await build('pc', [{ role: 'admin' }, { role: 'table' }], true);
  const phones: Device[] = [];
  for (let index = 0; index < playerCount; index += 1) {
    phones.push(await build(`phone-${index}`, [{ role: 'player' }], false));
  }

  for (const device of [pc, ...phones]) {
    device.director.attach();
    for (const entity of device.session.localEntities) {
      device.session.actAs(entity.entityId).on('*', (_payload, meta) =>
        device.channelsSeen.push(`${entity.entityId}:${meta.channel}`));
    }
  }

  return { pc, phones };
}

describe('Odd One Out — registry', () => {
  it('gives the PC an admin and a table entity, and each phone a player', async () => {
    const { pc, phones } = await makeGame();

    expect(pc.session.localEntities.map((e) => e.entityId)).toEqual(['admin-0', 'table-0']);
    expect(pc.director.isAdmin).toBe(true);
    expect(phones.map((p) => p.director.playerId)).toEqual(['player-0', 'player-1', 'player-2']);
    expect(phones[0].director.isAdmin).toBe(false);
  });
});

describe('Odd One Out — a round', () => {
  it('tells each player only their own secret, and the odd one out no word', async () => {
    const { pc, phones } = await makeGame();

    pc.director.startRound();

    const secrets = phones.map((phone) => phone.director.secret as SecretView);
    expect(secrets.map((s) => s.oddOneOut)).toEqual([false, true, false]);
    expect(secrets[0].word).toBe('Beach');
    expect(secrets[2].word).toBe('Beach');
    // The whole game: the odd one out is never sent the word at all.
    expect(secrets[1].word).toBeNull();
  });

  it('never routes a secret to another player\'s device or to the shared screen', async () => {
    const { pc, phones } = await makeGame();

    pc.director.startRound();

    expect(phones[0].channelsSeen).toEqual(['player-0:secret:player-0', 'player-0:public']);
    expect(phones[1].channelsSeen).toEqual(['player-1:secret:player-1', 'player-1:public']);
    // The table shares a browser tab with the admin that just dealt the
    // secrets, and still receives none of them.
    expect(pc.channelsSeen).toEqual(['admin-0:public', 'table-0:public']);
  });

  it('keeps the word off the public channel until the reveal', async () => {
    const { pc, phones } = await makeGame();

    pc.director.startRound();
    const duringVoting = phones[0].director.publicView;
    expect(duringVoting.phase).toBe('voting');
    expect(duringVoting.word).toBeUndefined();
    expect(duringVoting.oddOneOut).toBeUndefined();

    phones[0].director.vote('player-1');
    phones[1].director.vote('player-2');
    expect(phones[0].director.publicView.phase).toBe('voting');

    phones[2].director.vote('player-1');

    const revealed: PublicView = phones[0].director.publicView;
    expect(revealed.phase).toBe('reveal');
    expect(revealed.word).toBe('Beach');
    expect(revealed.oddOneOut).toBe('player-1');
    expect(revealed.votes).toEqual({
      'player-0': 'player-1', 'player-1': 'player-2', 'player-2': 'player-1'
    });
  });

  it('shows the shared screen the same public view the phones get', async () => {
    const { pc, phones } = await makeGame();
    pc.director.startRound();

    expect(pc.director.publicView).toEqual(phones[0].director.publicView);
  });
});

describe('Odd One Out — permissions', () => {
  it('will not let a player start a round or write the public view', async () => {
    const { phones } = await makeGame();

    expect(() => phones[0].director.startRound()).toThrow(/Only the admin/);
    expect(() => phones[0].session.actAs('player-0').write('public', { phase: 'reveal' }))
      .toThrow(/may not write/);
  });

  it('will not let the shared screen write anything, though it shares the admin\'s device', async () => {
    const { pc } = await makeGame();

    expect(pc.session.actAs('table-0').canWrite('public')).toBe(false);
    expect(() => pc.session.actAs('table-0').write('public', {})).toThrow(/may not write/);
  });

  it('refuses a vote from a player impersonating another', async () => {
    const { phones } = await makeGame();

    // `vote:{self}` binds to the writer, so player-0 simply has no permission
    // to write player-1's vote channel.
    expect(() => phones[0].session.actAs('player-0').write('vote:player-1', { target: 'player-2' }))
      .toThrow(/may not write/);
  });

  it('needs a minimum number of players', async () => {
    const { pc } = await makeGame(2);
    expect(() => pc.director.startRound()).toThrow(/at least 3/);
  });
});
