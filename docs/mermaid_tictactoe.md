sequenceDiagram
    participant User as Player
    participant UI as TicTacToeUIEngine
    participant GW as TicTacToeGameWork
    participant GE as TicTacToeEngine
    participant NE as NetworkEngine
    participant SS as SignalingService
    participant Server as SignalingServer
    participant Peer as Other Player

    Note over User, Peer: TicTacToe Game Flow

    %% Game Initialization
    User->>UI: Click "Create Room"
    UI->>GW: sendPlayerAction(CreateRoomRequest)
    GW->>NE: sendPlayerAction(CreateRoomRequest)
    NE->>SS: sendMessage(CreateRoomRequest)
    SS->>Server: WebSocket: CreateRoomRequest
    Server->>SS: WebSocket: CreateRoom
    SS->>NE: message: CreateRoom
    NE->>GW: sendStateChange(CreateRoom)
    GW->>GW: handleRoomUpdate(room)
    GW->>UI: updateState(newState)
    UI->>User: Display room code & QR

    %% Player Joins
    Peer->>UI: Enter room code & click "Join"
    UI->>GW: sendPlayerAction(JoinRoomRequest)
    GW->>NE: sendPlayerAction(JoinRoomRequest)
    NE->>SS: sendMessage(JoinRoomRequest)
    SS->>Server: WebSocket: JoinRoomRequest
    Server->>SS: WebSocket: JoinRoom
    SS->>NE: message: JoinRoom
    NE->>GW: sendStateChange(JoinRoom)
    GW->>GW: addConnectedPlayer(player)
    GW->>UI: updateState(updatedState)
    UI->>User: Show "Player 2 joined"

    %% WebRTC Connection Setup
    Note over GW, Peer: WebRTC Connection Establishment
    GW->>NE: createOffer(peerId)
    NE->>SS: sendMessage(offer)
    SS->>Server: WebSocket: offer
    Server->>SS: WebSocket: offer
    SS->>Peer: WebSocket: offer
    Peer->>NE: handleOffer(offer)
    NE->>SS: sendMessage(answer)
    SS->>Server: WebSocket: answer
    Server->>SS: WebSocket: answer
    SS->>GW: message: answer
    GW->>NE: handleAnswer(answer)
    NE->>GW: onConnectionChange(connected)

    %% Game Play - Player 1 Move
    User->>UI: Click cell (position 0)
    UI->>GW: sendPlayerAction(PlayerMove)
    GW->>GW: processPlayerAction(PlayerMove)
    GW->>GE: processAction(PlayerMove)
    GE->>GE: applyPlayerMove(action)
    GE-->>GW: newState
    GW->>GW: updateState(newState)
    GW->>UI: updateState(newState)
    UI->>User: Update board display
    GW->>NE: updateState(newState)
    NE->>Peer: WebRTC: broadcastMessage(stateChange)
    Peer->>UI: updateState(newState)
    UI->>User: Update board display

    %% Game Play - Player 2 Move
    Peer->>UI: Click cell (position 4)
    UI->>GW: sendPlayerAction(PlayerMove)
    GW->>GW: processPlayerAction(PlayerMove)
    GW->>GE: processAction(PlayerMove)
    GE->>GE: applyPlayerMove(action)
    GE-->>GW: newState
    GW->>GW: updateState(newState)
    GW->>UI: updateState(newState)
    UI->>User: Update board display
    GW->>NE: updateState(newState)
    NE->>User: WebRTC: broadcastMessage(stateChange)
    User->>UI: updateState(newState)
    UI->>User: Update board display

    %% Game Play - Player 1 Move (Winning Move)
    User->>UI: Click cell (position 8)
    UI->>GW: sendPlayerAction(PlayerMove)
    GW->>GW: processPlayerAction(PlayerMove)
    GW->>GE: processAction(PlayerMove)
    GE->>GE: applyPlayerMove(action)
    GE->>GE: checkWinner()
    GE-->>GW: newState (gameOver: true, winner: 'X')
    GW->>GW: updateState(newState)
    GW->>UI: updateState(newState)
    UI->>User: Display "Player X wins!"
    GW->>NE: updateState(newState)
    NE->>Peer: WebRTC: broadcastMessage(stateChange)
    Peer->>UI: updateState(newState)
    UI->>User: Display "Player X wins!"

    %% Game Restart
    User->>UI: Click "Restart Game"
    UI->>GW: sendPlayerAction(RestartGame)
    GW->>GW: processPlayerAction(RestartGame)
    GW->>GE: processAction(RestartGame)
    GE->>GE: applyRestartGame()
    GE-->>GW: newState (reset board)
    GW->>GW: updateState(newState)
    GW->>UI: updateState(newState)
    UI->>User: Clear board display
    GW->>NE: updateState(newState)
    NE->>Peer: WebRTC: broadcastMessage(stateChange)
    Peer->>UI: updateState(newState)
    UI->>User: Clear board display

    %% Room Cleanup
    User->>UI: Close browser/leave room
    UI->>GW: sendPlayerAction(LeaveRoomRequest)
    GW->>NE: sendPlayerAction(LeaveRoomRequest)
    NE->>SS: sendMessage(CloseRoomRequest)
    SS->>Server: WebSocket: CloseRoomRequest
    Server->>SS: WebSocket: RoomClosed
    SS->>Peer: WebSocket: RoomClosed
    Peer->>UI: handleRoomClosed()
    UI->>User: Show "Room closed"