import { Session, SessionTransport, WebRTCNetworkEngine } from '../../src';
import { Entity, EntitySpec, Role, SessionMode } from '../../src/session/SessionTypes';
import { FakeNet, FakeTransport } from '../helpers/fake-network';

// A role table exercising every shape: a read-only shared display, a player
// with a private channel bound to itself, an admin with control rights the
// player deliberately lacks, and a wildcard reader.
const TABLE: Role = { name: 'table', reads: ['public'], writes: [] };
const PLAYER: Role = {
  name: 'player',
  reads: ['public', 'hand:{self}', 'chat'],
  writes: ['move', 'chat', 'intent:{self}']
};
const ADMIN: Role = {
  name: 'admin',
  reads: ['public', 'move', 'intent:*'],
  writes: ['public', 'hand:*', 'control']
};
const DM: Role = { name: 'dm', reads: ['public', 'hand:*'], writes: ['public'] };
const ROLES = [TABLE, PLAYER, ADMIN, DM];

interface Received {
  entity: string;
  channel: string;
  payload: unknown;
  author: string;
}

interface Member {
  session: Session;
  transport: FakeTransport;
  received: Received[];
}

const netOf = (member: Member): FakeNet => member.transport.net;

async function makeRoom(
  mode: SessionMode,
  members: EntitySpec[][],
  maxEntities?: Record<string, number>,
  unreliable?: string[]
): Promise<Member[]> {
  const net = new FakeNet(mode.connectivity);
  const built: Member[] = [];

  for (const [index, entities] of members.entries()) {
    const deviceId = `dev-${index}`;
    const transport = new FakeTransport(net, deviceId);
    const session = new Session(transport, { mode, deviceId, roles: ROLES, entities, maxEntities, unreliable });
    await session.initialize();
    if (index === 0) await session.host();
    else {
      await session.join('ROOM01');
      transport.fireConnected(net.hostId!);
    }
    built.push({ session, transport, received: [] });
  }

  // Subscribe after the registry has landed: a joiner does not know its own
  // entity ids until the host has assigned them.
  for (const member of built) {
    for (const entity of member.session.localEntities) {
      member.session.actAs(entity.entityId).on('*', (payload, meta) =>
        member.received.push({
          entity: entity.entityId, channel: meta.channel, payload, author: meta.author
        }));
    }
  }

  return built;
}

const reset = (members: Member[]): void => members.forEach((m) => { m.received = []; });
const ids = (entities: Entity[]): string[] => entities.map((e) => e.entityId);

describe('Session — registry', () => {
  it('admits the host, then each joiner, numbering ids per role', async () => {
    const [host, a, b] = await makeRoom({ connectivity: 'mesh', authority: 'replicated' },
      [[{ role: 'player' }], [{ role: 'player' }], [{ role: 'player' }]]);

    expect(ids(host.session.entities)).toEqual(['player-0', 'player-1', 'player-2']);
    expect(ids(a.session.entities)).toEqual(ids(host.session.entities));
    expect(a.session.localEntityOfRole('player')?.entityId).toBe('player-1');
    expect(b.session.localEntityOfRole('player')?.entityId).toBe('player-2');
  });

  it('lets one device hold several entities with different roles', async () => {
    const [host] = await makeRoom({ connectivity: 'star', authority: 'authoritative' },
      [[{ role: 'admin' }, { role: 'table' }, { role: 'player' }], [{ role: 'player' }]]);

    expect(ids(host.session.localEntities)).toEqual(['admin-0', 'table-0', 'player-0']);
    // Each numbering is per role, so the joiner's player is still player-1.
    expect(ids(host.session.entitiesOfRole('player'))).toEqual(['player-0', 'player-1']);
  });

  it('caps entities per role, admitting the rest of the device regardless', async () => {
    const [host] = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }, { role: 'player' }], [{ role: 'player' }], [{ role: 'table' }, { role: 'player' }]],
      { player: 2 });

    expect(ids(host.session.entitiesOfRole('player'))).toEqual(['player-0', 'player-1']);
    // dev-2's player was over the cap; its table entity still got in.
    expect(ids(host.session.entitiesOfRole('table'))).toEqual(['table-0']);
  });
});

describe('Session — permissions', () => {
  it('separates the permissions of two entities on the same device', async () => {
    const [host] = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }, { role: 'player' }], [{ role: 'player' }]]);

    const admin = host.session.actAs('admin-0');
    const player = host.session.actAs('player-0');

    expect(admin.canWrite('control')).toBe(true);
    // The whole point: sharing a device grants the player nothing.
    expect(player.canWrite('control')).toBe(false);
    expect(() => player.write('control', { start: true })).toThrow(/may not write/);
  });

  it('binds {self} so a player cannot read another player\'s private channel', async () => {
    const [, a, b] = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }], [{ role: 'player' }], [{ role: 'player' }]]);

    expect(a.session.actAs('player-0').canRead('hand:player-0')).toBe(true);
    expect(a.session.actAs('player-0').canRead('hand:player-1')).toBe(false);
    expect(b.session.actAs('player-1').canRead('hand:player-1')).toBe(true);
  });

  it('refuses a write the role does not permit', async () => {
    const [host] = await makeRoom({ connectivity: 'mesh', authority: 'replicated' },
      [[{ role: 'table' }], [{ role: 'player' }]]);

    expect(() => host.session.actAs('table-0').write('public', {})).toThrow(/may not write/);
  });
});

