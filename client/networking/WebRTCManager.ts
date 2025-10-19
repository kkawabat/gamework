import { answerMessage, iceCandidateMessage, offerMessage, SignalingMessage, GameRoom } from '../../shared/signaling-types';
import { WebRTCConfig } from '../types';
import { Peer } from '../../shared/signaling-types';
import { NetworkEngine } from './NetworkEngine';

export class WebRTCManager {

  private room?: GameRoom;
  private networkEngine: NetworkEngine;
  private config: WebRTCConfig;

  constructor(networkEngine: NetworkEngine) {
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
    
    let peer = {
      id: peerId,
      connection: connection,
      dataChannel: dataChannel,
      isConnected: false,
      remoteSet: false,
      queuedCandidates: [],
      isHost: false,
    } as Peer;

    this.setupDataChannel(peer);
    this.setupConnectionHandlers(peer);

    this.networkEngine.gameWork.addConnectedPlayer(peer);

    await this.sendOffer(peer);
  }

  /**
   * Internal ICE candidate handler
   */
  private onIceCandidate = (peerId: string, candidate: RTCIceCandidateInit | null) => {
    console.log('[WEBRTC] ICE candidate generated for peer', peerId);
    const iceMessage: SignalingMessage = {
      type: 'SignalingMessage',
      action: 'ice_candidate',
      from: this.networkEngine.id,
      payload: {
        to: peerId,
        candidate: candidate
      }
    } as SignalingMessage;
    this.networkEngine.sendSignalingMessage(iceMessage);
  };

  async sendOffer(peer: Peer): Promise<void> {
    const connection = peer.connection;
    const peerId = peer.id;
    const offer = await connection?.createOffer();
    await connection?.setLocalDescription(offer);
    
    const offerMessage: SignalingMessage = {
      type: 'SignalingMessage',
      action: 'offer',
      from: this.networkEngine.id,
      payload: {
        to: peerId,
        offer: offer
      }
    } as SignalingMessage;
    
    this.networkEngine.sendSignalingMessage(offerMessage);
    console.log('[WEBRTC] Offer sent to', peerId);
    
  }

  async handleOffer(msg: offerMessage): Promise<void> {
    const peerId = msg.from;
    const offer = msg.payload.offer;
    
    const connection = new RTCPeerConnection(this.config.rtcConfig as RTCConfiguration);

    const host = { 
      id: peerId, 
      connection: connection,
      dataChannel: undefined,
      isConnected: false,
      isHost: true,
      queuedCandidates: [],
      remoteSet: false,
    } as Peer;

    this.networkEngine.gameWork.addConnectedPlayer(host);

    this.setupConnectionHandlers(host);

    connection.ondatachannel = (event) => {
      host.dataChannel = event.channel;
      this.setupDataChannel(host);
    };

    await connection.setRemoteDescription(offer);
    host.remoteSet = true;
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    this.processQueuedIceCandidates(host);
    console.log('[WEBRTC] Offer received from', peerId, 'and answer sent' );

    let answerMessage =  {
      type: 'SignalingMessage',
      action: 'answer',
      from: this.networkEngine.id,
      payload: {
        to: msg.from,
        answer: answer
      }
    } as answerMessage;
    this.networkEngine.sendSignalingMessage(answerMessage);
  }

  async handleAnswer(msg: answerMessage): Promise<void> {
    const peerId = msg.from;
    const answer = msg.payload.answer;
    const player = this.room?.peers.get(peerId);
    if (!player?.connection) {
      throw new Error(`No connection found for peer ${peerId}`);
    }

    await player.connection.setRemoteDescription(answer);
    player.remoteSet = true;
    await this.processQueuedIceCandidates(player);
    console.log('[WEBRTC] Answer received from', peerId, 'and remote description set' );
  }

  async handleIceCandidate(msg: iceCandidateMessage): Promise<void> {
    
    const peerId = msg.from;
    const candidate = msg.payload.candidate;
    
    
    let peer: Peer | undefined;
    if (this.room?.host.id === peerId) {
      console.log('[WEBRTC] ICE candidate received from host', peerId);
      peer = this.room?.host;
    } else {
      console.log('[WEBRTC] ICE candidate received from client', peerId);
      peer = this.room?.peers.get(peerId);
    }
    if (peer?.remoteSet) {
      this.addIceCandidate(peer, candidate);
    } else {
      peer?.queuedCandidates?.push(candidate)
    }
  }

