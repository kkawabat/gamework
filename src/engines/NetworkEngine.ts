import { NetworkMessage } from '../types/GameTypes';
import {
  ConnectionState,
  ICEConnectionState,
  DataChannelState,
  PeerConnection,
  NetworkConfig,
  DataChannelConfig
} from '../types/NetworkTypes';

export interface NetworkEngine {
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): void;
  sendMessage(peerId: string, message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
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
  abstract sendMessage(peerId: string, message: NetworkMessage): void;
  abstract broadcast(message: NetworkMessage): void;

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

    connection.ondatachannel = (event) => {
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

  protected sendDataChannelMessage(peerConnection: PeerConnection, message: NetworkMessage): void {
    const { dataChannel } = peerConnection;
    if (!dataChannel || dataChannel.readyState !== 'open') {
      throw new Error(`Data channel to ${peerConnection.id} not open`);
    }
    dataChannel.send(JSON.stringify(message));
  }

  protected cleanupConnection(peerId: string): void {
    const connection = this.connections.get(peerId);
    if (!connection) return;
    connection.dataChannel?.close();
    connection.connection.close();
    this.connections.delete(peerId);
  }
}