describe('Session — channel delivery', () => {
  it('delivers only to entities whose role reads the channel', async () => {
    const members = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }, { role: 'table' }], [{ role: 'player' }], [{ role: 'player' }]]);
    reset(members);

    members[1].session.actAs('player-1').write('move', { column: 3 });

    // admin reads 'move'; table and the other player do not.
    expect(members[0].received).toEqual([
      { entity: 'admin-0', channel: 'move', payload: { column: 3 }, author: 'player-1' }
    ]);
    expect(members[2].received).toEqual([]);
    // The writer reads nothing on 'move' either, so no loopback here.
    expect(members[1].received).toEqual([]);
  });

  it('loops back to the writer\'s own entities that read the channel', async () => {
    const members = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }, { role: 'table' }], [{ role: 'player' }]]);
    reset(members);

    members[0].session.actAs('admin-0').write('public', { phase: 'deal' });

    // admin and table both read 'public', and both are on the host device.
    expect(members[0].received.map((r) => r.entity).sort()).toEqual(['admin-0', 'table-0']);
    expect(members[1].received).toEqual([
      { entity: 'player-0', channel: 'public', payload: { phase: 'deal' }, author: 'admin-0' }
    ]);
  });

  it('sends a private channel to exactly one entity', async () => {
    const members = await makeRoom({ connectivity: 'star', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }], [{ role: 'player' }]]);
    reset(members);

    members[0].session.actAs('admin-0').write('hand:player-1', { cards: ['As', 'Kd'] });

    expect(members[2].received).toEqual([
      { entity: 'player-1', channel: 'hand:player-1', payload: { cards: ['As', 'Kd'] }, author: 'admin-0' }
    ]);
    expect(members[1].received).toEqual([]);
    expect(members[0].received).toEqual([]);
  });

  it('gives a wildcard reader every instance of the channel', async () => {
    const members = await makeRoom({ connectivity: 'mesh', authority: 'authoritative' },
      [[{ role: 'admin' }, { role: 'dm' }], [{ role: 'player' }]]);
    reset(members);

    members[0].session.actAs('admin-0').write('hand:player-0', { cards: ['7c'] });

    expect(members[0].received).toEqual([
      { entity: 'dm-0', channel: 'hand:player-0', payload: { cards: ['7c'] }, author: 'admin-0' }
    ]);
    expect(members[1].received).toHaveLength(1);
  });
});

describe('Session — star routing', () => {
  it('relays between spokes, which have no path to each other', async () => {
    const members = await makeRoom({ connectivity: 'star', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }], [{ role: 'player' }]]);
    reset(members);

    members[1].session.actAs('player-1').write('chat', { text: 'hi' });

    // The hub reads neither 'chat' nor anything else here — it forwards anyway,
    // because being the only path is a transport fact, not a permission.
    expect(members[2].received).toEqual([
      { entity: 'player-1', channel: 'chat', payload: { text: 'hi' }, author: 'player-1' }
    ]);
    expect(members[0].received).toEqual([]);
  });

  it('still reaches the hub when the hub is the only reader', async () => {
    const members = await makeRoom({ connectivity: 'star', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }]]);
    reset(members);

    // The host brought no player, so the joiner's is player-0: ids number per
    // role, not per device.
    members[1].session.actAs('player-0').write('intent:{self}', { action: 'fold' });

    expect(members[0].received).toEqual([
      { entity: 'admin-0', channel: 'intent:player-0', payload: { action: 'fold' }, author: 'player-0' }
    ]);
  });
});

describe('Session — lock', () => {
  it('drops signaling everywhere under mesh', async () => {
    const [host, joiner] = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }], [{ role: 'player' }]]);

    host.session.lock();
    joiner.session.lock();

    expect(host.transport.signalingOpen).toBe(false);
    expect(joiner.transport.signalingOpen).toBe(false);
    expect(joiner.session.locked).toBe(true);
  });

  it('keeps the hub reachable under star so a late joiner still has someone to dial', async () => {
    const [host, joiner] = await makeRoom({ connectivity: 'star', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }]]);

    host.session.lock();
    joiner.session.lock();

    expect(host.transport.signalingOpen).toBe(true);
    expect(joiner.transport.signalingOpen).toBe(false);
  });

  it('admits nobody once locked', async () => {
    const mode: SessionMode = { connectivity: 'star', authority: 'authoritative' };
    const members = await makeRoom(mode, [[{ role: 'admin' }], [{ role: 'player' }]]);
    const [host] = members;
    host.session.lock();

    const lateTransport = new FakeTransport(host.transport.net, 'dev-late');
    const late = new Session(lateTransport, {
      mode, deviceId: 'dev-late', roles: ROLES, entities: [{ role: 'player' }]
    });
    await late.initialize();
    await late.join('ROOM01');
    lateTransport.fireConnected('dev-0');

    expect(host.session.entities).toHaveLength(2);
    expect(late.localEntities).toEqual([]);
  });
});

