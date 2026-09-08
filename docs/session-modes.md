# Session modes

## The named modes are not the design

The obvious way to support "peer-to-peer", "hub-and-spoke", "PC plus mobile" and
"remote co-op" is a `mode` enum with four values. It is the wrong shape: those
four share nearly all their machinery, vary along axes independent of each
other, and the fifth mode would arrive as a fifth special case.

The second-most-obvious shape is a **seat** — a player, holding one or more
devices. That is also wrong, just less obviously. A seat carries a turn-order
index (game data the session never reads) and a device list (which only answers
"where do I send this private view"). Strip both and nothing is left. Worse, it
cannot express a PC that is the dungeon master, or a host that is both a referee
and a player with different permissions in each capacity.

What is actually primitive is three layers and one declaration.

| Layer | What it is |
|---|---|
| **Device** | A browser tab. A connection endpoint, and nothing else. |
| **Entity** | A named principal with a role. Identity and permission attach here. One device may hold several. |
| **Role** | What an entity may read and write, as channel patterns. |

| Declaration | Values |
|---|---|
| **Connectivity** | `mesh`, `star` — who holds a data channel to whom |
| **Authority** | `replicated`, `arbitrated`, `authoritative` — where the reducer runs |

A seat is not a primitive. "Player" is simply the most common role.

## Channels

Everything on the wire is a write to a named channel. An input is a write to a
channel the referee reads; a view is a write to a channel players read. There is
no separate `submit` and `publish`, and no built-in notion of "public" or
"private" — those are conventions about which channels a role happens to read.

A role declares the channels it accesses. `{self}` binds to the entity's own id,
and a trailing `*` matches by prefix:

```ts
const PLAYER: Role = {
  name:   'player',
  reads:  ['public', 'hand:{self}'],   // not hand:* — that would be every hand
  writes: ['intent:{self}']
};
const TABLE: Role = { name: 'table', reads: ['public'], writes: [] };
const ADMIN: Role = { name: 'admin', reads: ['public', 'intent:*'], writes: ['public', 'hand:*'] };
```

`{self}` is what makes hidden information a routing fact. Without it a private
channel is only private by convention.

**Enforcement is a correctness boundary, not a trust boundary.** The authority
is another browser tab, so an ACL stops a confused client, not a determined one.
There is no trust boundary in a peer-to-peer browser game, and this system
should not be described as if there were.

## Where the named modes land

| Asked-for mode | Connectivity | Authority | Entities |
|---|---|---|---|
| Peer-to-peer | `mesh` | `replicated` | one `player` per device |
| Peer-to-peer with a default host | `mesh` | `arbitrated` | host adds a `dealer` |
| Hub and spoke | `star` | `authoritative` | hub has `admin` + `table` |
| PC + mobile | `star` | `authoritative` | PC has `table`, phone has `player` |
| Remote co-op | `star` | `authoritative` | each PC `table`, each phone `player` |
| Asymmetric (DM, spymaster) | either | `authoritative` | a role of its own |
| Hot-seat on one device | either | either | two `player` entities, one device |

The last two were never asked for. They need no new mechanism, which is the
test the seat model failed.

## Choosing a connectivity

Star is cheaper: N connections instead of N²/2, and only hub↔spoke pairs can
consume a TURN relay. For 4–8 players on phones the N² TURN exposure bites
first.

Mesh buys one thing: **it is the only connectivity where losing the host is
survivable**, because the remaining peers already hold channels to each other.
Under star the hub going away disconnects everyone from everyone — and the hub
is, in practice, a browser tab. (Host migration is not implemented; mesh is what
would make it possible.)

Under star a spoke can only reach the hub, so the hub forwards writes to other
spokes that read the channel. It routes whether or not it reads the channel
itself: being the only path is a transport fact, not a permission.

## Authority

`authority` is a declaration about where the reducer runs. It is deliberately
not derived from the ACL graph, because reading a channel and reducing are
different things — a shared display can read every move and reduce nothing.

- **`replicated`** — every device reduces the same broadcast inputs. Needs full
  determinism, has no privileged node.
- **`arbitrated`** — every device still reduces, but one entity is the sole
  source of what replay cannot derive: seeds, ordering, admission. Cannot keep a
  secret, since every device computes the whole state.
- **`authoritative`** — only the authority reduces; everyone else writes intents
  and reads views. The only mode that can genuinely withhold anything.

There is no `session.isAuthority`. "Do I reduce" is answered by whether this
device holds the role that reads the game's intent channel, in the game's own
vocabulary.

## The API

```ts
const session = new Session(networkEngine, {
  mode: { connectivity: 'star', authority: 'authoritative' },
  deviceId,
  roles: [PLAYER, TABLE, ADMIN],
  entities: [{ role: 'admin' }, { role: 'table' }],   // one device, two principals
  maxEntities: { admin: 1, table: 1, player: 8 }
});

await session.initialize();
const roomCode = await session.host();          // or: await session.join(code)

session.onRegistry(() => { /* bind once local entities appear */ });

const me = session.actAs('admin-0');
me.write('hand:player-2', { cards });
me.on('intent:*', (payload, meta) => { /* meta.author is the entity */ });
session.lock();                                  // no more entities
```

Two behaviours worth knowing:

- **A write goes on the wire first, then delivers locally**, so the copy other
  devices need does not depend on a local handler succeeding. It loops back to
  the writer's own entities that read the channel, so one code path serves
  everyone.
