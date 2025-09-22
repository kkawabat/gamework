import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { RoomManager } from './room-manager';
import { ClientMessage, ServerMessage, SignalingMessage, GameRoom } from './types';

interface ClientConnection {
  ws: WebSocket;
  playerId: string;
  playerName: string;
  roomId?: string;
  lastPing: number;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private roomManager: RoomManager;
  private connections = new Map<string, ClientConnection>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(port: number = 8080) {
    const server = createServer((req, res) => {
      // Add CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // Handle the request normally
      this.handleRequest(req, res);
    });
    
    this.wss = new WebSocketServer({ 
      server,
      path: '/',
      perMessageDeflate: false
    });
    this.roomManager = new RoomManager();

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    // Add health check endpoint
    this.addHealthEndpoint(server);

    server.listen(port, '0.0.0.0', () => {
      console.log(`Signaling server running on port ${port} (IPv4 all interfaces)`);
    });

    // Cleanup old rooms every hour
    this.cleanupInterval = setInterval(() => {
      this.roomManager.cleanup();
    }, 60 * 60 * 1000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down signaling server...');
      clearInterval(this.cleanupInterval);
      this.wss.close();
      process.exit(0);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const connectionId = uuidv4();
    console.log(`New connection: ${connectionId}`);

    const connection: ClientConnection = {
      ws,
      playerId: '',
      playerName: '',
      lastPing: Date.now()
    };

    this.connections.set(connectionId, connection);

    ws.on('message', (data: Buffer) => {
      const rawMessage = data.toString();
      console.log(`[WebSocket] 📨 Received message from ${connectionId}:`, rawMessage);
      
      try {
        const message: ClientMessage = JSON.parse(rawMessage);
        console.log(`[WebSocket] 📨 Parsed message from ${connectionId}:`, JSON.stringify(message, null, 2));
        this.handleMessage(connectionId, message);
      } catch (error) {
        console.error(`[WebSocket] ❌ Error parsing message from ${connectionId}:`, error);
        console.error(`[WebSocket] ❌ Raw message that failed to parse:`, rawMessage);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    });

    // Send welcome message
    this.sendMessage(ws, {
      type: 'room_joined',
      payload: { message: 'Connected to GameWork signaling server' }
    }, connectionId);
  }

  private handleMessage(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[WebSocket] ⚠️ Received message for unknown connection: ${connectionId}`);
      return;
    }

    connection.lastPing = Date.now();
    console.log(`[WebSocket] 🔄 Handling message type '${message.type}' from ${connectionId}`);

    switch (message.type) {
      case 'join_room':
        this.handleJoinRoom(connectionId, message);
        break;
      case 'leave_room':
        this.handleLeaveRoom(connectionId, message);
        break;
      case 'signaling_message':
        this.handleSignalingMessage(connectionId, message);
        break;
      case 'ping':
        this.handlePing(connectionId, message);
        break;
      default:
        console.warn(`[WebSocket] ⚠️ Unknown message type: ${message.type} from ${connectionId}`);
    }
  }

  private handleJoinRoom(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { roomId, playerId, playerName } = message.payload;
    
    if (!roomId || !playerId || !playerName) {
      this.sendError(connection.ws, 'Missing required fields: roomId, playerId, playerName');
      return;
    }

    // Leave previous room if any
    if (connection.roomId) {
      this.roomManager.leaveRoom(connection.roomId, connection.playerId);
    }

    // Join new room
    const room = this.roomManager.joinRoom(roomId, playerId, playerName);
    
    if (!room) {
      this.sendError(connection.ws, 'Room is full or invalid');
      return;
    }

    // Update connection info
    connection.playerId = playerId;
    connection.playerName = playerName;
    connection.roomId = roomId;

    // Send room info to the joining player
    this.sendMessage(connection.ws, {
      type: 'room_joined',
      payload: {
        room: this.serializeRoom(room),
        playerId,
        playerName
      },
      roomId
    });

    // Send pending messages
    const pendingMessages = this.roomManager.getPendingMessages(roomId, playerId);
    pendingMessages.forEach(msg => {
      this.sendMessage(connection.ws, {
        type: 'signaling_message',
        payload: msg,
        roomId
      });
    });

    // Clear pending messages for this player
    this.roomManager.clearPendingMessages(roomId, playerId);

    // Broadcast room update to all players in the room
    this.broadcastToRoom(roomId, {
      type: 'room_update',
      payload: { room: this.serializeRoom(room) },
      roomId
    }, playerId);

    console.log(`Player ${playerId} joined room ${roomId}`);
  }

  private handleLeaveRoom(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.roomId) return;

    const roomId = connection.roomId;
    const playerId = connection.playerId;

    const room = this.roomManager.leaveRoom(roomId, playerId);
    
    if (room) {
      // Broadcast room update to remaining players
      this.broadcastToRoom(roomId, {
        type: 'room_update',
        payload: { room: this.serializeRoom(room) },
        roomId
      });
    }

    // Clear connection room info
    connection.roomId = undefined;

    this.sendMessage(connection.ws, {
      type: 'room_left',
      payload: { roomId, playerId }
    });

    console.log(`Player ${playerId} left room ${roomId}`);
  }

  private handleSignalingMessage(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.roomId) {
      if (connection?.ws) {
        this.sendError(connection.ws, 'Not in a room');
      }
      return;
    }

    const signalingMessage: SignalingMessage = message.payload;
    
    if (!signalingMessage || !signalingMessage.type || !signalingMessage.payload) {
      this.sendError(connection.ws, 'Invalid signaling message');
      return;
    }

    // Set sender info
    signalingMessage.from = connection.playerId;
    signalingMessage.roomId = connection.roomId;

    // Store message for potential future delivery
    this.roomManager.storeMessage(connection.roomId, signalingMessage);

    // Forward message to target player or broadcast to room
    if (signalingMessage.to) {
      // Send to specific player
      this.sendToPlayer(connection.roomId, signalingMessage.to, {
        type: 'signaling_message',
        payload: signalingMessage,
        roomId: connection.roomId
      });
    } else {
      // Broadcast to all players in room except sender
      this.broadcastToRoom(connection.roomId, {
        type: 'signaling_message',
        payload: signalingMessage,
        roomId: connection.roomId
      }, connection.playerId);
    }

    console.log(`Signaling message from ${connection.playerId} in room ${connection.roomId}: ${signalingMessage.type}`);
  }

  private handlePing(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.sendMessage(connection.ws, {
      type: 'pong',
      payload: { timestamp: Date.now() }
    });
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Leave room if in one
    if (connection.roomId) {
      const room = this.roomManager.leaveRoom(connection.roomId, connection.playerId);
      
      if (room) {
        // Broadcast room update to remaining players
        this.broadcastToRoom(connection.roomId, {
          type: 'room_update',
          payload: { room: this.serializeRoom(room) },
          roomId: connection.roomId
        });
      }
    }

    this.connections.delete(connectionId);
    console.log(`Connection ${connectionId} disconnected`);
  }

  private sendToPlayer(roomId: string, playerId: string, message: ServerMessage): void {
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.roomId === roomId && connection.playerId === playerId) {
        this.sendMessage(connection.ws, message);
        break;
      }
    }
  }

  private broadcastToRoom(roomId: string, message: ServerMessage, excludePlayerId?: string): void {
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.roomId === roomId && connection.playerId !== excludePlayerId) {
        this.sendMessage(connection.ws, message);
      }
    }
  }

  private sendMessage(ws: WebSocket, message: ServerMessage, connectionId?: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      const logPrefix = connectionId ? `[WebSocket] 📤 Sending message to ${connectionId}:` : `[WebSocket] 📤 Sending message:`;
      console.log(logPrefix, messageStr);
      ws.send(messageStr);
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      payload: { message: error }
    });
  }

  private serializeRoom(room: GameRoom): any {
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      players: Array.from(room.players.values()),
      maxPlayers: room.maxPlayers,
      gameType: room.gameType,
      createdAt: room.createdAt
    };
  }

  private addHealthEndpoint(server: any): void {
    server.on('request', (req: any, res: any) => {
      // Add CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (req.url === '/health') {
        const isHealthy = this.wss && this.roomManager;
        const activeConnections = this.connections.size;
        const uptime = process.uptime();
        
        if (isHealthy) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'healthy', 
            timestamp: Date.now(),
            uptime: Math.floor(uptime),
            connections: activeConnections,
            rooms: this.roomManager.getRoomCount(),
            version: '1.0.0',
            service: 'gamework-signaling-server'
          }));
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'unhealthy', 
            timestamp: Date.now(),
            reason: 'WebSocket server not ready',
            uptime: Math.floor(uptime)
          }));
        }
        return;
      }
      
      // Handle root path for WebSocket connections
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok',
          service: 'gamework-signaling-server',
          message: 'WebSocket signaling server is running',
          timestamp: Date.now(),
          version: '1.0.0'
        }));
        return;
      }
      
      // Handle other HTTP requests
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    // WebSocketServer automatically handles upgrades, no manual handler needed
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
  new SignalingServer(port);
}




