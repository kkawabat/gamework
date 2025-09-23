# Multiplayer Tic-Tac-Toe Flow Documentation

## Complete Step-by-Step Flow: Player 2 Joins → Both Players Make First Moves

### **Phase 1: Player 2 Joins Room**

1. **Player 2 clicks "Join Room"**
   - Enters room code
   - Calls `joinExistingRoom()`
   - Sets `this.roomId = roomCode`
   - Calls `initializeAsClient()`

2. **Client Initialization**
   - Creates WebSocket signaling service
   - Creates GameClient with roomId and playerName
   - Sets `this.playerId = gameClient.getPlayerId()`
   - Sets up event handlers
   - Calls `gameClient.connect()`

3. **WebSocket Connection**
   - Client connects to signaling server
   - Client sends `join_room` message with roomId and playerId
   - Signaling server adds client to room
   - Signaling server sends `room_joined` to client
   - Client receives room info with 2 players

4. **Room Update Propagation**
   - Signaling server sends `room_update` to host
   - Host receives room update with 2 players
   - Host logs: `[GameHost] Room update received: 2 players`
   - Host detects new player and creates WebRTC offer

### **Phase 2: WebRTC Handshake**

5. **Host Creates WebRTC Offer**
   - Host calls `createWebRTCOffer(clientId)`
   - Host creates RTCPeerConnection
   - Host calls `createOffer()` and `setLocalDescription()`
   - Host sends offer via signaling service to client

6. **Client Receives Offer**
   - Client receives `signaling_message` with type 'offer'
   - Client calls `webrtc.handleOffer()`
   - Client creates RTCPeerConnection
   - Client calls `setRemoteDescription(offer)`
   - Client calls `createAnswer()` and `setLocalDescription()`
   - Client sends answer back to host

7. **Host Receives Answer**
   - Host receives `signaling_message` with type 'answer'
   - Host calls `webrtc.handleAnswer()`
   - Host calls `setRemoteDescription(answer)`

8. **ICE Candidate Exchange**
   - Both sides generate ICE candidates
   - Host sends ICE candidates to client via signaling
   - Client sends ICE candidates to host via signaling
   - Both sides call `addIceCandidate()`

9. **WebRTC Connection Established**
   - Data channel opens
   - `onConnectionChange` triggered with `isConnected: true`
   - Client sets `gameActive = true`
   - Client disconnects WebSocket after 5 seconds

### **Phase 3: Game State Synchronization**

10. **Host Sends Initial State**
    - Host calls `broadcastState(true)` (full snapshot)
    - Host sends game state via WebRTC to client
    - Client receives state update
    - Client calls `handleStateUpdate()`
    - Client updates board display

### **Phase 4: Player 1 Makes First Move**

11. **Player 1 Clicks Tile**
    - Host calls `makeMove(index)`
    - Creates move with `playerId: 'player1'`
    - Calls `gameHost.applyMove(move)`
    - Game rules: places 'X' at position, toggles currentPlayer to 'O'
    - Host calls `broadcastState(false)` (partial update)
    - Host sends state update via WebRTC to client

12. **Client Receives Move**
    - Client receives WebRTC message with type 'state'
    - Client calls `handleStateUpdate()`
    - Client updates board to show 'X'
    - Client updates display to show "Player O's turn"

### **Phase 5: Player 2 Makes First Move**

13. **Player 2 Clicks Tile**
    - Client calls `makeMove(index)`
    - Creates move with `playerId: clientPlayerId`
    - Calls `gameClient.sendMove('place', { position: index })`
    - Client sends move via WebRTC to host

14. **Host Receives Move**
    - Host receives WebRTC message with type 'input'
    - Host calls `handlePlayerInput(peerId, move)`
    - Host calls `applyMove(move)`
    - Game rules: places 'O' at position, toggles currentPlayer to 'X'
    - Host calls `broadcastState(false)` (partial update)
    - Host sends state update via WebRTC to client

15. **Client Receives Move**
    - Client receives WebRTC message with type 'state'
    - Client calls `handleStateUpdate()`
    - Client updates board to show 'O'
    - Client updates display to show "Player X's turn"

## **Expected Log Sequence:**

```
[Client] WebRTC connection changed: [hostId] connected
[GameHost] Room update received: 2 players
[GameHost] New players detected! Previous: 1, Current: 2
[GameHost] Creating WebRTC offer for new player: [clientId]
[GameHost] Received WebRTC answer from [clientId]
[GameHost] Peer [clientId] connection changed: connected
[GameHost] Total connected peers: 1
[Client] WebRTC established, disconnecting WebSocket signaling service
[GameHost] Sending state to new player [clientId]
[Client] State update received: {board: [...], currentPlayer: 'X', ...}
[Host] Made move at position 1
[Client] State update received: {board: ['X', null, ...], currentPlayer: 'O', ...}
[Client] Made move at position 4
[Host] State update received: {board: ['X', null, null, 'O', ...], currentPlayer: 'X', ...}
```

## **Key Components:**

- **WebSocket Signaling**: Initial connection and WebRTC handshake
- **WebRTC Direct Connection**: Game data and state synchronization
- **Game Rules**: Turn alternation and move validation
- **State Broadcasting**: Real-time game state updates
- **UI Updates**: Board display and player status

## **Troubleshooting:**

- **Host not seeing Player 2**: Check if host receives room updates
- **Moves not syncing**: Check WebRTC connection and state broadcasting
- **Wrong turn logic**: Check game rules and currentPlayer logic
- **UI not updating**: Check handleStateUpdate and updateBoard methods