describe('Session — a device that comes back', () => {
  const mode: SessionMode = { connectivity: 'star', authority: 'authoritative' };

  /** A tab that reloaded: same device id, everything it was ever told gone. */
  const returning = async (net: FakeNet, deviceId: string): Promise<Session> => {
    const transport = new FakeTransport(net, deviceId);
    const session = new Session(transport, {
      mode, deviceId, roles: ROLES, entities: [{ role: 'player' }]
    });
    await session.initialize();
    await session.join('ROOM01');
    transport.fireConnected(net.hostId!);
    return session;
  };

  it('re-seats it on the entities it already had, rather than admitting a second device', async () => {
    const members = await makeRoom(mode, [[{ role: 'admin' }], [{ role: 'player' }], [{ role: 'player' }]]);
    const [host] = members;

    const back = await returning(netOf(host), 'dev-1');

    expect(host.session.entities).toHaveLength(3);
    expect(back.localEntities.map((entity) => entity.entityId)).toEqual(['player-0']);
  });

  it('re-sends the registry, since the returning device has lost the one it was given', async () => {
    const members = await makeRoom(mode, [[{ role: 'admin' }], [{ role: 'player' }]]);
    const [host] = members;

    const back = await returning(netOf(host), 'dev-1');

    expect(back.entities.map((entity) => entity.entityId)).toEqual(['admin-0', 'player-0']);
  });

  it('tells the host, so an authoritative game republishes what the returner missed', async () => {
    const members = await makeRoom(mode, [[{ role: 'admin' }], [{ role: 'player' }]]);
    const [host] = members;
    const republished: number[] = [];
    host.session.onRegistry(() => republished.push(host.session.entities.length));

    await returning(netOf(host), 'dev-1');

    expect(republished).toEqual([2]);
  });

  it('still turns away a device it has never seen once locked', async () => {
    const members = await makeRoom(mode, [[{ role: 'admin' }], [{ role: 'player' }]]);
    const [host] = members;
    host.session.lock();

    const back = await returning(netOf(host), 'dev-1');
    const stranger = await returning(netOf(host), 'dev-stranger');

    // Coming back is not admission, so the lock has no opinion about it; being
    // new is, and the lock is the whole of the opinion.
    expect(back.localEntities.map((entity) => entity.entityId)).toEqual(['player-0']);
    expect(stranger.localEntities).toEqual([]);
  });
});

describe('SessionTransport', () => {
  it('is satisfied by WebRTCNetworkEngine', () => {
    // Compile-time assertion: if the engine drifts from the interface the
    // session needs, this file stops building.
    const asTransport = (engine: WebRTCNetworkEngine): SessionTransport => engine;
    expect(typeof asTransport).toBe('function');
  });
});

describe('Session — delivery', () => {
  it('sends everything reliably by default', async () => {
    const members = await makeRoom({ connectivity: 'mesh', authority: 'arbitrated' },
      [[{ role: 'admin' }], [{ role: 'player' }]]);

    members[1].session.actAs('player-0').write('move', { x: 1 });
    expect(netOf(members[0]).deliveriesFor('move')).toEqual(['reliable']);
  });

  it('routes only the declared patterns to the unreliable channel', async () => {
    const members = await makeRoom({ connectivity: 'mesh', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }]], undefined, ['public']);

    members[0].session.actAs('admin-0').write('public', { tick: 1 });
    members[1].session.actAs('player-0').write('move', { x: 1 });

    expect(netOf(members[0]).deliveriesFor('public')).toEqual(['unreliable']);
    expect(netOf(members[0]).deliveriesFor('move')).toEqual(['reliable']);
  });

  it('never lets control messages become unreliable, whatever the patterns say', async () => {
    // '*' would match every channel if control went through the same decision.
    // hello and registry are one-shot and nothing retries them, so a lossy
    // channel would hang a device in the lobby with no error anywhere.
    const members = await makeRoom({ connectivity: 'mesh', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }]], undefined, ['*']);

    const net = netOf(members[0]);
    expect(net.deliveriesFor('hello')).toEqual(['reliable']);
    expect(net.deliveriesFor('registry').every((d) => d === 'reliable')).toBe(true);
    expect(net.deliveriesFor('registry').length).toBeGreaterThan(0);
  });

  it('relays a spoke write on the same transport it was declared for', async () => {
    const members = await makeRoom({ connectivity: 'star', authority: 'authoritative' },
      [[{ role: 'admin' }], [{ role: 'player' }], [{ role: 'player' }]], undefined, ['chat']);

    members[1].session.actAs('player-0').write('chat', { text: 'hi' });

    // One hop to the hub, one relayed hop onward — both unreliable.
    expect(netOf(members[0]).deliveriesFor('chat')).toEqual(['unreliable', 'unreliable']);
  });
});
