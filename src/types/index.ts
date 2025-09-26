export interface GameState {
  version: number;
  timestamp: number;
  [key: string]: any;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  lastSeen: number;
  role?: string;
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

export interface GameMove {
  type: string;
  playerId: string;
  timestamp: number;
  data: any;
}

export interface GameMessage {
  type: 'join' | 'input' | 'state' | 'resync' | 'player_join' | 'player_leave' | 'error' | 'game_over';
  payload: any;
  timestamp: number;
  messageId: string;
}

export interface JoinMessage extends GameMessage {
  type: 'join';
  payload: {
    playerId: string;
    playerName: string;
    roomId: string;
  };
}

export interface InputMessage extends GameMessage {
  type: 'input';
  payload: GameMove;
}

export interface StateMessage extends GameMessage {
  type: 'state';
  payload: {
    state: GameState;
    isFullSnapshot: boolean;
    lastMoveId?: string;
  };
}

export interface ResyncMessage extends GameMessage {
  type: 'resync';
  payload: {
    playerId: string;
    lastKnownVersion: number;
  };
}

export interface PlayerJoinMessage extends GameMessage {
  type: 'player_join';
  payload: Player;
}

export interface PlayerLeaveMessage extends GameMessage {
  type: 'player_leave';
  payload: {
    playerId: string;
    reason: string;
  };
}

export interface ErrorMessage extends GameMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface GameConfig {
  gameType: string;
  maxPlayers: number;
  initialState: GameState;
  rules: GameRules;
}

export interface GameRules {
  applyMove: (state: GameState, move: GameMove) => GameState;
  isValidMove: (state: GameState, move: GameMove) => boolean;
  isGameOver: (state: GameState) => boolean;
  getWinner?: (state: GameState) => string | null;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice_candidate' | 'room_info' | 'join_request';
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

export interface HostConfig {
  roomId: string;
  roomName: string;
  gameConfig: GameConfig;
  stunServers?: RTCIceServer[];
  enableWakeLock?: boolean;
  enablePWA?: boolean;
}

export interface ClientConfig {
  roomId: string;
  playerName: string;
  stunServers?: RTCIceServer[];
}

// Re-export RTCIceServer for convenience
export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