- **Entity ids are assigned by the host and numbered per role** (`player-0`,
  `player-1`, `dealer-0`). A joiner does not know its own id until the registry
  arrives, so bind in `onRegistry`, not after `join()`.

### Delivery: two data channels

Every peer connection carries two data channels, opened together by the dialer
and told apart by label:

| | `gamework` | `gamework-fast` |
|---|---|---|
| Config | `{ ordered: true }` | `{ ordered: false, maxRetransmits: 0 }` |
| Guarantee | retransmits until delivered | never retransmits |
| Carries | control, moves — everything by default | only channels a game declares |

```ts
new Session(engine, { …, unreliable: ['state', 'paddle:*'] })
```

**Reliable is the default, and control is never anything else.** `hello`,
`registry` and one-shot game messages like a ready signal are written once with
nothing retrying them, so a single lost packet hangs a device in the lobby
silently. Passing `unreliable: ['*']` still cannot make control lossy — that is
asserted in the tests, because it is the kind of thing a later refactor breaks
without noticing.

Only declare a channel unreliable when it carries **absolute** values at a high
rate, so the next write supersedes a lost one. A replicated game that loses one
move desyncs permanently; nothing in this layer reconciles.

One consequence worth designing around: a throttled stream that stops sending
when nothing changes can have its *last* write lost and never repeated. Pong
resends a stationary paddle every 500ms for exactly this reason.

Only the reliable channel reports a peer as connected. The unreliable one
negotiates a moment later, and senders fall back to the reliable channel until
it opens, so a game that starts streaming immediately is briefly slower rather
than broken.

### `lock()` and signaling

Locking closes admission and drops the signaling socket — except on the hub of a
star, which keeps its socket because it is the only node a late joiner could be
introduced to. One held socket per room beats N.

The shared fact ("the session is locked") and the local action ("I released my
socket") are tracked separately on purpose. A joiner learns `locked` from the
host's broadcast *before* it calls `lock()` itself, so a single flag would leave
that device holding its signaling socket open for the whole game.

## What is implemented

Covered by `tests/unit/Session.test.ts`, `tests/unit/OddOneOut.test.ts` and
`tests/unit/Poker.test.ts`:

- Entity registry, per-role id numbering and caps, multi-entity devices.
- Channel ACLs with `{self}` binding and `*` prefixes, enforced on write and
  re-checked on arrival.
- Delivery to exactly the entities whose role reads a channel, including
  loopback and wildcard readers.
- Star routing and hub relay between spokes.
- `hostId` in `ROOM_JOINED`, so a star joiner dials only the hub.

Demos:

| Demo | Mode | Entities |
|---|---|---|
| tic-tac-toe, chess, connect-four | `mesh` / `replicated` | one `player` each |
| Odd One Out | `mesh` / `authoritative` | host holds `admin` + `player`; others `player` |
| poker | `star` / `authoritative` | host holds `dealer` + `player` |
| Set | `star` / `authoritative` | host holds `admin` + `player`; others `player` |
| Would You Rather | `star` / `authoritative` | hub holds `admin` + `guest`; others `guest` |
| Tilt Pong | `mesh` / `authoritative` | host holds `referee` + `player` |

Odd One Out is the N-player mesh: every phone holds a channel to every other
phone, and the word is still a routing fact — `secret:{self}` — so the odd one
out is never sent it. Poker is the hub-and-spoke: joiners dial only the host,
and hole cards travel on `hand:{self}`. Set is the same star, for a different
reason: the board is public, and the hub exists only to serialize who claimed
a set first. Solo Set never opens a session at all.

Would You Rather is the one that never locks: admission stays open all evening
so a phone can join at round nine, and the resync that needs is one line, because
under `authoritative` the authority already holds everything a new arrival must
be told — it republishes `public` on every registry change. It also separates
the two things called "host": the hub routes and reduces and cannot move, while
the asking seat is a field of the published state and is passed around by
writing to it. And it is the only demo that reconnects: never locking is what
leaves a socket to reopen, so a tab that reloads keeps its device id, comes back
to the same entity and is caught up by the same republish a latecomer gets.

Tilt Pong is the only real-time one, and the first `authoritative` session whose
reason is divergence rather than secrecy: two devices simulating one bouncing
ball drift apart within seconds however carefully they start.

**No demo has run in a browser since this model landed.** Odd One Out and poker
are driven end to end across several real sessions in tests, but over a fake
transport — see CONTEXT.md on why local testing proves nothing about NAT
traversal.

## What is not implemented

1. **Reconnect.** Half of it exists: a device that comes back as *itself* is
   re-seated on the entities it already had, because `admit()` answers a repeat
   hello with the registry instead of ignoring it, and the authority republishes
   behind that. An entity rebinding to a *different* device — the claim token in
   docs/TODO.md — is still not started, so a phone whose browser killed the tab
   is a stranger. Only an unlocked session can use any of it.
2. **Late join.** The hub keeps its signaling socket, which is the foundation,
   but `admit()` turns away anyone arriving after `lock()`. A game that never
   locks — Would You Rather — takes latecomers today; what is missing is
   admitting one *after* the session has closed.
3. **Host migration.** Only possible under mesh. Nothing implements it. Passing
   an asking seat, as Would You Rather does, is not this: that seat is game
   state, and the hub it is passed across stays exactly where it was.
4. **A `seats` preset.** Games declare 3–6 lines of roles by hand. That has been
   clearer than a preset so far; revisit if it starts repeating.
