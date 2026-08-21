import { Session } from '../../src/session/Session';
import { SessionMode } from '../../src/session/SessionTypes';
import { FakeNet, FakeTransport } from '../helpers/fake-network';
import {
  splitScore,
  WOULD_YOU_RATHER_ROLES,
  WouldYouRatherDirector
} from '../../examples/would-you-rather/WouldYouRatherDirector';

/**
 * Drives the demo across real Sessions over the fake star. The claims worth
 * testing here are the two the game is built on: that the tally reaches the
 * asking seat and nowhere else, and that the asking seat can move between
 * devices without the hub moving with it.
 */

const MODE: SessionMode = { connectivity: 'star', authority: 'authoritative' };

interface Device {
  session: Session;
  director: WouldYouRatherDirector;
  transport: FakeTransport;
  /** Every channel this device received anything on, for leak assertions. */
  channelsSeen: string[];
}

class Party {
  readonly net = new FakeNet('star');
  readonly devices: Device[] = [];

  get hub(): Device {
    return this.devices[0];
  }

  async host(): Promise<Device> {
    return this.add('hub', [{ role: 'admin' }, { role: 'guest' }], true);
  }

  /** A phone scanning the QR — at the start of the evening or halfway through. */
  async join(name: string): Promise<Device> {
    return this.add(name, [{ role: 'guest' }], false);
  }

  private async add(deviceId: string, entities: { role: string }[], isHub: boolean): Promise<Device> {
    const transport = new FakeTransport(this.net, deviceId);
    const session = new Session(transport, { mode: MODE, deviceId, roles: WOULD_YOU_RATHER_ROLES, entities });
    const device: Device = {
      session,
      transport,
      director: new WouldYouRatherDirector(session),
      channelsSeen: []
    };
    // Attach on the registry, exactly as the page does: a joiner does not know
    // its own entity id before then, and the state it needs is published
    // immediately behind the registry that admitted it.
    let attached = false;
    session.onRegistry(() => {
      if (attached || !session.localEntityOfRole('guest')) return;
      attached = true;
      device.director.attach();
      for (const entity of session.localEntities) {
        session.actAs(entity.entityId).on('*', (_payload, meta) =>
          device.channelsSeen.push(`${entity.entityId}:${meta.channel}`));
      }
    });

    await session.initialize();
    if (isHub) await session.host();
    else {
      await session.join('ROOM01');
      transport.fireConnected(this.net.hostId!);
    }
    this.devices.push(device);
    return device;
  }
}

async function makeParty(guestCount: number): Promise<{ party: Party; hub: Device; guests: Device[] }> {
  const party = new Party();
  const hub = await party.host();
  const guests: Device[] = [];
  for (let index = 1; index <= guestCount; index += 1) guests.push(await party.join(`phone-${index}`));
  return { party, hub, guests };
}

describe('Would You Rather — the room', () => {
  it('gives the hub an admin and a seat, and seats it as the first asker', async () => {
    const { hub, guests } = await makeParty(2);

    expect(hub.session.localEntities.map((entity) => entity.entityId)).toEqual(['admin-0', 'guest-0']);
    expect(hub.director.isHub).toBe(true);
    expect(hub.director.isAsker).toBe(true);
    expect(guests.map((guest) => guest.director.isAsker)).toEqual([false, false]);
    expect(guests[0].director.publicView.asker).toBe('guest-0');
  });

  it('calls a guest who typed nothing Guest 3, and one who did by their name', async () => {
    const { hub, guests } = await makeParty(2);

    guests[0].director.setName('  Ada  ');

    expect(hub.director.publicView.guests.map((guest) => guest.name))
      .toEqual(['Guest 1', 'Ada', 'Guest 3']);
    // An empty name is a way back to the default, not a way to have no name.
    guests[0].director.setName('');
    expect(hub.director.publicView.guests[1].name).toBe('Guest 2');
  });
});

