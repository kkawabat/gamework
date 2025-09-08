import { WebRTCManager } from '../networking/WebRTCManager';
import { SignalingService, InMemorySignalingService } from '../networking/SignalingService';
import { 
  GameState, 
  GameMove, 
  GameMessage, 
  ClientConfig,
  SignalingMessage,
  Player
} from '../types';
import { v4 as uuidv4 } from 'uuid';

export class GameClient {
  private webrtc: WebRTCManager;
  private signaling: SignalingService;
  private config: ClientConfig;
  private playerId: string;
  private roomId: string;
  private isConnected = false;
  private currentState?: GameState;
  private hostConnection?: RTCPeerConnection;

  // Event callbacks
  private onStateUpdate?: (state: GameState) => void;
  private onConnect?: () => void;
  private onDisconnect?: () => void;
  private onError?: (error: Error) => void;
  private onPlayerJoin?: (player: Player) => void;
  private onPlayerLeave?: (playerId: string) => void;

  constructor(config: ClientConfig, signalingService?: SignalingService) {
    this.config = config;
    this.signaling = signalingService || new InMemorySignalingService();
    this.playerId = uuidv4();
    this.roomId = config.roomId;
    
    // Initialize WebRTC manager
    this.webrtc = new WebRTCManager(config.stunServers);
    
    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Client is already connected');
    }

    try {
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.roomId, this.playerId);
      
      // Send join message to host
      await this.sendJoinMessage();
      
      this.isConnected = true;
      console.log(`Game client connected to room: ${this.roomId}`);
      
      if (this.onConnect) {
        this.onConnect();
      }
      
    } catch (error) {
      console.error('Failed to connect game client:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      // Disconnect WebRTC
      this.webrtc.disconnectAll();
      
      // Leave signaling room
      await this.signaling.leaveRoom(this.roomId, this.playerId);
      this.signaling.disconnect();
      
      this.isConnected = false;
      console.log('Game client disconnected');
      
      if (this.onDisconnect) {
        this.onDisconnect();
      }
      
    } catch (error) {
      console.error('Error disconnecting game client:', error);
    }
  }

  // Game actions
  sendMove(moveType: string, moveData: any): boolean {
    if (!this.isConnected) {
      return false;
    }

    const move: GameMove = {
      type: moveType,
      playerId: this.playerId,
      timestamp: Date.now(),
      data: moveData
    };

    const inputMessage: GameMessage = {
      type: 'input',
      payload: move,
      timestamp: Date.now(),
      messageId: uuidv4()
    };

    this.webrtc.broadcastMessage(inputMessage);
    return true;
  }

  requestResync(): void {
    if (!this.isConnected) {
      return;
    }

    const resyncMessage: GameMessage = {
      type: 'resync',
      payload: {
        playerId: this.playerId,
        lastKnownVersion: this.currentState?.version || 0
      },
      timestamp: Date.now(),
      messageId: uuidv4()
    };

    this.webrtc.broadcastMessage(resyncMessage);
  }

  // State access
  getCurrentState(): GameState | undefined {
    return this.currentState ? { ...this.currentState } : undefined;
  }

  getGameVersion(): number {
    return this.currentState?.version || 0;
  }

  // Event handlers
  setStateUpdateHandler(handler: (state: GameState) => void): void {
    this.onStateUpdate = handler;
  }

  setConnectHandler(handler: () => void): void {
    this.onConnect = handler;
  }

  setDisconnectHandler(handler: () => void): void {
    this.onDisconnect = handler;
  }

  setErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  setPlayerJoinHandler(handler: (player: Player) => void): void {
    this.onPlayerJoin = handler;
  }

  setPlayerLeaveHandler(handler: (playerId: string) => void): void {
    this.onPlayerLeave = handler;
  }

  // Private methods
  private setupEventHandlers(): void {
    // WebRTC message handling
    this.webrtc.setMessageHandler((peerId, message) => {
      this.handlePeerMessage(peerId, message);
    });

    this.webrtc.setConnectionChangeHandler((peerId, isConnected) => {
      this.handlePeerConnectionChange(peerId, isConnected);
    });

    // Signaling service message handling
    this.signaling.onMessage((message) => {
      this.handleSignalingMessage(message);
    });

    this.signaling.onError((error) => {
      if (this.onError) {
        this.onError(error);
      }
    });
  }

  private async handlePeerMessage(peerId: string, message: GameMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'state':
          this.handleStateUpdate(message.payload);
          break;
          
        case 'player_join':
          if (this.onPlayerJoin) {
            this.onPlayerJoin(message.payload);
          }
          break;
          
        case 'player_leave':
          if (this.onPlayerLeave) {
            this.onPlayerLeave(message.payload.playerId);
          }
          break;
          
        case 'error':
          console.error('Received error from host:', message.payload);
          if (this.onError) {
            this.onError(new Error(message.payload.message));
          }
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling peer message:', error);
    }
  }

  private handleStateUpdate(stateData: any): void {
    const { state, isFullSnapshot } = stateData;
    
    // Update current state
    this.currentState = state;
    
    // Notify callback
    if (this.onStateUpdate) {
      this.onStateUpdate(state);
    }
    
    console.log(`State updated (${isFullSnapshot ? 'full' : 'partial'}): version ${state.version}`);
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'offer':
          // This is from the host, we need to create an answer
          const answer = await this.webrtc.handleOffer(message.from, message.payload);
          await this.signaling.sendMessage({
            type: 'answer',
            payload: answer,
            from: this.playerId,
            to: message.from,
            roomId: this.roomId
          });
          break;
          
        case 'ice_candidate':
          await this.webrtc.handleIceCandidate(message.from, message.payload);
          break;
          
        default:
          console.warn('Unknown signaling message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  private handlePeerConnectionChange(peerId: string, isConnected: boolean): void {
    console.log(`Peer ${peerId} connection changed: ${isConnected ? 'connected' : 'disconnected'}`);
    
    if (!isConnected && this.isConnected) {
      // If we lose connection to the host, try to reconnect
      console.log('Lost connection to host, attempting to reconnect...');
      setTimeout(() => {
        if (this.isConnected) {
          this.requestResync();
        }
      }, 1000);
    }
  }

  private async sendJoinMessage(): Promise<void> {
    const joinMessage: GameMessage = {
      type: 'join',
      payload: {
        playerId: this.playerId,
        playerName: this.config.playerName,
        roomId: this.roomId
      },
      timestamp: Date.now(),
      messageId: uuidv4()
    };

    // We'll send this once we have a WebRTC connection to the host
    // For now, just log it
    console.log('Join message prepared:', joinMessage);
  }

  // Utility methods
  isConnectedToHost(): boolean {
    return this.isConnected && this.webrtc.getConnectedPeers().length > 0;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getRoomId(): string {
    return this.roomId;
  }
}

