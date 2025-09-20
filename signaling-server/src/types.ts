export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  lastSeen: number;
}

export interface GameRoom {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, Player>;
  maxPlayers: number;
  gameType: string;
  createdAt: number;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice_candidate' | 'room_info' | 'join_request';
  payload: any;
  from: string;
  to?: string;
  roomId: string;
}

export interface ClientMessage {
  type: 'join_room' | 'leave_room' | 'signaling_message' | 'ping';
  payload: any;
  roomId?: string;
  playerId?: string;
}

export interface ServerMessage {
  type: 'room_joined' | 'room_left' | 'signaling_message' | 'room_update' | 'error' | 'pong';
  payload: any;
  roomId?: string;
}




