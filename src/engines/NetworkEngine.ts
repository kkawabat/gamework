/**
 * NetworkEngine - Pure network communication for GameWork v2
 * 
 * Provides clean network management with:
 * - WebRTC connections
 * - Signaling server communication
 * - Message routing
 * - Connection state management
 */

import { NetworkMessage, GameRoom, Player } from '../types/GameTypes';
import { 
  ConnectionState, 
  ICEConnectionState, 
  DataChannelState, 
  PeerConnection,
  NetworkConfig,
  DataChannelConfig,
  SignalingMessage
} from '../types/NetworkTypes';

export interface NetworkEngine {
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): void;
  sendMessage(peerId: string, message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
  onMessage(callback: (peerId: string, message: NetworkMessage) => void): () => void;
  getConnectionState(peerId: string): ConnectionState;
  getConnections(): string[];
  isConnected(peerId: string): boolean;
}

export abstract class BaseNetworkEngine implements NetworkEngine {
  protected connections: Map<string, PeerConnection> = new Map();
  protected messageHandlers: Set<(peerId: string, message: NetworkMessage) => void> = new Set();
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

  getConnectionState(peerId: string): ConnectionState {
    const connection = this.connections.get(peerId);
    return connection?.state || ConnectionState.DISCONNECTED;
  }

  getConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  isConnected(peerId: string): boolean {
    const connection = this.connections.get(peerId);
    return connection?.state === ConnectionState.CONNECTED;
  }

  protected notifyMessageHandlers(peerId: string, message: NetworkMessage): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(peerId, message);
      } catch (error) {
        console.error('[NetworkEngine] Error in message handler:', error);
      }
    });
  }

  protected updateConnectionState(peerId: string, state: ConnectionState): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.state = state;
    }
  }

  protected updateICEConnectionState(peerId: string, state: ICEConnectionState): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.iceState = state;
    }
  }

  protected updateDataChannelState(peerId: string, state: DataChannelState): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.dataChannelState = state;
    }
  }

  protected createPeerConnection(peerId: string, isHost: boolean = false): PeerConnection {
    const connection = new RTCPeerConnection(this.config);
    
    const peerConnection: PeerConnection = {
      id: peerId,
      connection,
      dataChannel: null,
      state: ConnectionState.CONNECTING,
      iceState: ICEConnectionState.NEW,
      dataChannelState: DataChannelState.CONNECTING,
      isHost,
      lastSeen: Date.now()
    };

    this.connections.set(peerId, peerConnection);
    return peerConnection;
  }

  protected setupConnectionHandlers(peerConnection: PeerConnection): void {
    const { connection, id } = peerConnection;

    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState as ICEConnectionState;
      this.updateICEConnectionState(id, state);
      
      if (state === ICEConnectionState.CONNECTED || state === ICEConnectionState.COMPLETED) {
        this.updateConnectionState(id, ConnectionState.CONNECTED);
      } else if (state === ICEConnectionState.FAILED || state === ICEConnectionState.DISCONNECTED) {
        this.updateConnectionState(id, ConnectionState.FAILED);
      }
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState as ConnectionState;
      this.updateConnectionState(id, state);
    };

    connection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      peerConnection.dataChannel = dataChannel;
      this.setupDataChannelHandlers(peerConnection, dataChannel);
    };
  }

  protected setupDataChannelHandlers(peerConnection: PeerConnection, dataChannel: RTCDataChannel): void {
    const { id } = peerConnection;

    dataChannel.onopen = () => {
      this.updateDataChannelState(id, DataChannelState.OPEN);
    };

    dataChannel.onclose = () => {
      this.updateDataChannelState(id, DataChannelState.CLOSED);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as NetworkMessage;
        this.notifyMessageHandlers(id, message);
      } catch (error) {
        console.error('[NetworkEngine] Failed to parse message:', error);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`[NetworkEngine] Data channel error for peer ${id}:`, error);
    };
  }

  protected sendDataChannelMessage(peerConnection: PeerConnection, message: NetworkMessage): boolean {
    const { dataChannel } = peerConnection;
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn(`[NetworkEngine] Cannot send message to ${peerConnection.id}: data channel not ready`);
      return false;
    }

    try {
      dataChannel.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[NetworkEngine] Failed to send message to ${peerConnection.id}:`, error);
      return false;
    }
  }

  protected cleanupConnection(peerId: string): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      if (connection.dataChannel) {
        connection.dataChannel.close();
      }
      if (connection.connection) {
        connection.connection.close();
      }
      this.connections.delete(peerId);
    }
  }
}
