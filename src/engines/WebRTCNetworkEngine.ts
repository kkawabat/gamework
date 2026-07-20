import { BaseNetworkEngine } from './NetworkEngine';
import { NetworkMessage } from '../types/GameTypes';
import { ConnectionState, NetworkConfig, DataChannelConfig, PeerConnection } from '../types/NetworkTypes';
import { ClientToServer, ServerToClient, SignalData, IceServerConfig } from '../../shared/signaling-types';

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
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

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
    const room = this.awaitRoom();
    this.sendRoomRequest({ type: 'CREATE_ROOM', playerId: this.playerId });
    return room;
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    const room = this.awaitRoom();
    this.sendRoomRequest({ type: 'JOIN_ROOM', playerId: this.playerId, roomCode });
    await room;
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

  /**
   * Drop the signaling connection but keep every peer connection open. Once the
   * data channels are up the server has no remaining part to play — it only ever
   * relays offers, answers and candidates — and an idle socket would otherwise
   * hold a Cloud Run instance billable for the whole game.
   *
   * One-way door: no peer can be dialed or re-dialed afterwards. That matches
   * what the demos already do, since none of them attempt an ICE restart.
   *
   * The server treats this bare close as silent — it never tells the remaining
   * peers we left — so dropping signaling here cannot tear down a live peer
   * connection. Only destroy() below announces a real departure.
   */
  closeSignaling(): void {
    this.socket?.close();
    this.socket = null;
  }

  destroy(): void {
    // Announce the departure while the socket is still open: unlike a bare
    // close, LEAVE_ROOM is what makes the server tell the other peers we are
    // gone so they can tear down their side. Best-effort — never throw here.
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'LEAVE_ROOM' } as ClientToServer));
    }
    this.connections.forEach((_, peerId) => this.cleanupConnection(peerId));
    this.closeSignaling();
    this.isInitialized = false;
  }

  private openSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.networkConfig.signalingServerUrl);
      socket.onopen = () => resolve(socket);
      socket.onerror = () => reject(new Error(`Could not connect to signaling server at ${this.networkConfig.signalingServerUrl}`));
      socket.onclose = () => this.rejectRoom(new Error('Signaling connection closed'));
      socket.onmessage = (event) => {
        // Catch per message: a rejected queue skips the callback of every later
        // .then, so one failure would silently end all signaling for this client.
        this.messageQueue = this.messageQueue
          .then(() => this.handleServerMessage(JSON.parse(event.data)))
          .catch((error) => console.error('[gamework] Failed to handle signaling message:', error));
      };
    });
  }

  private async handleServerMessage(message: ServerToClient): Promise<void> {
    switch (message.type) {
      case 'ROOM_CREATED':
        this.roomCode = message.roomCode;
        this.applyIceServers(message.iceServers);
        this.resolveRoom(message.roomCode);
        break;
      case 'ROOM_JOINED':
        this.roomCode = message.roomCode;
        // Must land before connect() below builds the first peer connection.
        this.applyIceServers(message.iceServers);
        // Resolve before dialing peers: a peer-connection failure must not leave the
        // room request pending forever (it blocks every later create/join).
        this.resolveRoom(message.roomCode);
        for (const peerId of message.peers) {
          try {
            await this.connect(peerId);
          } catch (error) {
            console.error(`Failed to start connection to peer ${peerId}:`, error);
          }
        }
        break;
      case 'PEER_JOINED':
        // Report only. The joiner dials us from its own ROOM_JOINED; offering
        // back from here would have both sides offering at once.
        this.notifyPeerJoined(message.peerId);
        break;
      case 'SIGNAL':
        await this.handleSignal(message.from, message.data);
        break;
      case 'PEER_LEFT':
        // Only fires for a deliberate LEAVE_ROOM now, so the peer really is gone
        // and tearing down its connection is correct. A peer that merely dropped
        // signaling after connecting no longer reaches here.
        this.cleanupConnection(message.peerId);
        break;
      case 'ERROR': {
        if (this.pendingRoom) this.rejectRoom(new Error(message.message));
        else console.error('[gamework] Signaling server error:', message.message);
        break;
      }
    }
  }

  private async handleSignal(from: string, data: SignalData): Promise<void> {
    switch (data.kind) {
      case 'offer': {
        const peer = this.setupPeer(from);
        await peer.connection.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        await this.drainCandidates(from);
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        this.sendToServer({ type: 'SIGNAL', to: from, data: { kind: 'answer', sdp: answer } });
        break;
      }
      case 'answer':
        await this.peer(from).connection.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        await this.drainCandidates(from);
        break;
      case 'ice': {
        const peer = this.connections.get(from);
        // A candidate can outrun the description it has to be added against.
        // Holding it beats throwing, which used to take the whole client down.
        if (!peer?.connection.remoteDescription) {
          const queued = this.pendingCandidates.get(from) ?? [];
          queued.push(data.candidate as RTCIceCandidateInit);
          this.pendingCandidates.set(from, queued);
          break;
        }
        await peer.connection.addIceCandidate(data.candidate as RTCIceCandidateInit);
        break;
      }
    }
  }

  /**
   * The signaling server is the source of truth for ICE servers: it holds the
   * TURN secret and mints the credentials, so nothing long-lived ships in the
   * bundle. The static config stays as the fallback for local dev.
   */
  private applyIceServers(iceServers: IceServerConfig[]): void {
    if (!iceServers?.length) return;
    this.config.iceServers = iceServers;
  }

  private async drainCandidates(peerId: string): Promise<void> {
    const queued = this.pendingCandidates.get(peerId);
    if (!queued) return;
    this.pendingCandidates.delete(peerId);
    for (const candidate of queued) {
      await this.peer(peerId).connection.addIceCandidate(candidate);
    }
  }

  protected cleanupConnection(peerId: string): void {
    this.pendingCandidates.delete(peerId);
    super.cleanupConnection(peerId);
  }

  private setupPeer(peerId: string): PeerConnection {
    const peer = this.createPeerConnection(peerId);
    this.setupConnectionHandlers(peer);
    peer.connection.onicecandidate = (event) => {
      // Candidates can still trickle in after signaling is closed. There is
      // nowhere to send them and the connection they would improve is already
      // up, so drop them rather than throw inside the event handler.
      if (event.candidate && this.socket) {
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

  private awaitRoom(timeoutMs: number = 10000): Promise<string> {
    if (this.pendingRoom) throw new Error('Room request already in progress');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRoom = null;
        reject(new Error('Room request timed out'));
      }, timeoutMs);
      this.pendingRoom = {
        resolve: (code: string) => { clearTimeout(timer); resolve(code); },
        reject: (error: Error) => { clearTimeout(timer); reject(error); }
      };
    });
  }

  private resolveRoom(roomCode: string): void {
    this.pendingRoom?.resolve(roomCode);
    this.pendingRoom = null;
  }

  private rejectRoom(error: Error): void {
    this.pendingRoom?.reject(error);
    this.pendingRoom = null;
  }

  private sendRoomRequest(message: ClientToServer): void {
    try {
      this.sendToServer(message);
    } catch (error) {
      this.rejectRoom(error as Error);
    }
  }

  private sendToServer(message: ClientToServer): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling socket is not open');
    }
    this.socket.send(JSON.stringify(message));
  }
}
