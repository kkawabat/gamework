import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import { GameRoom, SignalingMessage } from '../../shared/signaling-types';
import { PlayerAction, StateChange } from '../events/EventFlow';
import { GameWork } from '../GameWork';

export class NetworkEngine {
  private webrtc: WebRTCManager;
  private signaling: SignalingService | null = null;
  public id: string = '';
  public gameWork: GameWork;

  constructor(gameWork: GameWork) {
    this.gameWork = gameWork;
    this.webrtc = new WebRTCManager(this);
    // Defer initialization until GameWork is ready
  }

  /**
   * Initialize networking components after GameWork state is ready
   */
  initialize(): void {
    this.id = this.gameWork.id;
    this.signaling = new SignalingService(this.gameWork.config.signalServiceConfig);
    
    // Setup signaling message handlers
    this.setupSignalingHandlers();
  }

  getRoom(): GameRoom | undefined {
    return this.gameWork.getRoom();
  }

  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Update game state - called directly by GameWork
   */
  updateState(gameState: any): void {
    // Broadcast state changes to all connected peers
    const room = this.gameWork.getRoom();
    if (this.webrtc && room) {
      this.webrtc.broadcastMessage({
        type: 'stateChange',
        payload: gameState
      });
    }
  }

  /**
   * Update room information - called directly by GameWork
   */
  updateRoom(room: GameRoom, isHost: boolean): void {
    this.webrtc.setRoom(room);
  }

  /**
   * Process player action - called directly by GameWork
   */
  processPlayerAction(action: PlayerAction): void {
    // Send to host for processing
    const room = this.gameWork.getRoom();
    if (this.webrtc && room) {
      this.webrtc.sendMessage(room.host.id, action);
    }
  }

  sendSignalingMessage(message: SignalingMessage): void {
    this.signaling?.sendMessage(message);
  }

  /**
   * Handle connection state changes from WebRTCManager
   */
  handleConnectionChange(peerId: string, isConnected: boolean): void {
    console.log(`[NetworkEngine] Connection change: ${peerId} is ${isConnected ? 'connected' : 'disconnected'}`);
    
    // Update player connection state in GameWork
    const room = this.gameWork.getRoom();
    if (room) {
      const player = room.peers.get(peerId);
      if (player) {
        player.isConnected = isConnected;
      }
    }
  }

  /**
   * Handle data channel messages from WebRTCManager
   */
  handleDataChannelMessage(peerId: string, message: any): void {
    console.log(`[NetworkEngine] Received message from ${peerId}:`, message);
    
    // Process the message based on type
    if (message.type === 'stateChange') {
      // Handle state change from peer
      this.gameWork.updateGameState(message.payload);
    } else if (message.action) {
      // Handle player action from peer
      this.gameWork.processPlayerAction(message);
    }
  }

  async onSendPlayerAction(payload: PlayerAction): Promise<void> {
    
    // Only handle game actions (not room management)
    const gameActions = ['PlayerMove', 'RestartGame'];
    if (!gameActions.includes(payload.action)) {
      return;
    }
    
    // Send game actions to the host via WebRTC
    const room = this.gameWork.getRoom();
    
    if (this.webrtc && room?.host.id) {
      this.webrtc.sendMessage(room.host.id, payload);
    } else {
    }
  }
  async onReceivePlayerAction(paction: PlayerAction): Promise<void> {
    const action = paction.action;
    switch (action) {
      case 'CreateRoomRequest':
        console.log('sending CreateRoomRequest');
        const createRoomMessage: SignalingMessage = {
          type: 'RoomUpdate',
          action: action,
          from: paction.playerId,
          payload: {
            ...paction.input || {}
          }
        } as SignalingMessage;
        this.sendSignalingMessage(createRoomMessage);
        break;

      case 'JoinRoomRequest':
        console.log('sending JoinRoomRequest');
        const joinRoomMessage: SignalingMessage = {
          type: 'RoomUpdate',
          action: action,
          from: paction.playerId,
          payload: {
            ...paction.input || {}
          }
        } as SignalingMessage;
        this.sendSignalingMessage(joinRoomMessage);
        break;

      case 'LeaveRoomRequest':
        const room = this.gameWork.getRoom();
        this.gameWork.sendStateChange({
          type: 'system',
          action: 'LeaveRoom',
          payload: {
            roomId: room?.id,
            playerId: paction.playerId
          }
        });
        break;
      default:
        break;
    }
  }
  async onSendStateChange(schange: StateChange): Promise<void> {
    this.webrtc?.broadcastMessage(schange);
  }
  async onReceiveStateChange(schange: StateChange): Promise<void> {
    // NetworkEngine doesn't need to handle state changes in hybrid architecture
    // All internal communication is done via direct method calls
  }

  /**
   * Setup signaling message handlers for host-based room management
   */
  private setupSignalingHandlers(): void {
    
    this.signaling?.onMessage((message: any) => {
      switch (message.type) {
        case 'RoomUpdate':
          this.handleRoomUpdate(message);
          break;
        case 'SignalingMessage':
          this.webrtc?.handleSignalingMessages(message);
          break;
        default:
      }
    });
    
  }

  private handleRoomUpdate(message: SignalingMessage): void {
    
    switch (message.action) {
      case 'CreateRoom':
        console.log('receiving CreateRoom from server');
        // Server confirmed room creation - update GameWork state directly
        const newRoom = {
          id: message.payload.roomId,
          roomCode: message.payload.roomCode, // Store the server-generated room code
          host: {id: this.id, isHost: true},
          peers: new Map([[this.id, {id: this.id, isHost: true}]]),
        } as GameRoom;
        
        // Update GameWork state directly (hybrid architecture)
        this.gameWork.handleRoomUpdate(newRoom);
        break;
      case 'JoinRoom':
        console.log('receiving CreateRoom request from ', message.payload.playerId, ' through server');
        // Check if we're the host or client
        const isHost = this.id === message.payload.hostId;
        if (!isHost) { break;}
        
        // Host initiates WebRTC connection (creates offer)
        this.webrtc.initiateConnection(message.payload.playerId);
        
        break;
      case 'CloseRoomRequest':
        // Handle room closure directly
        const room = this.gameWork.getRoom();
        if (room?.host.id === this.id) {
          // Host leaving - disconnect all and clear room
          this.webrtc?.disconnectAll();
          this.gameWork.handleRoomUpdate(undefined as any);
        }
        break;
    }
  }
}
