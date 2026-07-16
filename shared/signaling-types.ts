export type SignalData =
  | { kind: 'offer'; sdp: unknown }
  | { kind: 'answer'; sdp: unknown }
  | { kind: 'ice'; candidate: unknown };

export type ClientToServer =
  | { type: 'CREATE_ROOM'; playerId: string }
  | { type: 'JOIN_ROOM'; playerId: string; roomCode: string }
  | { type: 'SIGNAL'; to: string; data: SignalData };

/** Matches RTCIceServer, but declared here so the server can build it without DOM types. */
export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export type ServerToClient =
  // iceServers ride along with the room reply: both sides need them before they
  // dial, and the joiner dials the moment ROOM_JOINED lands.
  | { type: 'ROOM_CREATED'; roomCode: string; iceServers: IceServerConfig[] }
  | { type: 'ROOM_JOINED'; roomCode: string; peers: string[]; iceServers: IceServerConfig[] }
  // Sent to the members already in the room. Informational only: the joiner
  // dials them from ROOM_JOINED, so acting on this would make both sides offer.
  | { type: 'PEER_JOINED'; peerId: string }
  | { type: 'SIGNAL'; from: string; data: SignalData }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'ERROR'; message: string };
