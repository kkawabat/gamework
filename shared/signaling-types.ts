export type SignalData =
  | { kind: 'offer'; sdp: unknown }
  | { kind: 'answer'; sdp: unknown }
  | { kind: 'ice'; candidate: unknown };

export type ClientToServer =
  | { type: 'CREATE_ROOM'; playerId: string }
  | { type: 'JOIN_ROOM'; playerId: string; roomCode: string }
  | { type: 'SIGNAL'; to: string; data: SignalData }
  // A deliberate departure from the game. This is the only thing that makes the
  // server announce a peer as gone: a bare socket close is ambiguous (clients
  // drop signaling on purpose once connected) so it is treated as silent.
  | { type: 'LEAVE_ROOM' };

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
  // The peer deliberately left the game (sent LEAVE_ROOM). Not sent for a bare
  // socket close, which is how a connected peer routinely drops signaling.
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'ERROR'; message: string };
