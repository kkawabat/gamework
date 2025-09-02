import { SignalingMessage, GameRoom } from '../types';

export interface SignalingService {
  connect(): Promise<void>;
  disconnect(): void;
  joinRoom(roomId: string, playerId: string): Promise<void>;
  leaveRoom(roomId: string, playerId: string): Promise<void>;
  sendMessage(message: SignalingMessage): Promise<void>;
  onMessage(callback: (message: SignalingMessage) => void): void;
  onRoomUpdate(callback: (room: GameRoom) => void): void;
  onError(callback: (error: Error) => void): void;
}

// Simple in-memory signaling service for development/testing
export class InMemorySignalingService implements SignalingService {
  private messageCallbacks: ((message: SignalingMessage) => void)[] = [];
  private roomUpdateCallbacks: ((room: GameRoom) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private isConnected = false;
  private currentRoom?: string;
  private currentPlayerId?: string;

  // In-memory storage for rooms and messages
  private static rooms = new Map<string, GameRoom>();
  private static pendingMessages = new Map<string, SignalingMessage[]>();

  async connect(): Promise<void> {
    this.isConnected = true;
    console.log('Connected to in-memory signaling service');
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.currentRoom && this.currentPlayerId) {
      this.leaveRoom(this.currentRoom, this.currentPlayerId);
    }
    console.log('Disconnected from in-memory signaling service');
  }

  async joinRoom(roomId: string, playerId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to signaling service');
    }

    this.currentRoom = roomId;
    this.currentPlayerId = playerId;

    // Create room if it doesn't exist
    if (!InMemorySignalingService.rooms.has(roomId)) {
      InMemorySignalingService.rooms.set(roomId, {
        id: roomId,
        name: `Room ${roomId}`,
        hostId: playerId,
        players: new Map(),
        maxPlayers: 8,
        gameType: 'generic',
        createdAt: Date.now()
      });
    }

    const room = InMemorySignalingService.rooms.get(roomId)!;
    room.players.set(playerId, {
      id: playerId,
      name: `Player ${playerId}`,
      isHost: room.hostId === playerId,
      isConnected: true,
      lastSeen: Date.now()
    });

    // Notify room update
    this.roomUpdateCallbacks.forEach(callback => callback(room));

    // Send pending messages for this room
    const pending = InMemorySignalingService.pendingMessages.get(roomId) || [];
    pending.forEach(message => {
      if (message.to === playerId || !message.to) {
        this.messageCallbacks.forEach(callback => callback(message));
      }
    });
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    const room = InMemorySignalingService.rooms.get(roomId);
    if (room) {
      room.players.delete(playerId);
      
      // If host leaves, assign new host
      if (room.hostId === playerId && room.players.size > 0) {
        const newHost = room.players.keys().next().value;
        room.hostId = newHost;
        const newHostPlayer = room.players.get(newHost)!;
        newHostPlayer.isHost = true;
      }

      // Notify room update
      this.roomUpdateCallbacks.forEach(callback => callback(room));
    }

    if (this.currentRoom === roomId) {
      this.currentRoom = undefined;
      this.currentPlayerId = undefined;
    }
  }

  async sendMessage(message: SignalingMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to signaling service');
    }

    // Store message for room
    const roomId = message.roomId;
    if (!InMemorySignalingService.pendingMessages.has(roomId)) {
      InMemorySignalingService.pendingMessages.set(roomId, []);
    }
    InMemorySignalingService.pendingMessages.get(roomId)!.push(message);

    // Deliver message immediately if recipient is in the same room
    const room = InMemorySignalingService.rooms.get(roomId);
    if (room && message.to) {
      const recipient = room.players.get(message.to);
      if (recipient?.isConnected) {
        // Simulate network delay
        setTimeout(() => {
          this.messageCallbacks.forEach(callback => callback(message));
        }, Math.random() * 100);
      }
    }
  }

  onMessage(callback: (message: SignalingMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onRoomUpdate(callback: (room: GameRoom) => void): void {
    this.roomUpdateCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  // Utility methods for testing
  static getRoom(roomId: string): GameRoom | undefined {
    return InMemorySignalingService.rooms.get(roomId);
  }

  static clearRooms(): void {
    InMemorySignalingService.rooms.clear();
    InMemorySignalingService.pendingMessages.clear();
  }
}

// Firebase-based signaling service (placeholder for production use)
export class FirebaseSignalingService implements SignalingService {
  async connect(): Promise<void> {
    // Implementation would use Firebase Realtime Database or Firestore
    throw new Error('Firebase signaling service not implemented yet');
  }

  disconnect(): void {
    // Implementation would disconnect from Firebase
  }

  async joinRoom(roomId: string, playerId: string): Promise<void> {
    // Implementation would join Firebase room
    throw new Error('Firebase signaling service not implemented yet');
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    // Implementation would leave Firebase room
    throw new Error('Firebase signaling service not implemented yet');
  }

  async sendMessage(message: SignalingMessage): Promise<void> {
    // Implementation would send message through Firebase
    throw new Error('Firebase signaling service not implemented yet');
  }

  onMessage(callback: (message: SignalingMessage) => void): void {
    // Implementation would set up Firebase message listener
  }

  onRoomUpdate(callback: (room: GameRoom) => void): void {
    // Implementation would set up Firebase room listener
  }

  onError(callback: (error: Error) => void): void {
    // Implementation would set up Firebase error listener
  }
}

