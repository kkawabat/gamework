import { NetworkMessage } from '../types/GameTypes';
import {
  ConnectionState,
  ICEConnectionState,
  DataChannelState,
  Delivery,
  PeerConnection,
  NetworkConfig,
  DataChannelConfig,
  UNRELIABLE_CHANNEL
} from '../types/NetworkTypes';

export interface NetworkEngine {
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): void;
  sendMessage(peerId: string, message: NetworkMessage, delivery?: Delivery): void;
  broadcast(message: NetworkMessage, delivery?: Delivery): void;
  onMessage(callback: (peerId: string, message: NetworkMessage) => void): () => void;
  onPeerJoined(callback: (peerId: string) => void): () => void;
  onPeerConnected(callback: (peerId: string) => void): () => void;
  onPeerFailed(callback: (peerId: string) => void): () => void;
  getConnectionState(peerId: string): ConnectionState;
  getConnections(): string[];
  isConnected(peerId: string): boolean;
}

export abstract class BaseNetworkEngine implements NetworkEngine {
  protected connections: Map<string, PeerConnection> = new Map();
  protected messageHandlers: Set<(peerId: string, message: NetworkMessage) => void> = new Set();
  protected peerJoinedHandlers: Set<(peerId: string) => void> = new Set();
  protected peerConnectedHandlers: Set<(peerId: string) => void> = new Set();
  protected peerFailedHandlers: Set<(peerId: string) => void> = new Set();
  protected config: NetworkConfig;
  protected dataChannelConfig: DataChannelConfig;
  protected isInitialized: boolean = false;

  constructor(config: NetworkConfig, dataChannelConfig: DataChannelConfig) {
    this.config = config;
    this.dataChannelConfig = dataChannelConfig;
  }

  abstract connect(peerId: string): Promise<void>;
  abstract disconnect(peerId: string): void;
  abstract sendMessage(peerId: string, message: NetworkMessage, delivery?: Delivery): void;
  abstract broadcast(message: NetworkMessage, delivery?: Delivery): void;

  onMessage(callback: (peerId: string, message: NetworkMessage) => void): () => void {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }

  /** The signaling server saw the peer join. Its data channel may still be connecting. */
  onPeerJoined(callback: (peerId: string) => void): () => void {
    this.peerJoinedHandlers.add(callback);
    return () => this.peerJoinedHandlers.delete(callback);
  }

  /** The peer's data channel is open and ready to carry game messages. */
  onPeerConnected(callback: (peerId: string) => void): () => void {
    this.peerConnectedHandlers.add(callback);
    return () => this.peerConnectedHandlers.delete(callback);
  }

  /** The peer joined but no data channel could be established (usually NAT traversal). */
  onPeerFailed(callback: (peerId: string) => void): () => void {
    this.peerFailedHandlers.add(callback);
    return () => this.peerFailedHandlers.delete(callback);
  }

  protected notifyPeerJoined(peerId: string): void {
    this.peerJoinedHandlers.forEach(handler => handler(peerId));
  }

  getConnectionState(peerId: string): ConnectionState {
    return this.connections.get(peerId)?.state || ConnectionState.DISCONNECTED;
  }

  getConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  isConnected(peerId: string): boolean {
    return this.connections.get(peerId)?.state === ConnectionState.CONNECTED;
  }

  protected notifyMessageHandlers(peerId: string, message: NetworkMessage): void {
    this.messageHandlers.forEach(handler => handler(peerId, message));
  }

  protected createPeerConnection(peerId: string): PeerConnection {
    const peerConnection: PeerConnection = {
      id: peerId,
      connection: new RTCPeerConnection(this.config),
      dataChannel: null,
      fastChannel: null,
      state: ConnectionState.CONNECTING,
      iceState: ICEConnectionState.NEW,
      dataChannelState: DataChannelState.CONNECTING,
      lastSeen: Date.now()
    };
    this.connections.set(peerId, peerConnection);
    return peerConnection;
  }

  protected setupConnectionHandlers(peerConnection: PeerConnection): void {
    const { connection } = peerConnection;

    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState as ICEConnectionState;
      peerConnection.iceState = state;
      console.log(`[gamework] ICE ${peerConnection.id}: ${state}`);
      if (state === ICEConnectionState.CONNECTED || state === ICEConnectionState.COMPLETED) {
        peerConnection.state = ConnectionState.CONNECTED;
      } else if (state === ICEConnectionState.FAILED || state === ICEConnectionState.DISCONNECTED) {
        peerConnection.state = ConnectionState.FAILED;
        // 'disconnected' often recovers on its own, so only report the terminal state.
        if (state === ICEConnectionState.FAILED) this.peerFailedHandlers.forEach(handler => handler(peerConnection.id));
      }
    };

    // The offerer opens both channels; we receive them separately and tell
    // them apart by label. Only the reliable one is allowed to report the peer
    // as connected — firing that twice would have the session introduce itself
    // twice, and the unreliable channel may never open at all.
    connection.ondatachannel = (event) => {
      if (event.channel.label === UNRELIABLE_CHANNEL) {
        peerConnection.fastChannel = event.channel;
        this.setupFastChannelHandlers(peerConnection, event.channel);
        return;
      }
      peerConnection.dataChannel = event.channel;
      this.setupDataChannelHandlers(peerConnection, event.channel);
    };
  }

  protected setupDataChannelHandlers(peerConnection: PeerConnection, dataChannel: RTCDataChannel): void {
    dataChannel.onopen = () => {
      peerConnection.dataChannelState = DataChannelState.OPEN;
      peerConnection.state = ConnectionState.CONNECTED;
      this.peerConnectedHandlers.forEach(handler => handler(peerConnection.id));
    };
    dataChannel.onclose = () => {
      peerConnection.dataChannelState = DataChannelState.CLOSED;
    };
    dataChannel.onmessage = (event) => {
      this.notifyMessageHandlers(peerConnection.id, JSON.parse(event.data) as NetworkMessage);
    };
  }

  /** Carries only inbound traffic and its own open state; never connection state. */
  protected setupFastChannelHandlers(peerConnection: PeerConnection, channel: RTCDataChannel): void {
    channel.onmessage = (event) => {
      this.notifyMessageHandlers(peerConnection.id, JSON.parse(event.data) as NetworkMessage);
    };
  }

  /**
   * Falls back to the reliable channel whenever the unreliable one is not open
   * — it negotiates a moment later than its sibling, and a game that starts
   * streaming immediately should be slightly slower, not broken.
   */
  protected sendDataChannelMessage(
    peerConnection: PeerConnection,
    message: NetworkMessage,
    delivery: Delivery = 'reliable'
  ): void {
    const { dataChannel, fastChannel } = peerConnection;
    const preferred = delivery === 'unreliable' && fastChannel?.readyState === 'open'
      ? fastChannel
      : dataChannel;
    if (!preferred || preferred.readyState !== 'open') {
      throw new Error(`Data channel to ${peerConnection.id} not open`);
    }
    preferred.send(JSON.stringify(message));
  }

  protected cleanupConnection(peerId: string): void {
    const connection = this.connections.get(peerId);
    if (!connection) return;
    connection.dataChannel?.close();
    connection.fastChannel?.close();
    connection.connection.close();
    this.connections.delete(peerId);
  }
}
