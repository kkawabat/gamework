export interface Player {
  id: string;
  name?: string;
  [key: string]: any;
}

export interface GameRoom {
  id: string;
  name?: string;
  hostId: string;
  players: Map<string, Player>;
  createdAt: number;
  [key: string]: any;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice_candidate' | 'room_info' | 'join_request' | 'lookup_room' | 'room_found' | 'room_joined';
  payload: any;
  from: string;
  to?: string;
  roomId: string;
}

export interface ConnectionInfo {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  isConnected: boolean;
}

// Re-export RTCIceServer for convenience
export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export interface GameWorkConfig {
  stunServers?: RTCIceServer[];
  signalServiceConfig: {
    serverUrl: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
  };
  // GameWork-specific config can be added here
}