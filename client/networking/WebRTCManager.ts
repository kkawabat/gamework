import { answerMessage, iceCandidateMessage, offerMessage, SignalingMessage, GameRoom } from '../../shared/signaling-types';

export class WebRTCManager {
  private onDataChannelMessage?: (peerId: string, message: any) => void;
  private onConnectionChange?: (peerId: string, isConnected: boolean) => void;

  private stunServers: RTCIceServer[];
  private iceCandidateQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private room?: GameRoom;
  private networkEngine: any;
  private clientConnection?: RTCPeerConnection; // For client: single connection to host

  constructor(networkEngine: any) {
    this.networkEngine = networkEngine;
    this.stunServers = networkEngine.gameWork.config.stunServers;
  }

  setRoom(room: GameRoom): void {
    this.room = room;
  }

  /**
   * Initiate WebRTC connection with a peer
   */
  async initiateConnection(peerId: string): Promise<void> {
    try {
      console.log('[WebRTCManager] INITIATING CONNECTION - Creating offer for peer:', peerId);
      const offer = await this.createOffer(peerId);
      
      // Send offer via signaling service
      const offerMessage: SignalingMessage = {
        type: 'SignalingMessage',
        action: 'offer',
        from: this.networkEngine.owner.id,
        payload: {
          to: peerId,
          offer: offer
        }
      } as SignalingMessage;
      
      console.log('[WebRTCManager] INITIATING CONNECTION - Sending offer to peer:', peerId);
      this.networkEngine.signaling?.sendMessage(offerMessage);
    } catch (error) {
      console.error('[WebRTCManager] Error creating offer:', error);
    }
  }

  /**
   * Internal ICE candidate handler
   */
  private onIceCandidate = (peerId: string, candidate: RTCIceCandidateInit) => {
    console.log('[WebRTCManager] SENDING ICE CANDIDATE to peer:', peerId, candidate.candidate);
    const iceMessage: SignalingMessage = {
      type: 'SignalingMessage',
      action: 'ice_candidate',
      from: this.networkEngine.owner.id,
      payload: {
        to: peerId,
        candidate: candidate
      }
    } as SignalingMessage;
    this.networkEngine.signaling?.sendMessage(iceMessage);
  };

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const connection = new RTCPeerConnection({
      iceServers: this.stunServers
    });

    const dataChannel = connection.createDataChannel('game', {
      ordered: true
    });

    this.setupDataChannel(dataChannel, peerId);
    this.setupConnectionHandlers(connection, peerId);

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    // Update player in room instead of connections map
    const player = this.room?.players.get(peerId);
    if (player) {
      player.connection = connection;
      player.dataChannel = dataChannel;
      player.isConnected = false;
    }

    // Process any queued ICE candidates for this peer
    this.processQueuedIceCandidates(peerId);

