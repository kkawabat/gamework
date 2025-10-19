// Shared types for signaling communication between client and server

export interface Peer {
  id: string;
  name?: string;
  isHost?: boolean;
  lastSeen?: number;
  
  // WebRTC connection info (using any to avoid server compilation issues)
  connection?: any; // RTCPeerConnection
  dataChannel?: any; // RTCDataChannel
  isConnected?: boolean;
  
  [key: string]: any;
}

export interface GameRoom {
  id: string;
  roomCode?: string; // Server-generated room code for joining
  host: Peer;
  peers: Map<string, Peer>;
}

export interface SignalingMessage {
  type: 'SignalingMessage' | "RoomUpdate";
  action: string;
  from: string;
  payload: {
    [key: string]: any;
  };
}

export interface offerMessage extends SignalingMessage {
  type: 'SignalingMessage';
  action: 'offer';
  from: string;
  payload: {
    to: string;
    offer: any; // RTCSessionDescriptionInit
  };
}

export interface answerMessage extends SignalingMessage {
  type: 'SignalingMessage';
  action: 'answer';
  from: string;
  payload: {
    to: string;
    answer: any; // RTCSessionDescriptionInit
  };
}

export interface iceCandidateMessage extends SignalingMessage {
  type: 'SignalingMessage';
  action: 'ice_candidate';
  from: string;
  payload: {
    to: string;
    candidate: any; // RTCIceCandidateInit
  };
}

export interface createRoomMessage extends SignalingMessage {
  type: 'RoomUpdate';
  action: 'CreateRoomRequest';
  from: string;
  payload: {};
}

export interface joinRoomMessage extends SignalingMessage {
  type: 'RoomUpdate';
  action: 'JoinRoomRequest';
  from: string;
  payload: {
    roomId?: string;
    roomCode?: string
  }
}

export interface closeRoomMessage extends SignalingMessage {
  type: 'RoomUpdate';
  action: 'CloseRoomRequest';
  from: string;
  payload: {
    roomId: string;
  };
}