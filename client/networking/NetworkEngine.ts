import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import { Player, GameRoom, SignalingMessage, answerMessage, offerMessage, iceCandidateMessage } from '../../shared/signaling-types';
import { v4 as uuidv4 } from 'uuid';
import { PlayerAction, StateChange } from '../events/EventFlow';

export class NetworkEngine {
  private webrtc: WebRTCManager | null = null;
  private signaling: SignalingService;
  private owner: Player;
  private room?: GameRoom;
  protected gameWork: any;

  constructor(gameWork: any) {
    this.gameWork = gameWork;
    this.owner = gameWork.owner;
    this.signaling = new SignalingService(this.gameWork.config.signalServiceConfig);
    
    // Setup signaling message handlers
    this.setupSignalingHandlers();
  }

  async onSendPlayerAction(payload: PlayerAction): Promise<void> {
    // send to the host of the room for processing
    this.webrtc?.sendMessage(this.room?.hostId || "", payload);
  }
  async onReceivePlayerAction(paction: PlayerAction): Promise<void> {
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
        this.gameWork.sendStateChange({
          type: 'system',
          action: 'LeaveRoom',
          payload: {
            roomId: this.room?.id,
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
    switch (schange.type) {
      case 'system':
        switch (schange.action) {
          case 'CreateRoom':
            this.room = {
              id: schange.payload?.roomId,
              hostId: this.owner.id,
              players: new Map([[this.owner.id, this.owner]]),
            } as GameRoom;
            this.webrtc = new WebRTCManager(this.room, this.gameWork.config.stunServers);
          break;
          case 'JoinRoom':
            this.room?.players.set(schange.payload?.playerId, schange.payload?.player);
            break;
          case 'LeaveRoom':
            if (this.room?.hostId === this.owner.id) {
              if (schange.payload?.playerId === this.owner.id) {
                this.webrtc?.disconnectAll();
                this.room = undefined;
                
                const leaveRoomMessage: SignalingMessage = {
                  type: 'RoomUpdate',
                  action: 'CloseRoomRequest',
                  from: schange.payload?.playerId,
                  payload: {
                    roomId: schange.payload.roomId
                  }
                } as SignalingMessage;
                this.signaling.sendMessage(leaveRoomMessage);
                
              }
              else {
                this.webrtc?.disconnectPeer(schange.payload?.playerId);
                this.room?.players.delete(schange.payload?.playerId);
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
      case 'CreateRoomRequest':
        this.gameWork.sendStateChange({
          type: 'system',
          action: 'CreateRoom',
          payload: {
            roomId: message.payload.roomId,
            roomCode: message.payload.roomCode
          }
        });
        break;
      case 'JoinRoomRequest':
        // Create player with WebRTC info
        const newPlayer: Player = {
          id: message.from,
          connection: undefined,
          dataChannel: undefined,
          isConnected: false
        };
        this.room?.players.set(message.from, newPlayer);
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
