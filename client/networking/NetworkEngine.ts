import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import { Player, GameRoom, SignalingMessage, answerMessage, offerMessage, iceCandidateMessage } from '../../shared/signaling-types';
import { v4 as uuidv4 } from 'uuid';
import { PlayerAction, StateChange } from '../events/EventFlow';

export class NetworkEngine {
  private webrtc: WebRTCManager | null = null;
  private signaling: SignalingService;
  private owner: Player;
  protected gameWork: any;

  constructor(gameWork: any) {
    this.gameWork = gameWork;
    this.owner = gameWork.getOwner();
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
    // Initialize WebRTC if not already done
    if (!this.webrtc) {
      this.webrtc = new WebRTCManager(room, this.gameWork.config.stunServers);
    }
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
    console.log('[NetworkEngine] Sending player action:', payload.action);
    // send to the host of the room for processing
    const room = this.gameWork.getRoom();
    this.webrtc?.sendMessage(room?.hostId || "", payload);
  }
  async onReceivePlayerAction(paction: PlayerAction): Promise<void> {
    console.log('[NetworkEngine] Received player action:', paction.action);
    const action = paction.action;
    switch (action) {
      case 'CreateRoomRequest':
        const createRoomMessage: SignalingMessage = {
          type: 'RoomUpdate',
          action: action,
          from: paction.playerId,
          payload: {
            ...paction.input || {}
          }
        } as SignalingMessage;
        this.signaling.sendMessage(createRoomMessage);
        break;

      case 'JoinRoomRequest':
        const joinRoomMessage: SignalingMessage = {
          type: 'RoomUpdate',
          action: action,
          from: paction.playerId,
          payload: {
            ...paction.input || {}
          }
        } as SignalingMessage;
        this.signaling.sendMessage(joinRoomMessage);
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
    console.log('[NetworkEngine] Sending state change:', schange.type);
    this.webrtc?.broadcastMessage(schange);
  }
  async onReceiveStateChange(schange: StateChange): Promise<void> {
    console.log('[NetworkEngine] Received state change:', schange.type);
    switch (schange.type) {
      case 'system':
        switch (schange.action) {
          case 'CreateRoom':
            // Initialize room and WebRTC manager synchronously
            const newRoom = {
              id: schange.payload?.roomId,
              hostId: this.owner.id,
              players: new Map([[this.owner.id, this.owner]]),
            } as GameRoom;
            this.webrtc = new WebRTCManager(newRoom, this.gameWork.config.stunServers);
            
            // Update GameWork state
            this.gameWork.handleRoomUpdate(newRoom);
            
            // Emit completion event with different action to avoid event loop
            this.gameWork.sendStateChange({
              type: 'system',
              action: 'CreateRoomComplete',
              payload: {
                roomId: schange.payload?.roomId,
                roomCode: schange.payload?.roomCode,
                isInitialized: true // Flag to indicate WebRTC is ready
              }
            });
          break;
          case 'JoinRoom':
            const player = schange.payload?.player;
            if (player) {
              // Update GameWork state with new player
              this.gameWork.addConnectedPlayer(player);
            }
            break;
          case 'LeaveRoom':
            const playerId = schange.payload?.playerId;
            const room = this.gameWork.getRoom();
            if (room?.hostId === this.owner.id) {
              if (playerId === this.owner.id) {
                // Host leaving - disconnect all and close room
                this.webrtc?.disconnectAll();
                // Clear room in GameWork state
                this.gameWork.handleRoomUpdate(undefined as any);
                
                const roomId = schange.payload?.roomId || '';
                const leaveRoomMessage: SignalingMessage = {
                  type: 'RoomUpdate',
                  action: 'CloseRoomRequest',
                  from: playerId,
                  payload: {
                    roomId: roomId
                  }
                } as SignalingMessage;
                this.signaling.sendMessage(leaveRoomMessage);
              } else {
                // Player leaving - disconnect and remove from state
                this.webrtc?.disconnectPeer(playerId);
                this.gameWork.removeConnectedPlayer(playerId);
              }
            }
            break;
        }
        break;
      default:
        break;
    }
  }

  /**
   * Setup signaling message handlers for host-based room management
   */
  private setupSignalingHandlers(): void {
    this.signaling.onMessage((message: any) => {
      console.log('[NetworkEngine] Received signaling message:', message.type);
      switch (message.type) {
        case 'RoomUpdate':
          this.handleRoomUpdate(message);
          break;
        case 'SignalingMessage':
          this.handleSignalingMessages(message);
          break;
      }
    });
  }

  private handleRoomUpdate(message: SignalingMessage): void {
    switch (message.action) {
      case 'CreateRoom':
        // Server confirmed room creation - relay to game system
        this.gameWork.sendStateChange({
          type: 'system',
          action: 'CreateRoom',
          payload: {
            roomId: message.payload.roomId,
            roomCode: message.payload.roomCode
          }
        });
        break;
      case 'JoinRoom':
        // Create player with WebRTC info
        const newPlayer: Player = {
          id: message.from,
          connection: undefined,
          dataChannel: undefined,
          isConnected: false
        };
        // Add player to GameWork state
        this.gameWork.addConnectedPlayer(newPlayer);
        this.webrtc?.createOffer(message.from);
        break;
      case 'CloseRoomRequest':
        this.gameWork.sendStateChange({
          type: 'system',
          action: 'LeaveRoom',
          payload: {
            roomId: message.payload.roomId,
            roomCode: message.payload.roomCode
          }
        });
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
          from: this.owner.id,
          payload: {
            to: message.from,
            answer: answer
          }
        } as answerMessage;
        await this.signaling.sendMessage(msg);
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
