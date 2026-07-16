import { execFileSync } from 'child_process';
import { buildIceServers } from '../../server/server';

const SECRET = 'testsecret123';
const HOST = '34.83.0.1';
const NOW = 1_784_500_000_000; // fixed clock: the username embeds an expiry

/**
 * coturn verifies the credential by computing base64(hmac-sha1(secret, username))
 * itself. If our version ever drifts, coturn rejects every allocation and TURN
 * fails silently — so check against the canonical shell recipe from its docs
 * rather than against another copy of our own logic.
 */
const opensslHmac = (username: string): string =>
  execFileSync('sh', ['-c', `printf %s '${username}' | openssl dgst -sha1 -hmac '${SECRET}' -binary | base64`])
    .toString()
    .trim();

describe('buildIceServers', () => {
  it('mints a credential coturn will accept', () => {
    const [, turn] = buildIceServers({ playerId: 'player_abc', host: HOST, secret: SECRET, now: NOW });

    expect(turn.username).toBe('1784543200:player_abc'); // now + 12h TTL
    expect(turn.credential).toBe(opensslHmac(turn.username!));
  });

  it('offers a TCP relay alongside UDP for networks that block UDP', () => {
    const [, turn] = buildIceServers({ playerId: 'p', host: HOST, secret: SECRET, now: NOW });

    expect(turn.urls).toEqual([`turn:${HOST}:3478?transport=udp`, `turn:${HOST}:3478?transport=tcp`]);
  });

  it('ties the credential to the player, so one leak is not a shared key', () => {
    const [, a] = buildIceServers({ playerId: 'player_a', host: HOST, secret: SECRET, now: NOW });
    const [, b] = buildIceServers({ playerId: 'player_b', host: HOST, secret: SECRET, now: NOW });

    expect(a.credential).not.toBe(b.credential);
  });

  // Local dev has no relay; the demos must still work over loopback/LAN.
  it('falls back to STUN alone when no relay is configured', () => {
    const servers = buildIceServers({ playerId: 'p' });

    expect(servers).toHaveLength(1);
    expect(servers[0].urls.every((url) => url.startsWith('stun:'))).toBe(true);
    expect(servers[0].username).toBeUndefined();
  });
});
