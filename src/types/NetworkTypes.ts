export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed'
}

export enum ICEConnectionState {
  NEW = 'new',
  CHECKING = 'checking',
  CONNECTED = 'connected',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DISCONNECTED = 'disconnected',
  CLOSED = 'closed'
}

export enum DataChannelState {
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed'
}

/**
 * Which of a peer's two data channels a message takes.
 *
 * `reliable` is ordered and retransmits until delivered: control messages and
 * game moves must arrive, because losing one desyncs a replicated game or
 * hangs a lobby with no retry anywhere.
 *
 * `unreliable` is unordered and never retransmits: for high-rate streams of
 * absolute state, where a dropped frame is corrected by the next one 33ms later
 * and a retransmit would only delay it behind stale data.
 */
export type Delivery = 'reliable' | 'unreliable';

export interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  /** The unreliable sibling. Null until it opens; senders fall back to `dataChannel`. */
  fastChannel: RTCDataChannel | null;
  state: ConnectionState;
  iceState: ICEConnectionState;
  dataChannelState: DataChannelState;
  lastSeen: number;
}

export type NetworkConfig = RTCConfiguration;

export interface DataChannelConfig {
  ordered: boolean;
  maxRetransmits?: number;
  maxPacketLifeTime?: number;
  protocol?: string;
}

/** Channel labels. The answerer tells the two apart by these. */
export const RELIABLE_CHANNEL = 'gamework';
export const UNRELIABLE_CHANNEL = 'gamework-fast';

/**
 * `maxRetransmits: 0` is what makes a channel lossy — omitting it entirely is
 * what makes one reliable. There is only one sensible unreliable setting, so it
 * is fixed here rather than being another thing a game has to get right.
 */
export const UNRELIABLE_CHANNEL_CONFIG: DataChannelConfig = { ordered: false, maxRetransmits: 0 };