describe('Would You Rather — answering', () => {
  it('tallies the room for the asker and tells nobody else the counts', async () => {
    const { hub, guests } = await makeParty(3);

    guests[0].director.answer('first');
    guests[1].director.answer('second');
    guests[2].director.answer('first');

    expect(hub.director.tally).toMatchObject({ first: 2, second: 1, answered: 3, eligible: 3 });
    // The whole reason the counts are on `tally:{self}`: a guest that could see
    // the split while answering would just join the winning side.
    expect(guests.map((guest) => guest.director.tally)).toEqual([null, null, null]);
    for (const guest of guests) {
      expect(guest.channelsSeen.some((entry) => entry.includes('tally:'))).toBe(false);
    }
  });

  it('shows every phone who has answered without showing what they answered', async () => {
    const { guests } = await makeParty(3);

    guests[0].director.answer('first');

    const seenByAnother = guests[1].director.publicView.guests;
    expect(seenByAnother.map((guest) => guest.answered)).toEqual([false, true, false, false]);
    expect(JSON.stringify(seenByAnother)).not.toContain('first');
  });

  it('ignores an answer from the asker, who is asking rather than voting', async () => {
    const { hub } = await makeParty(2);

    hub.director.answer('first');

    expect(hub.director.tally).toMatchObject({ first: 0, second: 0, answered: 0, eligible: 2 });
  });

  it('drops a tap that was aimed at the previous question', async () => {
    const { hub, guests } = await makeParty(2);
    const stale = guests[0].director.publicView.round;

    hub.director.askNewQuestion();
    // The guest's device still believes it is answering the old question.
    guests[0].session.actAs('guest-1').write('intent:{self}', { kind: 'answer', round: stale, choice: 'first' });

    expect(hub.director.tally).toMatchObject({ answered: 0 });
  });

  it('lets a guest change their mind without double-counting them', async () => {
    const { hub, guests } = await makeParty(2);

    guests[0].director.answer('first');
    guests[0].director.answer('second');

    expect(hub.director.tally).toMatchObject({ first: 0, second: 1, answered: 1 });
  });

  it('scores a dead split at 100 and a landslide at 0', async () => {
    expect(splitScore(3, 3)).toBe(100);
    expect(splitScore(4, 0)).toBe(0);
    expect(splitScore(0, 0)).toBe(0);
    expect(splitScore(3, 1)).toBe(50);
  });

  it('clears the answers when the asker moves on, and keeps their best split', async () => {
    const { hub, guests } = await makeParty(2);

    guests[0].director.answer('first');
    guests[1].director.answer('second');
    expect(hub.director.tally).toMatchObject({ split: 100 });

    hub.director.askNewQuestion();

    expect(hub.director.tally).toMatchObject({ round: 2, first: 0, second: 0, best: 100 });
    expect(guests[0].director.publicView.guests.every((guest) => !guest.answered)).toBe(true);
  });
});

describe('Would You Rather — passing the seat', () => {
  it('moves the asking seat and the tally with it, leaving the hub where it is', async () => {
    const { hub, guests } = await makeParty(2);

    hub.director.passSeat('guest-1');

    expect(guests[0].director.isAsker).toBe(true);
    expect(hub.director.isAsker).toBe(false);
    // The seat moved; the routing did not. The hub is still the only device
    // everyone is connected to, and still the one that reduces.
    expect(hub.director.isHub).toBe(true);
    expect(guests[0].director.isHub).toBe(false);

    hub.director.answer('first');
    guests[1].director.answer('second');

    expect(guests[0].director.tally).toMatchObject({ first: 1, second: 1, eligible: 2 });
    expect(hub.director.tally).toBeNull();
  });

  it('refuses a pass or a new question from anyone but the asker', async () => {
    const { hub, guests } = await makeParty(2);

    guests[0].session.actAs('guest-1').write('intent:{self}', { kind: 'pass', to: 'guest-1' });
    guests[0].session.actAs('guest-1').write('intent:{self}', { kind: 'next' });

    expect(hub.director.publicView.asker).toBe('guest-0');
    expect(hub.director.publicView.round).toBe(1);
  });

  it('refuses a pass to somebody who is not in the room', async () => {
    const { hub } = await makeParty(1);

    hub.director.passSeat('guest-7');

    expect(hub.director.publicView.asker).toBe('guest-0');
  });

  it('lets the hub take the seat back when the asker has gone quiet', async () => {
    const { hub, guests } = await makeParty(2);
    hub.director.passSeat('guest-1');

    // guest-1's phone is now face down in a coat pocket, and only the asker may
    // pass the seat — so the hub, which reduces, takes it.
    hub.director.takeSeat();

    expect(hub.director.isAsker).toBe(true);
    expect(guests[0].director.isAsker).toBe(false);
    expect(guests[0].director.tally).toBeNull();
  });
});

describe('Would You Rather — arriving late', () => {
  it('catches up a phone that joins mid-game, and lets it answer', async () => {
    const { party, hub, guests } = await makeParty(2);
    hub.director.passSeat('guest-1');
    guests[1].director.answer('first');

    const latecomer = await party.join('phone-late');

    // No lock() anywhere in this game, so admission is still open — and the
    // republish on registry change is what leaves the new phone caught up
    // rather than staring at an empty screen until the next question.
    expect(latecomer.director.guestId).toBe('guest-3');
    expect(latecomer.director.publicView).toMatchObject({ round: 2, asker: 'guest-1' });
    expect(latecomer.director.publicView.guests.map((guest) => guest.name))
      .toEqual(['Guest 1', 'Guest 2', 'Guest 3', 'Guest 4']);

    latecomer.director.answer('second');

    expect(guests[0].director.tally).toMatchObject({ first: 1, second: 1, eligible: 3 });
  });

  it("keeps the hub's signaling socket, which is what a latecomer needs", async () => {
    const { party, hub, guests } = await makeParty(1);

    expect(hub.transport.signalingOpen).toBe(true);
    expect(guests[0].transport.signalingOpen).toBe(true);
    expect(hub.session.locked).toBe(false);
    await party.join('phone-late');
    expect(hub.transport.signalingOpen).toBe(true);
  });
});
