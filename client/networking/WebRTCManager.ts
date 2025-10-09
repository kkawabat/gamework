import { answerMessage, iceCandidateMessage, offerMessage, SignalingMessage, GameRoom } from '../../shared/signaling-types';
import { GameWorkConfig, Player, WebRTCConfig } from '../types';

export class WebRTCManager {

  private iceCandidateQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private room?: GameRoom;
  private networkEngine: any;
  private host?: Player;
  private config: WebRTCConfig;

  constructor(networkEngine: any) {
    this.networkEngine = networkEngine;
    this.config = networkEngine.gameWork.config.webrtcConfig;
  }

  setRoom(room: GameRoom): void {
    this.room = room;
  }

  /**
   * Initiate WebRTC connection with a peer
   */
  async initiateConnection(peerId: string): Promise<void> {
    console.log('[WEBRTC] initiating connection with', peerId);
    const connection = new RTCPeerConnection(this.config.rtcConfig as RTCConfiguration);

    const dataChannel = connection.createDataChannel('game', this.config.dataChannelConfig);
    
    let player = {
      id: peerId,
      connection: connection,
      dataChannel: dataChannel,
      isConnected: false,
      queuedCandidates: []
    } as Player;

    this.setupDataChannel(player);
    this.setupConnectionHandlers(player);

    this.networkEngine.gameWork.addConnectedPlayer(player);

    await this.sendOffer(player);
  }

  /**
   * Internal ICE candidate handler
   */
  private onIceCandidate = (peerId: string, candidate: RTCIceCandidateInit) => {
    console.log('[WEBRTC] ICE candidate received for peer', peerId);
    const iceMessage: SignalingMessage = {
      type: 'SignalingMessage',
      action: 'ice_candidate',
      from: this.networkEngine.id,
      payload: {
        to: peerId,
        candidate: candidate
      }
    } as SignalingMessage;
    this.networkEngine.signaling?.sendMessage(iceMessage);
  };

  async sendOffer(player: Player): Promise<void> {
    const connection = player.connection;
    const peerId = player.id;
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    
    const offerMessage: SignalingMessage = {
      type: 'SignalingMessage',
      action: 'offer',
      from: this.networkEngine.id,
      payload: {
        to: peerId,
        offer: offer
      }
    } as SignalingMessage;
    
    this.networkEngine.signaling.sendMessage(offerMessage);
    console.log('[WEBRTC] Offer sent to', peerId);
    
  }

  async handleOffer(msg: offerMessage): Promise<RTCSessionDescriptionInit> {
    const peerId = msg.from;
    const offer = msg.payload.offer;
    
    const connection = new RTCPeerConnection(this.config.rtcConfig as RTCConfiguration);

    this.host = { 
      id: peerId, 
      connection: connection,
      dataChannel: undefined,
      isConnected: false,
      queuedCandidates: []
    } as Player;

    this.setupConnectionHandlers(this.host);

    connection.ondatachannel = (event) => {
      this.host!.dataChannel = event.channel;
      this.setupDataChannel(this.host!);
    };

    await connection.setRemoteDescription(offer);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    this.processQueuedIceCandidates(this.host!);
    console.log('[WEBRTC] Offer received from', peerId, 'and answer sent' );
    return answer;
    
  }

  async handleAnswer(msg: answerMessage): Promise<void> {
    const peerId = msg.from;
    const answer = msg.payload.answer;
    const player = this.room?.players.get(peerId);
    if (!player?.connection) {
      throw new Error(`No connection found for peer ${peerId}`);
    }

    await player.connection.setRemoteDescription(answer);
    console.log('[WEBRTC] Answer received from', peerId, 'and remote description set' );
  }

  async handleIceCandidate(msg: iceCandidateMessage): Promise<void> {
    
    const peerId = msg.from;
    const candidate = msg.payload.candidate;
    
    
    let peer: Player | undefined;
    if (this.host?.id === peerId) {
      console.log('[WEBRTC] ICE candidate received from host', peerId);
      peer = this.host;
    } else {
      console.log('[WEBRTC] ICE candidate received from client', peerId);
      peer = this.room?.players.get(peerId);
    }

    if (peer?.connection) {
      console.log('[WEBRTC] Adding ICE candidate to connection');
      await peer.connection.addIceCandidate(candidate);
    } else {
      peer?.queuedCandidates.push(candidate)
    }
  }

  private async processQueuedIceCandidates(peer: Player): Promise<void> {
    for (const candidate of peer.queuedCandidates) {
      await peer.connection.addIceCandidate(candidate);
    }
    peer.queuedCandidates = [];
  }

