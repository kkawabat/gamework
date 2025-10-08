import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import { Player, GameRoom, SignalingMessage, answerMessage, offerMessage, iceCandidateMessage } from '../../shared/signaling-types';
import { v4 as uuidv4 } from 'uuid';
import { PlayerAction, StateChange } from '../events/EventFlow';

export class NetworkEngine {
  private webrtc: WebRTCManager;
  private signaling: SignalingService | null = null;
  private id: string = '';
  protected gameWork: any;

  constructor(gameWork: any) {
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
      this.webrtc.sendMessage(room.hostId, action);
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
    
    if (this.webrtc && room?.hostId) {
      this.webrtc.sendMessage(room.hostId, payload);
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
        this.signaling?.sendMessage(createRoomMessage);
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
        this.signaling?.sendMessage(joinRoomMessage);
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
          this.handleSignalingMessages(message);
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
          hostId: this.id,
          players: new Map([[this.id, {id: this.id, isHost: true}]]),
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
        if (room?.hostId === this.id) {
          // Host leaving - disconnect all and clear room
          this.webrtc?.disconnectAll();
          this.gameWork.handleRoomUpdate(undefined as any);
        }
        break;
    }
  }


  /**
   * Handle WebRTC signaling messages
   */
  private async handleSignalingMessages(message: SignalingMessage): Promise<void> {
    switch (message.action) {
      case 'offer':
        
        const answer = await this.webrtc?.handleOffer(message as offerMessage);
        let msg =  {
          type: 'SignalingMessage',
          action: 'answer',
          from: this.id,
          payload: {
            to: message.from,
            answer: answer
          }
        } as answerMessage;
        await this.signaling?.sendMessage(msg);
        break;
      case 'answer':
        await this.webrtc?.handleAnswer(message as answerMessage);
        break;
      case 'ice_candidate':
        await this.webrtc?.handleIceCandidate(message as iceCandidateMessage);
        break;
    }
  }
}
