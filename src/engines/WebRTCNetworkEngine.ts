import { BaseNetworkEngine } from './NetworkEngine';
import { NetworkMessage } from '../types/GameTypes';
import { ConnectionState, NetworkConfig, DataChannelConfig, PeerConnection } from '../types/NetworkTypes';
import { ClientToServer, ServerToClient, SignalData } from '../../shared/signaling-types';

export interface WebRTCNetworkEngineConfig extends NetworkConfig {
  signalingServerUrl: string;
}

export class WebRTCNetworkEngine extends BaseNetworkEngine {
  private networkConfig: WebRTCNetworkEngineConfig;
  private playerId: string;
  private socket: WebSocket | null = null;
  private roomCode: string = '';
  private pendingRoom: { resolve: (code: string) => void; reject: (error: Error) => void } | null = null;
  private messageQueue: Promise<void> = Promise.resolve();

  constructor(config: WebRTCNetworkEngineConfig, dataChannelConfig: DataChannelConfig, playerId: string) {
    super(config, dataChannelConfig);
    this.networkConfig = config;
    this.playerId = playerId;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.socket = await this.openSocket();
    this.isInitialized = true;
  }

  createRoom(): Promise<string> {
    this.sendToServer({ type: 'CREATE_ROOM', playerId: this.playerId });
    return this.awaitRoom();
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    this.sendToServer({ type: 'JOIN_ROOM', playerId: this.playerId, roomCode });
    await this.awaitRoom();
    return true;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  async connect(peerId: string): Promise<void> {
    const peer = this.setupPeer(peerId);
    peer.dataChannel = peer.connection.createDataChannel('gamework', this.dataChannelConfig);
    this.setupDataChannelHandlers(peer, peer.dataChannel);
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.sendToServer({ type: 'SIGNAL', to: peerId, data: { kind: 'offer', sdp: offer } });
  }

  disconnect(peerId: string): void {
    this.cleanupConnection(peerId);
  }

  sendMessage(peerId: string, message: NetworkMessage): void {
    this.sendDataChannelMessage(this.peer(peerId), message);
  }

  broadcast(message: NetworkMessage): void {
    this.connections.forEach(peer => {
      if (peer.state === ConnectionState.CONNECTED) {
        this.sendDataChannelMessage(peer, message);
      }
    });
  }

  destroy(): void {
    this.connections.forEach((_, peerId) => this.cleanupConnection(peerId));
    this.socket?.close();
    this.socket = null;
    this.isInitialized = false;
  }

  private openSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.networkConfig.signalingServerUrl);
      socket.onopen = () => resolve(socket);
      socket.onerror = () => reject(new Error(`Could not connect to signaling server at ${this.networkConfig.signalingServerUrl}`));
      socket.onmessage = (event) => {
        this.messageQueue = this.messageQueue.then(() => this.handleServerMessage(JSON.parse(event.data)));
      };
    });
  }

  private async handleServerMessage(message: ServerToClient): Promise<void> {
    switch (message.type) {
      case 'ROOM_CREATED':
        this.roomCode = message.roomCode;
        this.resolveRoom(message.roomCode);
        break;
      case 'ROOM_JOINED':
        this.roomCode = message.roomCode;
        for (const peerId of message.peers) {
          await this.connect(peerId);
        }
        this.resolveRoom(message.roomCode);
        break;
      case 'SIGNAL':
        await this.handleSignal(message.from, message.data);
        break;
      case 'PEER_LEFT':
        this.cleanupConnection(message.peerId);
        break;
      case 'ERROR': {
        const error = new Error(message.message);
        if (!this.pendingRoom) throw error;
        this.pendingRoom.reject(error);
        this.pendingRoom = null;
        break;
      }
    }
  }

  private async handleSignal(from: string, data: SignalData): Promise<void> {
    switch (data.kind) {
      case 'offer': {
        const peer = this.setupPeer(from);
        await peer.connection.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        this.sendToServer({ type: 'SIGNAL', to: from, data: { kind: 'answer', sdp: answer } });
        break;
      }
      case 'answer':
        await this.peer(from).connection.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        break;
      case 'ice':
        await this.peer(from).connection.addIceCandidate(data.candidate as RTCIceCandidateInit);
        break;
    }
  }

  private setupPeer(peerId: string): PeerConnection {
    const peer = this.createPeerConnection(peerId);
    this.setupConnectionHandlers(peer);
    peer.connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendToServer({ type: 'SIGNAL', to: peerId, data: { kind: 'ice', candidate: event.candidate.toJSON() } });
      }
    };
    return peer;
  }

  private peer(peerId: string): PeerConnection {
    const peer = this.connections.get(peerId);
    if (!peer) throw new Error(`No connection to peer ${peerId}`);
    return peer;
  }

  private awaitRoom(): Promise<string> {
    if (this.pendingRoom) throw new Error('Room request already in progress');
    return new Promise((resolve, reject) => {
      this.pendingRoom = { resolve, reject };
    });
  }

  private resolveRoom(roomCode: string): void {
    this.pendingRoom?.resolve(roomCode);
    this.pendingRoom = null;
  }

  private sendToServer(message: ClientToServer): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling socket is not open');
    }
    this.socket.send(JSON.stringify(message));
  }
}
