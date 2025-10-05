import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import { Player, GameRoom } from '../../shared/signaling-types';
import { v4 as uuidv4 } from 'uuid';
import { PlayerAction, StateChange } from '../events/EventFlow';

export class NetworkEngine {
  private webrtc: WebRTCManager;
  private signaling: SignalingService;
  private owner: Player;
  private isConnected = false;
  private room?: GameRoom;
  protected gameWork: any;

  constructor(gameWork: any) {
    this.gameWork = gameWork;
    this.owner = gameWork.owner;

    // Initialize networking
    this.webrtc = new WebRTCManager(this.gameWork.config.stunServers);
    this.signaling = new SignalingService(this.gameWork.config.signalServiceConfig);
  }

  async onSendPlayerAction(payload: PlayerAction): Promise<void> {
    this.webrtc.broadcastMessage(payload);
  }
  async onReceivePlayerAction(payload: PlayerAction): Promise<void> {
    const action = payload.action;
    switch (action) {
      case 'CreateRoom':
        this.joinRoom();
        break;
      case 'JoinRoom':
        this.joinRoom(payload.input?.roomCode);
        break;
      case 'LeaveRoom':
        this.leaveRoom();
        break;
      default:
        break;
    }
  }
  async onSendStateChange(payload: StateChange): Promise<void> {
    this.webrtc.broadcastMessage(payload);
  }
  async onReceiveStateChange(payload: StateChange): Promise<void> {
    return;
  }

  /**
   * Host a new multiplayer game room
   */
  async joinRoom(roomCode?: string): Promise<string> {
    // Disconnect from current room if already connected
    if (this.isConnected) {
      await this.leaveRoom();
    }

    try {
      let roomId: string | null;
      if (roomCode) {
        roomId = await this.lookupRoom(roomCode);
        if (!roomId) {
          throw new Error('Room not found');
        }
      } else {
        roomId = uuidv4();
      }

      // Create room
      this.room = {
        id: roomId,
        name: `Game Room ${roomId}`,
        hostId: this.owner.id,
        players: new Map([[this.owner.id, this.owner]]),
        maxPlayers: 8,
        gameType: 'generic',
        createdAt: Date.now()
      };

      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.room.id, this.owner.id);

      this.isConnected = true;

      return this.room.id;
    } catch (error) {
      console.error('[NetworkEngine] Failed to host room:', error);
      throw error;
    }
  }

  /**
   * Look up a room by room code (private method)
   */
  private async lookupRoom(roomCode: string): Promise<string | null> {
    console.log(`[NetworkEngine] Looking up room with code: ${roomCode}`);

    if (!this.isConnected) {
      await this.signaling.connect();
    }

    return new Promise((resolve) => {
      const messageHandler = (message: any) => {
        if (message.type === 'room_found') {
          const roomId = message.payload.roomId;
          console.log(`[NetworkEngine] Room found: ${roomId}`);
          this.signaling.offMessage(messageHandler);
          resolve(roomId);
        } else if (message.type === 'error' && message.payload.message?.includes('not found')) {
          console.log(`[NetworkEngine] Room not found: ${roomCode}`);
          this.signaling.offMessage(messageHandler);
          resolve(null);
        }
      };

      // Add temporary message handler
      this.signaling.onMessage(messageHandler);

      // Send lookup request
      this.signaling.sendServerMessage('lookup_room', { roomCode });
    });
  }

  /**
   * Close the current room and disconnect from networking
   */
  async leaveRoom(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    // Disconnect from signaling service
    if (this.signaling) {
      await this.signaling.disconnect();
    }

    // Clear room data
    this.room = undefined;
    this.isConnected = false;
  }

  /**
   * Setup signaling updates
   */
  setupSignalingUpdates(): void {
    this.signaling.onRoomUpdate((room: GameRoom) => {
      this.room = room;
    });
  }
}