  sendMessage(peerId: string, message: any): boolean {
    const player = this.room?.players.get(peerId);
    if (!player?.dataChannel || player.dataChannel.readyState !== 'open') {
      console.warn(`[WebRTCManager] Cannot send message to ${peerId}: connection not ready`);
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      player.dataChannel.send(messageStr);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  broadcastMessage(message: any, excludePeerId?: string): void {
    this.room?.players.forEach((player, peerId) => {
      if (peerId !== excludePeerId && player.isConnected) {
        this.sendMessage(peerId, message);
      }
    });
  }

  disconnectPeer(peerId: string): void {
    const player = this.room?.players.get(peerId);
    if (player!.dataChannel) {
      player!.dataChannel.close();
    }
    if (player!.connection) {
      player!.connection.close();
    } 
     
    this.networkEngine.gameWork.removeConnectedPlayer(peerId);
    this.networkEngine.handleConnectionChange(peerId, false);
  }

  disconnectAll(): void {
    // Get all player IDs before clearing the room
    const playerIds = Array.from(this.room?.players.keys() || []);
    
    // Close all WebRTC connections
    this.room?.players.forEach((player) => {
      if (player!.dataChannel) {
        player!.dataChannel.close();
      }
      if (player!.connection) {
        player!.connection.close();
      }
    });
    
    // Remove all players from room completely
    playerIds.forEach(playerId => {
      this.networkEngine.gameWork.removeConnectedPlayer(playerId);
    });
  }

  private setupDataChannel(peer: Player): void {
    const dataChannel: RTCDataChannel = peer.dataChannel;
    dataChannel.onopen = () => {
      peer.dataChannel = dataChannel;
      peer.isConnected = true;
      this.networkEngine.handleConnectionChange(peer.id, true);
    };

    dataChannel.onclose = () => {
      peer.isConnected = false;  
      this.networkEngine.handleConnectionChange(peer.id, false);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.networkEngine.handleDataChannelMessage(peer.id, message);
      } catch (error) {
        console.error('[WEBRTC] Failed to parse message:', error);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`[WEBRTC] Data channel error for peer ${peer.id}:`, error);
    };
  }

  private setupConnectionHandlers(peer: Player): void {
    const connection: RTCPeerConnection = peer.connection;
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(peer.id, event.candidate);
      }
    };

    connection.oniceconnectionstatechange = () => {
      console.log('[WEBRTC] ICE connection state for peer ', peer.id, ' changed to ', connection.iceConnectionState);
      this.processQueuedIceCandidates(peer);
      this.printStat(peer);
    };

    connection.onconnectionstatechange = () => {
      console.log('[WEBRTC] connection state for peer ', peer.id, ' changed to ', connection.connectionState);
      if (connection.connectionState === 'connecting') {
        this.processQueuedIceCandidates(peer);
        this.printStat(peer);
      }
      
      // Handle connection established
      if (connection.connectionState === 'connected') {
        peer.isConnected = true;
      }
      this.printStat(peer);
    };

    connection.onicegatheringstatechange = () => {};
  }

  private async printStat(peer: Player): Promise<void> {
    const pc = peer.connection;
    const stats = await pc.getStats();

    // Basic high-level state summary
    console.log(
      `[WEBRTC] Peer ${peer.id}:`,
      `ice=${pc.iceConnectionState},`,
      `conn=${pc.connectionState},`,
      `signaling=${pc.signalingState}`
    );

    let pair: RTCIceCandidatePairStats | undefined;

    stats.forEach((r: any) => {
      if (r.type === 'transport') {
        const transport = r as RTCTransportStats;
        if (transport.selectedCandidatePairId) {
          const candidatePair = stats.get(transport.selectedCandidatePairId);
          if (candidatePair?.type === 'candidate-pair') {
            pair = candidatePair as RTCIceCandidatePairStats;
          }
        }
      }
    });

    if (pair) {
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);

      console.log(
        `[WEBRTC] Pair:`,
        `${pair.state.toUpperCase()} |`,
        `${local?.candidateType ?? '?'}→${remote?.candidateType ?? '?'} (${local?.protocol ?? '?'}) |`,
        `rtt=${pair.currentRoundTripTime?.toFixed(3) ?? '–'}s |`,
        `sent=${pair.bytesSent ?? 0}B recv=${pair.bytesReceived ?? 0}B`
      );
    } else {
      // No selected pair found
      const transports = Array.from(stats.values()).filter((r: any) => r.type === 'transport');
      console.log(
        `[WEBRTC] No selected ICE pair yet (${transports.length} transport(s)). ICE=${pc.iceConnectionState}`
      );
    }
  }
}

