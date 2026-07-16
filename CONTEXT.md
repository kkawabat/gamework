# GameWork

TypeScript framework for peer-to-peer browser board games, plus the demos at
games.kankawabata.com/gamework/. Games run entirely between players' browsers
over WebRTC data channels — there is no game server, no authoritative state, and
no game logic anywhere but the players' devices.

## Architecture

- **Framework:** TypeScript, no runtime framework; bundled per-demo by Vite
- **Transport:** WebRTC data channels (`src/engines/WebRTCNetworkEngine.ts`)
- **Signaling:** Node + `ws` on Cloud Run (`server/server.ts`), scaled to zero
- **TURN relay:** coturn on a GCE e2-micro (`infra/turn.tf`)
- **Demos:** GitHub Pages, deployed on push (`.github/workflows/deploy-demo.yml`)
- **Infrastructure:** Terraform in `infra/`
- **Tests:** Jest; `npm test` (roots include `tests/`)

## The networking model

This is the part that is easy to get wrong, and the part that broke in
production. Three separate things are often collapsed into "the server":

| Piece | Lives for | Needed when | Where |
|-------|-----------|-------------|-------|
| Signaling | the lobby, then closed | introducing peers to each other | Cloud Run |
| STUN | one question during setup | discovering a public address | Google's public STUN |
| TURN | the whole session, if used | no direct path exists | our coturn VM |

**Signaling only introduces peers.** It relays offers, answers and ICE
candidates, and nothing else — game messages never touch it. Once every data
channel is open it has no remaining job, so clients call
`WebRTCNetworkEngine.closeSignaling()` (poker at `beginMatch`, the two-player
games when their peer connects). This is deliberate and is a one-way door: no
peer can be dialled or re-dialled afterwards, and nobody can rejoin. Acceptable
only because no demo attempts an ICE restart or reconnect anyway. If mid-game
recovery is ever wanted, this is the decision to revisit first.

**Only the joiner dials.** On `ROOM_JOINED` the joiner offers to every existing
peer. `PEER_JOINED` tells the members already in the room, but is informational
only — offering back from it would have both sides offering at once.

**STUN is not a fallback for TURN.** STUN answers "what does my address look
like from outside", then leaves; data never flows through it. TURN is a relay
that stays in the data path for the entire session. They are not tiers of the
same mechanism.

**TURN is last resort but permanent.** ICE prefers local addresses, then
STUN-discovered ones, and only allocates a relay when nothing else connects.
Players on the same Wi-Fi never touch it. But once ICE selects a relay pair,
every packet of that game goes through the VM until the session ends.

### Why TURN is not optional

STUN works when the NAT reuses one public port across destinations, which home
routers typically do. Carrier-grade NAT — every player on cellular data — assigns
a different port per destination, so the address STUN reports is only ever valid
for the STUN server itself. Two players both on cellular therefore have no direct
path at all, and no amount of signaling creates one.

This is a property of the NAT, not the radio: some carriers use portable
mappings, and plenty of corporate Wi-Fi does not. Hostile-to-friendly usually
still connects; it is specifically *both* ends being hostile that is hopeless.

**Two devices on the same Wi-Fi never exercise any of this** — they see each
other's local addresses and connect directly. Local testing cannot tell you
whether NAT traversal works. Test on two phones on cellular, or trust nothing.

### TURN credentials

coturn runs in `use-auth-secret` mode. The signaling server holds the same shared
secret (Secret Manager → Cloud Run env) and mints credentials locally:
`username = <expiry>:<playerId>`, `credential = base64(hmac-sha1(secret, username))`.
No API call to the relay or any vendor. Credentials ship inside
`ROOM_CREATED`/`ROOM_JOINED`, so **nothing long-lived is ever baked into the
public bundle** — the demos are a public static site and could not hold a secret.

The 12h TTL caps a relayed session: the browser refreshes its TURN allocation
periodically and coturn re-checks the credential each time. Since signaling
closes at game start, a client cannot be issued fresh credentials mid-game.

### coturn fails open — verify it, never assume

**coturn treats an unreadable config as no config and starts anyway, with
authentication disabled.** It does not crash and logs nothing obvious. A
permissions mistake is therefore an *open relay*, not an outage.

This has already happened once: `/etc/turnserver.conf` was created 0600 while
coturn drops to the unprivileged `turnserver` user, so it silently ran on
defaults and granted relay allocations to anyone who asked. The config must be
`0640 root:turnserver` — private, but readable by the daemon. The startup script
now refuses to run coturn if the file is unreadable, so it fails closed.

"The service started" proves nothing. After any change to the relay, run:

```
SECRET=$(gcloud --configuration=personal secrets versions access latest \
  --secret=gamework-turn-secret --project=kan-kawabata-2026)
node scripts/verify-turn.js "$(cd infra && terraform output -raw turn_ip)" "$SECRET"
```

It speaks real STUN/TURN and asserts that an *unauthenticated* Allocate is
rejected with 401 — the check that would have caught the open relay — and that a
server-minted credential actually gets a relay.

## Diagnosing connection failures

A failed peer-to-peer connection looks *identical to success* in the Cloud Run
logs: both players reach the room, sockets stay healthy, no errors. The server
cannot observe WebRTC outcomes. Check the browser's ICE state
(`[gamework] ICE <peer>: ...`), not the server.

Logs (personal gcloud config — the shell wrapper only exists in interactive shells):

```
gcloud --configuration=personal logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="gamework-signaling"' \
  --project=kan-kawabata-2026 --limit=50 --freshness=1d
```

A WebSocket appears there as a single `GET 101` whose latency is the connection's
whole lifetime, not a short request.

## Known gaps

- No reconnect and no ICE restart. A dropped peer is gone for the session.
- No `turns:` (TLS) relay. Fine for cellular; a network blocking both UDP and
  TCP 3478 would need it, which means DNS and a certificate.
- `docs/mermaid_tictactoe.md` predates the signaling rewrite and describes
  message names that no longer exist.
