import { Session } from '../../src/session/Session';
import { SessionMode } from '../../src/session/SessionTypes';
import { FakeNet, FakeTransport } from '../helpers/fake-network';
import {
  BALL,
  FIELD,
  PADDLE,
  PONG_ROLES,
  PongDirector,
  WIN_SCORE
} from '../../examples/pong/PongDirector';

/**
 * Drives both phones across real sessions. The physics is the referee's alone,
 * so these assertions are also the check that the guest is genuinely a client:
 * it never simulates, it is told.
 */

const MODE: SessionMode = { connectivity: 'mesh', authority: 'authoritative' };

interface Phone {
  session: Session;
  director: PongDirector;
  net: FakeNet;
}

/** random() = 0.5 serves straight up the middle, which keeps rallies testable. */
async function makeMatch(random: () => number = () => 0.5): Promise<{ host: Phone; guest: Phone }> {
  const net = new FakeNet('mesh');

  const build = async (deviceId: string, entities: { role: string }[], isHost: boolean): Promise<Phone> => {
    const transport = new FakeTransport(net, deviceId);
    const session = new Session(transport, { mode: MODE, deviceId, roles: PONG_ROLES, entities,
      maxEntities: { referee: 1, player: 2 }, unreliable: ['state', 'paddle:*'] });
    await session.initialize();
    if (isHost) await session.host();
    else {
      await session.join('ROOM01');
      transport.fireConnected(net.hostId!);
    }
    return { session, director: new PongDirector(session, { random }), net };
  };

  const host = await build('host-phone', [{ role: 'referee' }, { role: 'player' }], true);
  const guest = await build('guest-phone', [{ role: 'player' }], false);
  host.director.attach();
  guest.director.attach();
  return { host, guest };
}

/** Run the referee's clock for `seconds`, in frames, as the render loop would. */
const run = (host: Phone, seconds: number, fps = 60): void => {
  const dt = 1 / fps;
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) host.director.step(dt);
};

/** Step until `done`, so timing assertions do not depend on a guessed duration. */
const runUntil = (host: Phone, done: () => boolean, maxSeconds = 60, fps = 60): boolean => {
  const dt = 1 / fps;
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += dt) {
    host.director.step(dt);
    if (done()) return true;
  }
  return false;
};

const startRally = (host: Phone, guest: Phone): void => {
  host.director.setReady();
  guest.director.setReady();
  run(host, 3.1); // clear the countdown
};

describe('Pong — setup', () => {
  it('gives the host the referee and a paddle, and the guest only a paddle', async () => {
    const { host, guest } = await makeMatch();

    expect(host.director.isReferee).toBe(true);
    expect(host.director.myId).toBe('player-0');
    expect(guest.director.isReferee).toBe(false);
    expect(guest.director.myId).toBe('player-1');
  });

  it('starts only once both players are ready', async () => {
    const { host, guest } = await makeMatch();

    host.director.setReady();
    expect(host.director.state.phase).toBe('lobby');

    guest.director.setReady();
    expect(host.director.state.phase).toBe('countdown');
    // The host defends the bottom because it was admitted first.
    expect(host.director.state.players).toEqual(['player-0', 'player-1']);
    expect(host.director.myIndex).toBe(0);
    expect(guest.director.myIndex).toBe(1);
  });

  it('publishes the referee\'s state to the guest', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    expect(guest.director.state.phase).toBe('playing');
    expect(guest.director.state.scores).toEqual({ 'player-0': 0, 'player-1': 0 });

    // The guest's ball is deliberately not identical: the referee simulates at
    // 60Hz and publishes at 30, so the copy trails by up to one publish plus a
    // frame. That is the design, not drift — bounded by how far the ball can
    // travel in that time.
    const maxLag = BALL.maxSpeed * (1 / 30 + 1 / 60);
    expect(Math.abs(guest.director.state.ball.y - host.director.state.ball.y)).toBeLessThan(maxLag);
    expect(guest.director.state.ball.x).toBeCloseTo(host.director.state.ball.x, 3);
  });
});