    return offer;
  }

  async handleAnswer(msg: answerMessage): Promise<void> {
    const peerId = msg.from;
    const answer = msg.payload.answer;
    const player = this.room?.players.get(peerId);
    if (!player?.connection) {
      throw new Error(`No connection found for peer ${peerId}`);
    }

    await player.connection.setRemoteDescription(answer);
  }

  async handleOffer(msg: offerMessage): Promise<RTCSessionDescriptionInit> {
    const peerId = msg.from;
    const offer = msg.payload.offer;
    const connection = new RTCPeerConnection({
      iceServers: this.stunServers
    });

    this.setupConnectionHandlers(connection, peerId);

    // Set up data channel event handler
    connection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
    };

    await connection.setRemoteDescription(offer);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    // Client: Store the connection to host (no player management here)
    this.clientConnection = connection;
    console.log('[WebRTCManager] Client: WebRTC connection established with host');

    // Process any queued ICE candidates for this peer
    this.processQueuedIceCandidates(peerId);

    return answer;
  }

  async handleIceCandidate(msg: iceCandidateMessage): Promise<void> {
    const peerId = msg.from;
    const candidate = msg.payload.candidate;
    console.log(`[WebRTCManager] RECEIVED ICE CANDIDATE from ${peerId}:`, candidate.candidate);
    console.log(`[WebRTCManager] Received candidate type:`, candidate.type);
    console.log(`[WebRTCManager] Received candidate protocol:`, candidate.protocol);
    
    // Client: Use the stored connection to host
    if (!this.clientConnection) {
      console.log(`[WebRTCManager] Client: Queuing ICE candidate (connection not ready)`);
      if (!this.iceCandidateQueue.has(peerId)) {
        this.iceCandidateQueue.set(peerId, []);
      }
      this.iceCandidateQueue.get(peerId)!.push(candidate);
      return;
    }

    try {
      await this.clientConnection.addIceCandidate(candidate);
      console.log(`[WebRTCManager] SUCCESSFULLY ADDED ICE CANDIDATE for host`);
    } catch (error) {
      console.error(`[WebRTCManager] ERROR ADDING ICE CANDIDATE for host:`, error);
    }
  }

  private async processQueuedIceCandidates(peerId: string): Promise<void> {
    const queuedCandidates = this.iceCandidateQueue.get(peerId);
    if (!queuedCandidates || queuedCandidates.length === 0) {
      return;
    }

    console.log(`[WebRTCManager] Processing ${queuedCandidates.length} queued ICE candidates for peer ${peerId}`);
    
    // Client: Use stored connection to host
    if (!this.clientConnection) {
      console.warn(`[WebRTCManager] No client connection found when processing queued candidates`);
      return;
    }

    // Process all queued ICE candidates
    for (const candidate of queuedCandidates) {
      try {
        await this.clientConnection.addIceCandidate(candidate);
        console.log(`[WebRTCManager] Processed queued ICE candidate for host`);
      } catch (error) {
        console.error(`[WebRTCManager] Failed to process queued ICE candidate for host:`, error);
      }
    }

    // Clear the queue for this peer
    this.iceCandidateQueue.delete(peerId);
  }

  sendMessage(peerId: string, message: any): boolean {
    const player = this.room?.players.get(peerId);
    if (!player?.dataChannel || player.dataChannel.readyState !== 'open') {
      console.warn(`[WebRTCManager] Cannot send message to ${peerId}: connection not ready`);
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      console.log(`[WebRTCManager] Sending message to ${peerId}:`, message.type || 'unknown', message);
      player.dataChannel.send(messageStr);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  broadcastMessage(message: any, excludePeerId?: string): void {
    console.log(`[WebRTCManager] Broadcasting message to ${this.room?.players.size || 0} connections`);
    this.room?.players.forEach((player, peerId) => {
      console.log(`[WebRTCManager] Connection ${peerId}: connected=${player.isConnected}`);
      if (peerId !== excludePeerId && player.isConnected) {
        console.log(`[WebRTCManager] Sending message to ${peerId}`);
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
      
      if (this.onConnectionChange) {
        this.onConnectionChange(peerId, false);
      }
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

  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    dataChannel.onopen = () => {
      const player = this.room?.players.get(peerId);
      if (player) {
        player.dataChannel = dataChannel;
        player.isConnected = true;
        
        if (this.onConnectionChange) {
          this.onConnectionChange(peerId, true);
        }
      }
    };

    dataChannel.onclose = () => {
      const player = this.room?.players.get(peerId);
      if (player) {
        player.isConnected = false;
        
        if (this.onConnectionChange) {
          this.onConnectionChange(peerId, false);
        }
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`[WebRTCManager] Received message from ${peerId}:`, message.type || 'unknown', message);
        if (this.onDataChannelMessage) {
          this.onDataChannelMessage(peerId, message);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error for peer ${peerId}:`, error);
    };
  }

  private setupConnectionHandlers(connection: RTCPeerConnection, peerId: string): void {
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTCManager] ICE CANDIDATE GENERATED for ${peerId}:`, event.candidate.candidate);
        console.log(`[WebRTCManager] Candidate type:`, event.candidate.type);
        console.log(`[WebRTCManager] Candidate protocol:`, event.candidate.protocol);
        this.onIceCandidate(peerId, event.candidate);
      }
    };

    connection.oniceconnectionstatechange = () => {
      console.log(`[WebRTCManager] ICE CONNECTION STATE CHANGE for ${peerId}:`, connection.iceConnectionState);
      console.log(`[WebRTCManager] ICE gathering state:`, connection.iceGatheringState);
      console.log(`[WebRTCManager] Connection state:`, connection.connectionState);
      
      const player = this.room?.players.get(peerId);
      if (player) {
        const wasConnected = player.isConnected;
        player.isConnected = connection.iceConnectionState === 'connected';
        
        if (wasConnected !== player.isConnected && this.onConnectionChange) {
          this.onConnectionChange(peerId, player.isConnected);
        }
      }
    };

    connection.onconnectionstatechange = () => {
      console.log(`Connection state for peer ${peerId}:`, connection.connectionState);
    };

    connection.onicegatheringstatechange = () => {
      console.log(`[WebRTCManager] ICE GATHERING STATE for peer ${peerId}:`, connection.iceGatheringState);
      if (connection.iceGatheringState === 'complete') {
        console.log(`[WebRTCManager] ICE GATHERING COMPLETE for peer ${peerId}`);
      }
    };
  }
}

