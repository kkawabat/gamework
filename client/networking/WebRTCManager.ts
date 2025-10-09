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
    console.log('initiating connection with', peerId);
    const connection = new RTCPeerConnection(this.config.rtcConfig as RTCConfiguration);

    const dataChannel = connection.createDataChannel('game', this.config.dataChannelConfig);
    
    let player = {
      id: peerId,
      connection: connection,
      dataChannel: dataChannel,
      isConnected: false,
      queuedCandidates: []
    } as Player;

    this.setupDataChannel(dataChannel, player);
    this.setupConnectionHandlers(connection, player);

    this.networkEngine.gameWork.addConnectedPlayer(player);

    await this.sendOffer(player);
  }

  /**
   * Internal ICE candidate handler
   */
  private onIceCandidate = (peerId: string, candidate: RTCIceCandidateInit) => {
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
    console.log('Offer sent to', peerId);
    
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

    this.setupConnectionHandlers(connection, this.host);

    connection.ondatachannel = (event) => {
      this.host!.dataChannel = event.channel;
      this.setupDataChannel(event.channel, this.host!);
    };

    await connection.setRemoteDescription(offer);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    this.processQueuedIceCandidates(this.host!);
    console.log('Offer received from', peerId, 'and answer sent' );
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
    console.log('Answer received from', peerId, 'and remote description set' );
  }

  async handleIceCandidate(msg: iceCandidateMessage): Promise<void> {
    const peerId = msg.from;
    const candidate = msg.payload.candidate;
    
    
    let peer: Player | undefined;
    if (this.host?.id === peerId) {
      peer = this.host;
    } else {
      peer = this.room?.players.get(peerId);
    }

    if (peer?.connection) {
      await peer.connection.addIceCandidate(candidate);
    } else {
      console.log('ICE candidate received from', peerId, 'and added to queue' );
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
    if (player?.connection) {
      if (player.dataChannel) {
        player.dataChannel.close();
      }
      player.connection.close();
      
      // Update player state
      player.connection = undefined;
      player.dataChannel = undefined;
      player.isConnected = false;
      
      // Notify NetworkEngine of connection change via direct method call
      this.networkEngine.handleConnectionChange(peerId, false);
    }
  }

  disconnectAll(): void {
    this.room?.players.forEach((player) => {
      if (player.dataChannel) {
        player.dataChannel.close();
      }
      if (player.connection) {
        player.connection.close();
      }
      // Update player state
      player.connection = undefined;
      player.dataChannel = undefined;
      player.isConnected = false;
    });
  }

  getConnectedPeers(): string[] {
    return Array.from(this.room?.players.entries() || [])
      .filter(([_, player]) => player.isConnected)
      .map(([peerId, _]) => peerId);
  }

  isPeerConnected(peerId: string): boolean {
    return this.room?.players.get(peerId)?.isConnected || false;
  }

  private setupDataChannel(dataChannel: RTCDataChannel, peer: Player): void {
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
        console.error('Failed to parse message:', error);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error for peer ${peer.id}:`, error);
    };
  }

  private setupConnectionHandlers(connection: RTCPeerConnection, peer: Player): void {
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(peer.id, event.candidate);
      }
    };

    connection.oniceconnectionstatechange = () => {
      const wasConnected = peer.isConnected;
      peer.isConnected = connection.iceConnectionState === 'connected';
      
      if (wasConnected !== peer.isConnected) {
        // Notify NetworkEngine of connection change via direct method call
        this.networkEngine.handleConnectionChange(peer.id, peer.isConnected);
      }
    };

    connection.onconnectionstatechange = () => {
      
      // When connection becomes ready, process any queued ICE candidates
      if (connection.connectionState === 'connecting' && this.host?.connection) {
        this.processQueuedIceCandidates(peer);
      }
      
      // Handle connection established
      if (connection.connectionState === 'connected') {
        peer.isConnected = true;
      }
    };

    connection.onicegatheringstatechange = () => {};
  }
}

