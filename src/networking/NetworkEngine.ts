import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import {
  Player,
  GameRoom
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { EventPayload, PlayerAction, StateChange } from '../events/EventFlow';

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
    const action = payload.input.action;
    switch (action) {
      case 'CreateRoom':
        this.joinRoom();
        break;
      case 'JoinRoom':
        this.joinRoom(payload.input.roomId);
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
  async joinRoom(roomId?: string): Promise<string> {
    // Disconnect from current room if already connected
    if (this.isConnected) {
      console.log('[NetworkEngine] Disconnecting from current room before hosting new room');
      await this.leaveRoom();
    }

    try {
      roomId = roomId || uuidv4()

      // Create room
      this.room = {
        id: roomId,
        name: `Game Room ${roomId}`,
        hostId: this.owner.id,
        players: new Map([[this.owner.id, this.owner]]),
        createdAt: Date.now()
      };

      console.log(`[NetworkEngine] Hosting multiplayer game in room: ${this.room.id}`);

      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.room.id, this.owner.id);

      this.isConnected = true;
      console.log(`[NetworkEngine] Room hosted successfully`);

      return this.room.id;
    } catch (error) {
      console.error('[NetworkEngine] Failed to host room:', error);
      throw error;
    }
  }

  /**
   * Look up a room by room code
   */
  async lookupRoom(roomCode: string): Promise<string | null> {
    console.log(`[NetworkEngine] Looking up room with code: ${roomCode}`);

    if (!this.isConnected) {
      await this.signaling.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Room lookup timeout'));
      }, 10000);

      const messageHandler = (message: any) => {
        if (message.type === 'room_found') {
          clearTimeout(timeout);
          const roomId = message.payload.roomId;
          console.log(`[NetworkEngine] Room found: ${roomId}`);
          resolve(roomId);
        } else if (message.type === 'room_not_found') {
          clearTimeout(timeout);
          console.log(`[NetworkEngine] Room not found: ${roomCode}`);
          resolve(null);
        }
      };

      // Add temporary message handler
      this.signaling.onMessage(messageHandler);

      // Send lookup request
      this.signaling.sendMessage({
        type: 'lookup_room',
        payload: { roomCode },
        from: this.owner.id,
        roomId: 'lookup' // Special roomId for lookup requests
      });
    });
  }

  /**
   * Close the current room and disconnect from networking
   */
  async leaveRoom(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    console.log('[NetworkEngine] Closing room...');

    // Disconnect from signaling service
    if (this.signaling) {
      await this.signaling.disconnect();
    }

    // Clear room data
    this.room = undefined;
    this.isConnected = false;

    console.log('[NetworkEngine] Room closed');
  }
}
