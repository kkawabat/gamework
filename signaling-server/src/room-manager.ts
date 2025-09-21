import { v4 as uuidv4 } from 'uuid';
import { GameRoom, Player, SignalingMessage } from './types';

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  private pendingMessages = new Map<string, SignalingMessage[]>();

  createRoom(roomId: string, hostId: string, hostName: string, gameType: string = 'generic', maxPlayers: number = 8): GameRoom {
    const room: GameRoom = {
      id: roomId,
      name: `Room ${roomId}`,
      hostId,
      players: new Map(),
      maxPlayers,
      gameType,
      createdAt: Date.now()
    };

    // Add host as first player
    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      isHost: true,
      isConnected: true,
      lastSeen: Date.now()
    };

    room.players.set(hostId, hostPlayer);
    this.rooms.set(roomId, room);
    this.pendingMessages.set(roomId, []);

    console.log(`Created room ${roomId} with host ${hostId}`);
    return room;
  }

  joinRoom(roomId: string, playerId: string, playerName: string): GameRoom | null {
    let room = this.rooms.get(roomId);
    
    if (!room) {
      // Create room if it doesn't exist (first player becomes host)
      room = this.createRoom(roomId, playerId, playerName);
      return room;
    }

    // Check if room is full
    if (room.players.size >= room.maxPlayers) {
      return null;
    }

    // Add player to room
    const player: Player = {
      id: playerId,
      name: playerName,
      isHost: false,
      isConnected: true,
      lastSeen: Date.now()
    };

    room.players.set(playerId, player);
    console.log(`Player ${playerId} joined room ${roomId}`);
    return room;
  }

  leaveRoom(roomId: string, playerId: string): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return null;
    }

    room.players.delete(playerId);
    console.log(`Player ${playerId} left room ${roomId}`);

    // If host left and there are other players, assign new host
    if (room.hostId === playerId && room.players.size > 0) {
      const newHost = room.players.keys().next().value;
      if (newHost) {
        room.hostId = newHost;
        const newHostPlayer = room.players.get(newHost)!;
        newHostPlayer.isHost = true;
        console.log(`Assigned new host ${newHost} for room ${roomId}`);
      }
    }

    // Clean up empty rooms
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      this.pendingMessages.delete(roomId);
      console.log(`Deleted empty room ${roomId}`);
      return null;
    }

    return room;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  storeMessage(roomId: string, message: SignalingMessage): void {
    if (!this.pendingMessages.has(roomId)) {
      this.pendingMessages.set(roomId, []);
    }
    this.pendingMessages.get(roomId)!.push(message);
  }

  getPendingMessages(roomId: string, playerId: string): SignalingMessage[] {
    const pending = this.pendingMessages.get(roomId) || [];
    return pending.filter(msg => msg.to === playerId || !msg.to);
  }

  clearPendingMessages(roomId: string, playerId: string): void {
    const pending = this.pendingMessages.get(roomId);
    if (pending) {
      this.pendingMessages.set(roomId, pending.filter(msg => msg.to !== playerId));
    }
  }

  updatePlayerLastSeen(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        player.lastSeen = Date.now();
      }
    }
  }

  // Clean up old rooms and messages (call periodically)
  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.createdAt > maxAge) {
        this.rooms.delete(roomId);
        this.pendingMessages.delete(roomId);
        console.log(`Cleaned up old room ${roomId}`);
      }
    }
  }
}




