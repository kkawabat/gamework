import { answerMessage, iceCandidateMessage, offerMessage, SignalingMessage, GameRoom } from '../../shared/signaling-types';

export class WebRTCManager {
  private onDataChannelMessage?: (peerId: string, message: any) => void;
  private onConnectionChange?: (peerId: string, isConnected: boolean) => void;
  public onIceCandidate?: (peerId: string, candidate: RTCIceCandidateInit) => void;

  private stunServers: RTCIceServer[];
  private iceCandidateQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private room?: GameRoom;

  constructor(room: GameRoom, stunServers: RTCIceServer[] = []) {
    this.room = room;
    this.stunServers = stunServers;
  }

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

    // Update player in room instead of connections map
    const player = this.room?.players.get(peerId);
    if (player) {
      player.connection = connection;
      player.isConnected = false;
    }

    // Process any queued ICE candidates for this peer
    this.processQueuedIceCandidates(peerId);

    return answer;
  }

  async handleIceCandidate(msg: iceCandidateMessage): Promise<void> {
    const peerId = msg.from;
    const candidate = msg.payload.candidate;
    const player = this.room?.players.get(peerId);
    if (!player?.connection) {
      // Queue the ICE candidate for later processing
      console.log(`[WebRTCManager] Queuing ICE candidate for peer ${peerId} (connection not ready)`);
      if (!this.iceCandidateQueue.has(peerId)) {
        this.iceCandidateQueue.set(peerId, []);
      }
      this.iceCandidateQueue.get(peerId)!.push(candidate);
      return;
    }

    await player.connection.addIceCandidate(candidate);
  }

  private async processQueuedIceCandidates(peerId: string): Promise<void> {
    const queuedCandidates = this.iceCandidateQueue.get(peerId);
    if (!queuedCandidates || queuedCandidates.length === 0) {
      return;
    }

    console.log(`[WebRTCManager] Processing ${queuedCandidates.length} queued ICE candidates for peer ${peerId}`);
    
    const player = this.room?.players.get(peerId);
    if (!player?.connection) {
      console.warn(`[WebRTCManager] No connection found for peer ${peerId} when processing queued candidates`);
      return;
    }

    // Process all queued ICE candidates
    for (const candidate of queuedCandidates) {
      try {
        await player.connection.addIceCandidate(candidate);
        console.log(`[WebRTCManager] Processed queued ICE candidate for peer ${peerId}`);
      } catch (error) {
        console.error(`[WebRTCManager] Failed to process queued ICE candidate for peer ${peerId}:`, error);
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
        console.log('ICE candidate generated:', event.candidate);
        if (this.onIceCandidate) {
          this.onIceCandidate(peerId, event.candidate);
        }
      }
    };

    connection.oniceconnectionstatechange = () => {
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
  }
}