  private async processQueuedIceCandidates(peer: Peer): Promise<void> {
    for (const candidate of peer.queuedCandidates || []) {
      console.log('[WEBRTC] Processing queued ICE candidate', candidate);
      this.addIceCandidate(peer, candidate);
    }
    peer.queuedCandidates = [];
  }

  sendMessage(peerId: string, message: any): boolean {
    const player = this.room?.peers.get(peerId);
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
    this.room?.peers.forEach((peer, peerId) => {
      if (peerId !== excludePeerId && peer.isConnected) {
        this.sendMessage(peerId, message);
      }
    });
  }

  disconnectPeer(peerId: string): void {
    const player = this.room?.peers.get(peerId);
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
    const playerIds = Array.from(this.room?.peers.keys() || []);
    
    // Close all WebRTC connections
    this.room?.peers.forEach((peer) => {
      if (peer!.dataChannel) {
        peer!.dataChannel.close();
      }
      if (peer!.connection) {
        peer!.connection.close();
      }
    });
    
    // Remove all players from room completely
    playerIds.forEach(playerId => {
      this.networkEngine.gameWork.removeConnectedPlayer(playerId);
    });
  }

  private setupDataChannel(peer: Peer): void {
    const dataChannel: RTCDataChannel = peer.dataChannel!;
    dataChannel.onopen = () => {
      this.initOnReady(peer);
    };

    dataChannel.onclose = () => {};

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

  private setupConnectionHandlers(peer: Peer): void {
    const connection: RTCPeerConnection = peer.connection!;
    connection.onicecandidate = (event) => {
      console.log('[CONNECTION] ICE candidate', event);
      this.onIceCandidate(peer.id, event.candidate);
    };

    connection.oniceconnectionstatechange = () => {
      console.log('[WEBRTC] ICE connection state for peer ', peer.id, ' changed to ', connection.iceConnectionState);
      this.processQueuedIceCandidates(peer);
    };

    connection.onconnectionstatechange = () => {
      console.log('[WEBRTC] connection state for peer ', peer.id, ' changed to ', connection.connectionState);
      if (connection.connectionState === 'connecting') {
        this.processQueuedIceCandidates(peer);
      }
      
      // Handle connection established
      if (connection.connectionState === 'connected') {
        this.initOnReady(peer);
      }
    };

    connection.onicegatheringstatechange = () => {
      console.log('[WEBRTC] ICE gathering state for peer ', peer.id, ' changed to ', connection.iceGatheringState);
    };
  }

  public async handleSignalingMessages(message: SignalingMessage): Promise<void> {
    switch (message.action) {
      case 'offer':
        await this.handleOffer(message as offerMessage);
        break;
      case 'answer':
        await this.handleAnswer(message as answerMessage);
        break;
      case 'ice_candidate':
        await this.handleIceCandidate(message as iceCandidateMessage);
        break;
    }
  }

  private addIceCandidate(peer: Peer, candidate: RTCIceCandidateInit): void {
    if (candidate) {
      console.log('[WEBRTC] Adding ICE candidate to connection', candidate);
      console.log(
        `[ICE] rx mid=${candidate.sdpMid} idx=${candidate.sdpMLineIndex} ` +
        `midsNow=[${peer.connection!.getTransceivers().map((t: any)=>t.mid).join(',')}]`
      );
      peer.connection!.addIceCandidate(candidate);
    } else {
      console.log('[WEBRTC] end-of-candidates');
      peer.connection!.addIceCandidate({ candidate: '', sdpMid: '0' });
    }
  }

  private initOnReady(peer: Peer): void {
    const pcConnected = peer.connection?.connectionState === 'connected';
    const dcConnected = peer.dataChannel?.readyState === 'open';
    if (pcConnected && dcConnected) {
      peer.isConnected = true;
      
    }
  }
}