describe('Pong — play', () => {
  it('rallies off both paddles without conceding', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    // Straight serve, both paddles centred: the ball should survive several
    // round trips of the field.
    run(host, 6);

    expect(host.director.state.scores).toEqual({ 'player-0': 0, 'player-1': 0 });
    expect(host.director.state.phase).toBe('playing');
    expect(host.director.state.ball.y).toBeGreaterThan(PADDLE.inset);
    expect(host.director.state.ball.y).toBeLessThan(FIELD.height - PADDLE.inset);
  });

  it('speeds the ball up as the rally goes on', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    const sample = (): number => {
      const before = { ...host.director.state.ball };
      host.director.step(1 / 60);
      return Math.hypot(host.director.state.ball.x - before.x, host.director.state.ball.y - before.y);
    };

    const opening = sample();
    run(host, 6);
    expect(sample()).toBeGreaterThan(opening);
  });

  it('awards a point when a paddle is out of position', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    // The guest steers its paddle into the corner; the referee learns of it
    // over the wire, and the ball goes past.
    guest.session.actAs('player-1').write('paddle:{self}', { x: PADDLE.width / 2 });
    const scored = runUntil(host, () => host.director.state.scores['player-0'] === 1);

    expect(scored).toBe(true);
    expect(host.director.state.scores['player-1']).toBe(0);
    // A concession restarts with a countdown, serving to whoever was beaten.
    expect(host.director.state.phase).toBe('countdown');
    expect(guest.director.state.scores['player-0']).toBe(1);
  });

  it('ends the match at the winning score', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);
    guest.session.actAs('player-1').write('paddle:{self}', { x: PADDLE.width / 2 });
    const finished = runUntil(host, () => host.director.state.phase === 'over', 120);

    expect(finished).toBe(true);
    expect(host.director.state.winner).toBe('player-0');
    expect(host.director.state.scores['player-0']).toBe(WIN_SCORE);
    expect(guest.director.state.winner).toBe('player-0');
  });

  it('keeps the ball inside the side walls', async () => {
    const { host, guest } = await makeMatch(() => 0.95); // a wide, angled serve
    startRally(host, guest);

    for (let frame = 0; frame < 600; frame += 1) {
      host.director.step(1 / 60);
      expect(host.director.state.ball.x).toBeGreaterThanOrEqual(BALL.radius - 1e-6);
      expect(host.director.state.ball.x).toBeLessThanOrEqual(FIELD.width - BALL.radius + 1e-6);
    }
  });
});

describe('Pong — local paddle', () => {
  it('moves the local paddle immediately, without waiting for the referee', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    const before = guest.director.myPaddle;
    guest.director.steer(-1, 0.1);

    // The guest's own paddle has already moved on its own screen...
    expect(guest.director.myPaddle).toBeLessThan(before);
    // ...and the referee is told separately.
    expect(host.director.state.paddles['player-1']).toBeCloseTo(guest.director.myPaddle, 5);
  });

  it('keeps the paddle inside the field', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    guest.director.steer(-1, 10);
    expect(guest.director.myPaddle).toBeCloseTo(PADDLE.width / 2, 5);
    guest.director.steer(1, 10);
    expect(guest.director.myPaddle).toBeCloseTo(FIELD.width - PADDLE.width / 2, 5);
  });
});

describe('Pong — permissions', () => {
  it('will not let a player author the game state', async () => {
    const { guest } = await makeMatch();
    expect(() => guest.session.actAs('player-1').write('state', { phase: 'over' }))
      .toThrow(/may not write/);
  });

  it('will not let a player move the opponent\'s paddle', async () => {
    const { guest } = await makeMatch();
    expect(() => guest.session.actAs('player-1').write('paddle:player-0', { x: 0.9 }))
      .toThrow(/may not write/);
  });

  it('gives the guest no referee to simulate with', async () => {
    const { guest } = await makeMatch();
    const before = { ...guest.director.state.ball };
    guest.director.step(1);
    expect(guest.director.state.ball).toEqual(before);
  });
});

describe('Pong — transport', () => {
  it('streams state and paddles unreliably, but readies reliably', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);
    guest.director.steer(-1, 0.1);

    const net = host.net;
    // Losing one of these costs a frame; the next absolute value supersedes it.
    expect(net.deliveriesFor('state').length).toBeGreaterThan(0);
    expect(net.deliveriesFor('state').every((d) => d === 'unreliable')).toBe(true);
    expect(net.deliveriesFor('paddle:player-1').every((d) => d === 'unreliable')).toBe(true);

    // Losing this would hang the lobby forever: it is written once and nothing
    // retries it.
    expect(net.deliveriesFor('ready:player-1')).toEqual(['reliable']);
    expect(net.deliveriesFor('registry').every((d) => d === 'reliable')).toBe(true);
  });

  it('repeats a stationary paddle so a lost final write cannot strand it', async () => {
    const { host, guest } = await makeMatch();
    startRally(host, guest);

    guest.director.steer(-1, 0.2);          // move, then stop
    const afterMove = host.net.deliveriesFor('paddle:player-1').length;
    for (let i = 0; i < 60; i += 1) guest.director.steer(0, 1 / 60); // one second still

    expect(host.net.deliveriesFor('paddle:player-1').length).toBeGreaterThan(afterMove);
  });
});
