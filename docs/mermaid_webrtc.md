sequenceDiagram
    participant Client as Client
    participant Server as Signaling Server
    participant Host as Host

    Note over Client,Host: Room Join & WebRTC Handshake

    Client->>Server: JoinRoomRequest(roomCode)
    Server->>Host: JoinRoom(playerId, roomId, roomCode, hostId)
    
    Note over Host: Host receives JoinRoom
    Host->>Host: Add new player to room
    Host->>Host: Create WebRTC offer for client
    Host->>Server: offer(to: clientId, offer: RTCSessionDescription)
    
    Note over Client: Client receives JoinRoom
    Client->>Client: Create WebRTC manager
    Client->>Client: Create WebRTC offer for host
    Client->>Server: offer(to: hostId, offer: RTCSessionDescription)
    
    Server->>Client: offer(from: hostId, offer: RTCSessionDescription)
    Server->>Host: offer(from: clientId, offer: RTCSessionDescription)
    
    Note over Client: Client processes host offer
    Client->>Client: Create answer for host offer
    Client->>Server: answer(to: hostId, answer: RTCSessionDescription)
    
    Note over Host: Host processes client offer
    Host->>Host: Create answer for client offer
    Host->>Server: answer(to: clientId, answer: RTCSessionDescription)
    
    Server->>Host: answer(from: clientId, answer: RTCSessionDescription)
    Server->>Client: answer(from: hostId, answer: RTCSessionDescription)
    
    Note over Client,Host: ICE Candidate Exchange
    loop ICE Candidate Gathering
        Client->>Client: Generate ICE candidate
        Client->>Server: ice_candidate(to: hostId, candidate: RTCIceCandidate)
        Host->>Host: Generate ICE candidate
        Host->>Server: ice_candidate(to: clientId, candidate: RTCIceCandidate)
        
        Server->>Host: ice_candidate(from: clientId, candidate: RTCIceCandidate)
        Server->>Client: ice_candidate(from: hostId, candidate: RTCIceCandidate)
        
        Host->>Host: Add ICE candidate to connection
        Client->>Client: Add ICE candidate to connection
    end
    
    Note over Client,Host: Connection Establishment
    Client->>Client: ICE connection state: connected
    Host->>Host: ICE connection state: connected
    Client->>Client: Data channel ready
    Host->>Host: Data channel ready
    
    Note over Client,Host: WebRTC Connection Established
    Client->>Host: Game messages via data channel
    Host->>Client: Game messages via data channel