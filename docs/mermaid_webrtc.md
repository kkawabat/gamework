Room join and WebRTC handshake, as implemented in `server/server.ts` and
`src/engines/WebRTCNetworkEngine.ts`. See `CONTEXT.md` for the reasoning.

Note that only the joiner dials. `PEER_JOINED` tells the host someone arrived,
but the host never offers back — that would have both sides offering at once.

```mermaid
sequenceDiagram
    participant Host as Host
    participant Server as Signaling Server
    participant Joiner as Joiner
    participant TURN as TURN relay (last resort)

    Host->>Server: CREATE_ROOM(playerId)
    Server->>Host: ROOM_CREATED(roomCode, iceServers)
    Note over Server,Host: iceServers carry per-player TURN<br/>credentials minted by HMAC

    Joiner->>Server: JOIN_ROOM(playerId, roomCode)
    Server->>Joiner: ROOM_JOINED(roomCode, peers, iceServers)
    Server->>Host: PEER_JOINED(peerId)
    Note over Host: Shows "connecting…" — the server<br/>sees the join even if WebRTC never works

    Note over Joiner: Only the joiner offers
    Joiner->>Server: SIGNAL(to: host, {kind: offer})
    Server->>Host: SIGNAL(from: joiner, {kind: offer})
    Host->>Server: SIGNAL(to: joiner, {kind: answer})
    Server->>Joiner: SIGNAL(from: host, {kind: answer})

    loop Trickle ICE (candidates may outrun the description; they are buffered)
        Host->>Server: SIGNAL(to: joiner, {kind: ice})
        Server->>Joiner: SIGNAL(from: host, {kind: ice})
        Joiner->>Server: SIGNAL(to: host, {kind: ice})
        Server->>Host: SIGNAL(from: joiner, {kind: ice})
    end

    Note over Host,Joiner: ICE tries local, then STUN-discovered,<br/>and only then a relay
    alt A direct path exists (same Wi-Fi, or friendly NAT)
        Host-->>Joiner: data channel, peer to peer
    else Both behind carrier NAT
        Host-->>TURN: data channel
        TURN-->>Joiner: relayed for the whole session
    end

    Note over Host,Joiner: Data channels open → onPeerConnected
    Host->>Server: close socket (closeSignaling)
    Joiner->>Server: close socket (closeSignaling)
    Note over Server: Room deleted. The game continues<br/>with no server involved.
```
