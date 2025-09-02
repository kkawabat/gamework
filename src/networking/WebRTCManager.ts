import { ConnectionInfo, SignalingMessage } from '../types';

export class WebRTCManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private onDataChannelMessage?: (peerId: string, message: any) => void;
  private onConnectionChange?: (peerId: string, isConnected: boolean) => void;
  private stunServers: RTCIceServer[];

  constructor(stunServers: RTCIceServer[] = []) {
    this.stunServers = stunServers.length > 0 ? stunServers : [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }

  setMessageHandler(handler: (peerId: string, message: any) => void): void {
    this.onDataChannelMessage = handler;
  }

  setConnectionChangeHandler(handler: (peerId: string, isConnected: boolean) => void): void {
    this.onConnectionChange = handler;
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

    this.connections.set(peerId, {
      peerId,
      connection,
      dataChannel,
      isConnected: false
    });

    return offer;
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const connectionInfo = this.connections.get(peerId);
    if (!connectionInfo) {
      throw new Error(`No connection found for peer ${peerId}`);
    }

    await connectionInfo.connection.setRemoteDescription(answer);
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
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

    this.connections.set(peerId, {
      peerId,
      connection,
      isConnected: false
    });

    return answer;
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const connectionInfo = this.connections.get(peerId);
    if (!connectionInfo) {
      throw new Error(`No connection found for peer ${peerId}`);
    }

    await connectionInfo.connection.addIceCandidate(candidate);
  }

  sendMessage(peerId: string, message: any): boolean {
    const connectionInfo = this.connections.get(peerId);
    if (!connectionInfo?.dataChannel || connectionInfo.dataChannel.readyState !== 'open') {
      return false;
    }

    try {
      connectionInfo.dataChannel.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  broadcastMessage(message: any, excludePeerId?: string): void {
    this.connections.forEach((connectionInfo, peerId) => {
      if (peerId !== excludePeerId && connectionInfo.isConnected) {
        this.sendMessage(peerId, message);
      }
    });
  }

  disconnectPeer(peerId: string): void {
    const connectionInfo = this.connections.get(peerId);
    if (connectionInfo) {
      if (connectionInfo.dataChannel) {
        connectionInfo.dataChannel.close();
      }
      connectionInfo.connection.close();
      this.connections.delete(peerId);
      
      if (this.onConnectionChange) {
        this.onConnectionChange(peerId, false);
      }
    }
  }

  disconnectAll(): void {
    this.connections.forEach((connectionInfo) => {
      if (connectionInfo.dataChannel) {
        connectionInfo.dataChannel.close();
      }
      connectionInfo.connection.close();
    });
    this.connections.clear();
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, info]) => info.isConnected)
      .map(([peerId, _]) => peerId);
  }

  isPeerConnected(peerId: string): boolean {
    return this.connections.get(peerId)?.isConnected || false;
  }

  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    dataChannel.onopen = () => {
      const connectionInfo = this.connections.get(peerId);
      if (connectionInfo) {
        connectionInfo.dataChannel = dataChannel;
        connectionInfo.isConnected = true;
        
        if (this.onConnectionChange) {
          this.onConnectionChange(peerId, true);
        }
      }
    };

    dataChannel.onclose = () => {
      const connectionInfo = this.connections.get(peerId);
      if (connectionInfo) {
        connectionInfo.isConnected = false;
        
        if (this.onConnectionChange) {
          this.onConnectionChange(peerId, false);
        }
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
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
        // This would typically be sent through the signaling server
        // For now, we'll just log it
        console.log('ICE candidate generated:', event.candidate);
      }
    };

    connection.oniceconnectionstatechange = () => {
      const connectionInfo = this.connections.get(peerId);
      if (connectionInfo) {
        const wasConnected = connectionInfo.isConnected;
        connectionInfo.isConnected = connection.iceConnectionState === 'connected';
        
        if (wasConnected !== connectionInfo.isConnected && this.onConnectionChange) {
          this.onConnectionChange(peerId, connectionInfo.isConnected);
        }
      }
    };

    connection.onconnectionstatechange = () => {
      console.log(`Connection state for peer ${peerId}:`, connection.connectionState);
    };
  }
}

