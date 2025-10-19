/**
 * NetworkTypes - Network-specific type definitions for GameWork v2
 * 
 * Provides strong typing for:
 * - WebRTC connections
 * - Signaling messages
 * - Network events
 * - Connection states
 */

// WebRTC connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed'
}

// ICE connection states
export enum ICEConnectionState {
  NEW = 'new',
  CHECKING = 'checking',
  CONNECTED = 'connected',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DISCONNECTED = 'disconnected',
  CLOSED = 'closed'
}

// Data channel states
export enum DataChannelState {
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed'
}

// Peer connection information
export interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: ConnectionState;
  iceState: ICEConnectionState;
  dataChannelState: DataChannelState;
  isHost: boolean;
  lastSeen: number;
}

// Signaling message types
export interface SignalingMessage {
  type: 'OFFER' | 'ANSWER' | 'ICE_CANDIDATE' | 'ROOM_UPDATE' | 'ERROR';
  from: string;
  to: string;
  payload: any;
  timestamp: number;
}

// WebRTC offer message
export interface OfferMessage extends SignalingMessage {
  type: 'OFFER';
  payload: {
    offer: RTCSessionDescriptionInit;
  };
}

// WebRTC answer message
export interface AnswerMessage extends SignalingMessage {
  type: 'ANSWER';
  payload: {
    answer: RTCSessionDescriptionInit;
  };
}

// ICE candidate message
export interface ICECandidateMessage extends SignalingMessage {
  type: 'ICE_CANDIDATE';
  payload: {
    candidate: RTCIceCandidateInit;
  };
}

// Room update message
export interface RoomUpdateMessage extends SignalingMessage {
  type: 'ROOM_UPDATE';
  payload: {
    action: 'CREATE_ROOM' | 'JOIN_ROOM' | 'LEAVE_ROOM' | 'ROOM_CREATED' | 'ROOM_JOINED' | 'ROOM_LEFT';
    roomId: string;
    roomCode?: string;
    hostId?: string;
    playerId?: string;
  };
}

// Error message
export interface ErrorMessage extends SignalingMessage {
  type: 'ERROR';
  payload: {
    error: string;
    code: number;
  };
}

// Network configuration
export interface NetworkConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
  bundlePolicy: RTCBundlePolicy;
  rtcpMuxPolicy: RTCRtcpMuxPolicy;
  iceCandidatePoolSize: number;
}

// Data channel configuration
export interface DataChannelConfig {
  ordered: boolean;
  maxRetransmits?: number;
  maxPacketLifeTime?: number;
  protocol?: string;
}

// Network events
export interface NetworkEvents {
  'connection:stateChanged': { peerId: string; state: ConnectionState };
  'connection:iceStateChanged': { peerId: string; state: ICEConnectionState };
  'connection:dataChannelStateChanged': { peerId: string; state: DataChannelState };
  'connection:message': { peerId: string; message: any };
  'connection:error': { peerId: string; error: Error };
  'signaling:message': SignalingMessage;
  'signaling:error': Error;
}

// Type guards
export function isOfferMessage(message: SignalingMessage): message is OfferMessage {
  return message.type === 'OFFER' && message.payload?.offer;
}

export function isAnswerMessage(message: SignalingMessage): message is AnswerMessage {
  return message.type === 'ANSWER' && message.payload?.answer;
}

export function isICECandidateMessage(message: SignalingMessage): message is ICECandidateMessage {
  return message.type === 'ICE_CANDIDATE' && message.payload?.candidate;
}

export function isRoomUpdateMessage(message: SignalingMessage): message is RoomUpdateMessage {
  return message.type === 'ROOM_UPDATE' && message.payload?.action;
}

export function isErrorMessage(message: SignalingMessage): message is ErrorMessage {
  return message.type === 'ERROR' && message.payload?.error;
}

// Utility functions
export function createSignalingMessage(
  type: SignalingMessage['type'],
  from: string,
  to: string,
  payload: any
): SignalingMessage {
  return {
    type,
    from,
    to,
    payload,
    timestamp: Date.now()
  };
}

export function createOfferMessage(from: string, to: string, offer: RTCSessionDescriptionInit): OfferMessage {
  return createSignalingMessage('OFFER', from, to, { offer }) as OfferMessage;
}

export function createAnswerMessage(from: string, to: string, answer: RTCSessionDescriptionInit): AnswerMessage {
  return createSignalingMessage('ANSWER', from, to, { answer }) as AnswerMessage;
}

export function createICECandidateMessage(from: string, to: string, candidate: RTCIceCandidateInit): ICECandidateMessage {
  return createSignalingMessage('ICE_CANDIDATE', from, to, { candidate }) as ICECandidateMessage;
}

export function createRoomUpdateMessage(
  from: string,
  to: string,
  action: RoomUpdateMessage['payload']['action'],
  roomId: string,
  additionalData?: Partial<RoomUpdateMessage['payload']>
): RoomUpdateMessage {
  return createSignalingMessage('ROOM_UPDATE', from, to, {
    action,
    roomId,
    ...additionalData
  }) as RoomUpdateMessage;
}
