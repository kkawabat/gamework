# GameWork TODO

Known, deliberate gaps in the session layer, in the order they should be taken.
Each is blocked by the one above it in practice, not just in preference.

Design context for all three: `docs/session-modes.md`. The short version is that
a **device** is a connection, an **entity** is a principal with a role, and the
host owns the entity registry.

---

## 1. Reconnect

**Status:** not started. The highest-value of the three.

A dropped device is gone for the session. For two players on laptops that is
tolerable. For a phone that locks its screen between turns it is the common
path, not an edge case — which makes it the thing that actually gates
phone-based play, and therefore every star-topology mode.

The current model makes the shape obvious: **an entity rebinds to a new device.**
`Entity.deviceId` is already the only thing tying a principal to a connection,
so reconnect is re-pointing it rather than a new mechanism.

What it needs:

- A **claim token** the returning device presents, held in `localStorage`, so it
  reclaims its own entity instead of being admitted as a new one. Entity ids are
  guessable (`player-1`), so the token has to be separate and unguessable —
  otherwise any device can seize any entity. Note the honest limit: this stops
  an accident, not an attacker, for the same reason the channel ACLs do.
- `Session.admit()` to accept a rebind when the token matches, and re-broadcast
  the registry with the new `deviceId`.
- A **state resync**. Under `authoritative` the authority republishes the
  channels that entity reads and it is caught up. Under `replicated` and
  `arbitrated` there is no snapshot to send — the returning device has missed
  inputs it can no longer replay. Either games in those modes accept that
  reconnect drops them, or the session grows a snapshot channel the game fills.
  **This is the open design question; decide it before writing code.**
- `WebRTCNetworkEngine` must be able to dial again. Today `closeSignaling()` is
  a one-way door (see CONTEXT.md), so a reconnecting device needs the hub's
  socket — which is exactly what `lock()` already preserves under star.

**Mesh cannot support this without more work.** Every peer dropped signaling at
`lock()`, so nobody can be re-dialled. Star first.

---

## 2. Late join

**Status:** foundation in place, feature not built.

The hub keeps its signaling socket open after `lock()` under star, which is the
part that had to be designed for. But `Session.admit()` turns away anyone
arriving after the lock, so a device that joins mid-game stays connected as a
spectator with no entity.

What it needs:

- A policy distinguishing "locked to new entities" from "closed to new
  devices". Jackbox-style games want late players; a two-player board game does
  not. Probably a per-role `lateJoin: boolean`, since it is genuinely per-role —
  a `table` display should be able to arrive late even when `player` cannot.
- The same state-resync question as reconnect. Solve it once, for both.
- A UI story for the room code after the lobby screen is gone.

Largely falls out of reconnect: both are "a device shows up and needs to be
given an entity and the current state."

---

## 3. Host migration

**Status:** not started. Lowest priority, highest cost.

If the host's tab closes, the session ends. The host owns the entity registry
and, under `arbitrated`/`authoritative`, authors the channels everything else
reads.

**Only possible under `mesh`,** and that is the whole reason mesh survives as a
connectivity option despite costing N²/2 connections and far more TURN exposure.
Under star the hub going away disconnects everyone from everyone, so there is
nothing left to migrate to.

What it needs:

- Deterministic successor selection every peer agrees on without a round of
  negotiation — lowest entity id among the survivors is the obvious rule.
- Registry handover. Every device already holds a replica, so the successor can
  adopt its own copy; the risk is divergence if the old host died mid-broadcast.
- State handover, which is only tractable under `arbitrated` — every peer
  already ran the reducer, so the successor has the state. Under `authoritative`
  nobody else has it, and migration means the new authority resynthesises state
  it was deliberately never told. That may simply not be supportable, and saying
  so is better than half-building it.
- Deciding what happens to the dead host's *player* entity, which is a different
  question from its referee entity. Two entities, two fates.

---

## Not a TODO

**A `seats` preset.** Games declare 3–6 lines of roles by hand, which has read
better than a preset would. Revisit only if the declarations start repeating.
