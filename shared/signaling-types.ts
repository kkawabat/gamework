export type SignalData =
  | { kind: 'offer'; sdp: unknown }
  | { kind: 'answer'; sdp: unknown }
  | { kind: 'ice'; candidate: unknown };

export type ClientToServer =
  | { type: 'CREATE_ROOM'; playerId: string }
  | { type: 'JOIN_ROOM'; playerId: string; roomCode: string }
  | { type: 'SIGNAL'; to: string; data: SignalData };

export type ServerToClient =
  | { type: 'ROOM_CREATED'; roomCode: string }
  | { type: 'ROOM_JOINED'; roomCode: string; peers: string[] }
  | { type: 'SIGNAL'; from: string; data: SignalData }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'ERROR'; message: string };
