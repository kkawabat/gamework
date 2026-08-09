/**
 * The vocabulary for how a multiplayer session is wired.
 *
 * Named modes — peer-to-peer, hub-and-spoke, PC-plus-mobile, remote co-op —
 * are not four mechanisms, and neither are they four seatings. They fall out of
 * three layers plus one declaration:
 *
 *   Device   a browser tab. A connection endpoint, and nothing else.
 *   Entity   a named principal with a role. Identity and permissions attach
 *            here, not to the device — one device may host several.
 *   Role     what an entity may read and write, as channel patterns.
 *
 *   Connectivity / Authority   who can reach whom, and where the reducer runs.
 *
 * A seat is not a primitive here. "Player" is simply the most common role, and
 * a game with a shared display, an admin console and an asymmetric special
 * player expresses all of them the same way.
 *
 * See docs/session-modes.md.
 */

/**
 * Mesh gives every peer a channel to every other peer: N²/2 connections, and
 * any two peers both behind carrier-grade NAT need a TURN relay between them.
 * It buys the only thing star cannot — surviving the loss of the host, since
 * the remaining peers are already connected to each other.
 *
 * Star gives every peer one channel, to the hub. Cheaper, and bounds TURN
 * exposure to hub↔spoke pairs, at the cost of the hub being a single point of
 * failure that is, in practice, a browser tab.
 */
export type Connectivity = 'mesh' | 'star';

/**
 * Where game state is computed. This is a declaration, not a routing rule —
 * routing is entirely the channel ACLs. It is kept separate because reading a
 * channel and running the reducer are different things: a shared display can
 * read every move and reduce nothing, rendering a published view instead.
 *
 *  - `replicated`   every device runs the reducer over the same inputs. No
 *                   privileged node. Needs full determinism.
 *  - `arbitrated`   every device still reduces, but one resolves what replay
 *                   cannot derive: seeds, ordering, admission. Cannot keep a
 *                   secret — every device computes the whole state.
 *  - `authoritative` only the authority reduces; everyone else writes intents
 *                   and reads views. The only mode that can withhold anything.
 */
export type Authority = 'replicated' | 'arbitrated' | 'authoritative';

/** A browser tab. Matches the signaling `playerId`. */
export type DeviceId = string;

/** A principal: what identity and permission attach to. */
export type EntityId = string;

export type Channel = string;

/**
 * What an entity may do, as channel patterns. `{self}` binds to the entity's
 * own id; a trailing `*` matches by prefix.
 *
 * Enforcement is a correctness boundary, not a trust boundary: the authority is
 * another browser tab, so this stops a confused client, not a determined one.
 * There is no trust boundary in a peer-to-peer browser game.
 */
export interface Role {
  name: string;
  reads: string[];
  writes: string[];
}

export interface Entity {
  entityId: EntityId;
  /** Names a Role in the session's role table. */
  role: string;
  /** The device currently hosting it. Rebinding this is what reconnect will be. */
  deviceId: DeviceId;
}

/** What a device asks to bring into the session. */
export interface EntitySpec {
  role: string;
  /** Omit to let the host assign one (`player-0`, `player-1`, …). */
  entityId?: EntityId;
}

export interface SessionMode {
  connectivity: Connectivity;
  authority: Authority;
}

export interface SessionOptions {
  mode: SessionMode;
  deviceId: DeviceId;
  /**
   * The role table. Static game data, identical in every bundle, so only entity
   * assignments ever go on the wire — never the rules themselves.
   */
  roles: Role[];
  /** The entities this device brings. More than one is normal and intended. */
  entities: EntitySpec[];
  /**
   * Per-role caps, e.g. `{ player: 8 }`. An entity arriving past its cap is
   * simply not admitted; its device stays connected, holding whatever other
   * entities it brought.
   */
  maxEntities?: Record<string, number>;
}

/** Delivered alongside every channel payload. */
export interface WriteMeta {
  channel: Channel;
  /** The entity that wrote it — not the device, which is only how it arrived. */
  author: EntityId;
  from: DeviceId;
}

export type SessionEnvelope =
  /** Joiner → host on connect: the entities it brings. */
  | { kind: 'hello'; from: DeviceId; entities: EntitySpec[] }
  /** Host → everyone: the admitted entities. The host is the only author. */
  | { kind: 'registry'; from: DeviceId; entities: Entity[]; locked: boolean }
  | { kind: 'write'; from: DeviceId; author: EntityId; channel: Channel; payload: unknown };
