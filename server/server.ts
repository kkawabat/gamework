import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { 
  SignalingMessage, 
  createRoomMessage, 
  joinRoomMessage, 
  closeRoomMessage,
  offerMessage,
  answerMessage,
  iceCandidateMessage
} from '../shared/signaling-types';

interface ClientConnection {
  ws: WebSocket;
  playerId: string;
  roomId?: string;
  isHost: boolean;
}

interface Room {
  id: string;
  hostId: string;
  roomCode: string; // Short code for easy joining
  createdAt: number;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private connections = new Map<string, ClientConnection>();
  private rooms = new Map<string, Room>();

  constructor(port: number = 8080) {
    const server = createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy',
          connections: this.connections.size,
          rooms: this.rooms.size
        }));
        return;
      }
      
      res.writeHead(404);
      res.end('Not Found');
    });
    
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
    
    server.listen(port, () => {
      console.log(`Signaling server running on port ${port}`);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const connectionId = uuidv4();
    console.log(`New connection: ${connectionId}`);

    const connection: ClientConnection = {
      ws,
      playerId: '',
      isHost: false
    };

    this.connections.set(connectionId, connection);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(connectionId, message);
      } catch (error) {
        console.error(`Error parsing message:`, error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    ws.on('error', (error: Error) => {
      console.error(`WebSocket error:`, error);
      this.handleDisconnection(connectionId);
    });
  }

  private handleMessage(connectionId: string, message: SignalingMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`Handling message:`, message.type);

    switch (message.type) {
      case 'RoomUpdate':
        this.handleRoomUpdate(connectionId, message);
        break;
      case 'SignalingMessage':
        this.handleSignalingMessage(connectionId, message);
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  private handleRoomUpdate(connectionId: string, message: SignalingMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    switch (message.action) {
      case 'CreateRoomRequest':
        this.handleCreateRoom(connectionId, message as createRoomMessage);
        break;
      case 'JoinRoomRequest':
        this.handleJoinRoom(connectionId, message as joinRoomMessage);
        break;
      case 'CloseRoomRequest':
        this.handleCloseRoom(connectionId, message as closeRoomMessage);
        break;
    }
  }

  private handleCreateRoom(connectionId: string, message: createRoomMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const roomId = uuidv4();
    const roomCode = this.generateRoomCode();
    
    // Create room
    const room: Room = {
      id: roomId,
      hostId: message.from,
      roomCode,
      createdAt: Date.now()
    };
    
    this.rooms.set(roomId, room);
    
    // Update connection
    connection.playerId = message.from;
    connection.roomId = roomId;
    connection.isHost = true;

    // Send confirmation to host
    this.sendMessage(connection.ws, {
      type: 'RoomUpdate',
      action: 'CreateRoom',
      from: 'server',
      payload: {
        roomId,
        roomCode
      }
    });

    console.log(`Room created: ${roomId} (${roomCode}) by ${message.from}`);
  }

  private handleJoinRoom(connectionId: string, message: joinRoomMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`[Server] handleJoinRoom called with:`, message);
    console.log(`[Server] Message payload:`, message.payload);
    
    const { roomId, roomCode } = message.payload;
    console.log(`[Server] Extracted roomId:`, roomId, `roomCode:`, roomCode);
    
    let targetRoom: Room | undefined;

    if (roomId) {
      targetRoom = this.rooms.get(roomId);
    } else if (roomCode) {
      // Find room by code
      for (const room of this.rooms.values()) {
        if (room.roomCode === roomCode) {
          targetRoom = room;
          break;
        }
      }
    }

    if (!targetRoom) {
      console.log(`[Server] Room not found for roomId:`, roomId, `roomCode:`, roomCode);
      console.log(`[Server] Available rooms:`, Array.from(this.rooms.values()).map(r => ({ id: r.id, roomCode: r.roomCode })));
      this.sendError(connection.ws, 'Room not found');
      return;
    }
    
    console.log(`[Server] Found room:`, targetRoom.id, `with code:`, targetRoom.roomCode);

    // Update connection
    connection.playerId = message.from;
    connection.roomId = targetRoom.id;
    connection.isHost = false;

    // Notify host about new player
    const hostConnection = this.getHostConnection(targetRoom.id);
    if (hostConnection) {
      this.sendMessage(hostConnection.ws, {
        type: 'RoomUpdate',
        action: 'JoinRoom',
        from: 'server',
        payload: {
          playerId: message.from,
          roomId: targetRoom.id,
          roomCode: targetRoom.roomCode,
          hostId: targetRoom.hostId
        }
      });
    }

    console.log(`Player ${message.from} joined room ${targetRoom.id}`);
  }

  private handleCloseRoom(connectionId: string, message: closeRoomMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.roomId) return;

    // Only allow host to close room
    if (!connection.isHost) {
      this.sendError(connection.ws, 'Only host can close room');
      return;
    }

    const roomId = connection.roomId;
    const hostId = connection.playerId;

    // Clean up all connections in this room
    for (const [connId, conn] of this.connections.entries()) {
      if (conn.roomId === roomId) {
        conn.roomId = undefined;
        conn.isHost = false;
      }
    }

    // Delete the room
    this.rooms.delete(roomId);

    console.log(`Room ${roomId} closed by host ${hostId}`);
  }

  private handleSignalingMessage(connectionId: string, message: SignalingMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.roomId) return;

    const { to } = message.payload;
    
    if (to) {
      // Send to specific player
      this.sendToPlayer(connection.roomId, to, message);
    } else {
      // Broadcast to all players in room except sender
      this.broadcastToRoom(connection.roomId, message, connection.playerId);
    }
  }

  private getHostConnection(roomId: string): ClientConnection | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    for (const connection of this.connections.values()) {
      if (connection.roomId === roomId && connection.playerId === room.hostId) {
        return connection;
      }
    }
    return null;
  }

  private sendToPlayer(roomId: string, playerId: string, message: SignalingMessage): void {
    for (const connection of this.connections.values()) {
      if (connection.roomId === roomId && connection.playerId === playerId) {
        this.sendMessage(connection.ws, message);
        break;
      }
    }
  }

  private broadcastToRoom(roomId: string, message: SignalingMessage, excludePlayerId?: string): void {
    for (const connection of this.connections.values()) {
      if (connection.roomId === roomId && connection.playerId !== excludePlayerId) {
        this.sendMessage(connection.ws, message);
      }
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // If host disconnects, close the room
    if (connection.isHost && connection.roomId) {
      const closeMessage: closeRoomMessage = {
        type: 'RoomUpdate',
        action: 'CloseRoomRequest',
        from: connection.playerId,
        payload: { roomId: connection.roomId }
      };
      this.handleCloseRoom(connectionId, closeMessage);
    }

    this.connections.delete(connectionId);
    console.log(`Connection ${connectionId} disconnected`);
  }

  private sendMessage(ws: WebSocket, message: SignalingMessage | { type: string; payload: any }): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      payload: { message: error }
    });
  }

  private generateRoomCode(): string {
    // Generate a 6-character room code
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
  new SignalingServer(port);
}
