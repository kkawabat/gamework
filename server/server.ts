import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { ClientToServer, ServerToClient } from '../shared/signaling-types';

interface Room {
  code: string;
  members: Map<string, WebSocket>;
}

export class SignalingServer {
  private rooms = new Map<string, Room>();
  private clients = new Map<WebSocket, { playerId: string; room: Room }>();

  constructor(port: number = 8080) {
    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', rooms: this.rooms.size, clients: this.clients.size }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: Buffer) => {
        try {
          this.handleMessage(ws, JSON.parse(data.toString()));
        } catch (error) {
          this.send(ws, { type: 'ERROR', message: String(error instanceof Error ? error.message : error) });
        }
      });
      ws.on('close', () => this.handleClose(ws));
    });

    server.listen(port, () => console.log(`Signaling server listening on port ${port}`));
  }

  private handleMessage(ws: WebSocket, message: ClientToServer): void {
    switch (message.type) {
      case 'CREATE_ROOM': {
        const code = this.newRoomCode();
        const room: Room = { code, members: new Map([[message.playerId, ws]]) };
        this.rooms.set(code, room);
        this.clients.set(ws, { playerId: message.playerId, room });
        this.send(ws, { type: 'ROOM_CREATED', roomCode: code });
        console.log(`Room ${code} created by ${message.playerId}`);
        break;
      }
      case 'JOIN_ROOM': {
        const room = this.rooms.get(message.roomCode);
        if (!room) throw new Error(`Room ${message.roomCode} not found`);
        const peers = [...room.members.keys()];
        room.members.set(message.playerId, ws);
        this.clients.set(ws, { playerId: message.playerId, room });
        this.send(ws, { type: 'ROOM_JOINED', roomCode: room.code, peers });
        console.log(`${message.playerId} joined room ${room.code}`);
        break;
      }
      case 'SIGNAL': {
        const client = this.clients.get(ws);
        if (!client) throw new Error('Not in a room');
        const target = client.room.members.get(message.to);
        if (!target) throw new Error(`Peer ${message.to} not in room`);
        this.send(target, { type: 'SIGNAL', from: client.playerId, data: message.data });
        break;
      }
      default:
        throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleClose(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;
    this.clients.delete(ws);
    client.room.members.delete(client.playerId);
    if (client.room.members.size === 0) {
      this.rooms.delete(client.room.code);
      console.log(`Room ${client.room.code} deleted`);
    } else {
      for (const member of client.room.members.values()) {
        this.send(member, { type: 'PEER_LEFT', peerId: client.playerId });
      }
    }
  }

  private send(ws: WebSocket, message: ServerToClient): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private newRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }
}

if (require.main === module) {
  new SignalingServer(process.env.PORT ? parseInt(process.env.PORT) : 8080);
}
