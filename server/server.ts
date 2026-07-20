import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import { ClientToServer, ServerToClient, IceServerConfig } from '../shared/signaling-types';

interface Room {
  code: string;
  members: Map<string, WebSocket>;
}

const STUN_SERVERS: IceServerConfig[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

// Long enough that a game started now still has working credentials later; short
// enough that a leaked pair is worthless by tomorrow.
const TURN_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

/**
 * coturn's `use-auth-secret` mode: the username is an expiry timestamp and the
 * password is an HMAC of it against the secret coturn also holds. Both sides
 * compute it independently, so minting costs one hash and never talks to the
 * relay. Falls back to STUN alone when no relay is configured (local dev).
 */
export function buildIceServers(options: {
  playerId: string;
  host?: string;
  secret?: string;
  now?: number;
}): IceServerConfig[] {
  const { playerId, host, secret, now = Date.now() } = options;
  if (!host || !secret) return STUN_SERVERS;

  const username = `${Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECONDS}:${playerId}`;
  return [
    ...STUN_SERVERS,
    {
      // UDP first; the TCP entry is the fallback where UDP is blocked outright.
      urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`],
      username,
      credential: createHmac('sha1', secret).update(username).digest('base64')
    }
  ];
}

export class SignalingServer {
  private rooms = new Map<string, Room>();
  private clients = new Map<WebSocket, { playerId: string; room: Room }>();
  private httpServer: Server;
  /** Resolves with the bound port once listening (port 0 picks a free one). */
  readonly ready: Promise<number>;

  constructor(port: number = 8080) {
    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', rooms: this.rooms.size, clients: this.clients.size }));
        return;
      }
      if (req.method === 'POST' && req.url === '/log') {
        this.handleClientLog(req, res);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: Buffer) => {
        try {
          this.handleMessage(ws, JSON.parse(data.toString()));
        } catch (error) {
          const message = String(error instanceof Error ? error.message : error);
          console.warn(`Signaling error from ${this.clients.get(ws)?.playerId ?? 'unknown client'}: ${message}`);
          this.send(ws, { type: 'ERROR', message });
        }
      });
      ws.on('close', () => this.handleClose(ws));
    });

    this.httpServer = server;
    this.ready = new Promise((resolve) => {
      server.listen(port, () => {
        const bound = (server.address() as AddressInfo).port;
        console.log(`Signaling server listening on port ${bound}`);
        resolve(bound);
      });
    });
  }

  /** Stop listening and release the port. For tests and graceful shutdown. */
  close(): Promise<void> {
    return new Promise((resolve, reject) =>
      this.httpServer.close((err) => (err ? reject(err) : resolve())));
  }

  private handleMessage(ws: WebSocket, message: ClientToServer): void {
    switch (message.type) {
      case 'CREATE_ROOM': {
        const code = this.newRoomCode();
        const room: Room = { code, members: new Map([[message.playerId, ws]]) };
        this.rooms.set(code, room);
        this.clients.set(ws, { playerId: message.playerId, room });
        this.send(ws, { type: 'ROOM_CREATED', roomCode: code, iceServers: this.iceServers(message.playerId) });
        console.log(`Room ${code} created by ${message.playerId}`);
        break;
      }
      case 'JOIN_ROOM': {
        const room = this.rooms.get(message.roomCode);
        if (!room) throw new Error(`Room ${message.roomCode} not found`);
        const peers = [...room.members.keys()];
        room.members.set(message.playerId, ws);
        this.clients.set(ws, { playerId: message.playerId, room });
        this.send(ws, { type: 'ROOM_JOINED', roomCode: room.code, peers, iceServers: this.iceServers(message.playerId) });
        for (const peerId of peers) {
          this.send(room.members.get(peerId)!, { type: 'PEER_JOINED', peerId: message.playerId });
        }
        console.log(`${message.playerId} joined room ${room.code} (${room.members.size} members)`);
        break;
      }
      case 'SIGNAL': {
        const client = this.clients.get(ws);
        if (!client) throw new Error('Not in a room');
        const target = client.room.members.get(message.to);
        if (!target) throw new Error(`Peer ${message.to} not in room`);
        this.send(target, { type: 'SIGNAL', from: client.playerId, data: message.data });
        console.log(`${client.room.code}: ${message.data.kind} ${client.playerId} -> ${message.to}`);
        break;
      }
      case 'LEAVE_ROOM':
        // Explicit departure: the one case where we can be sure the peer is
        // actually gone, so it is also the only one that announces PEER_LEFT.
        this.removeFromRoom(ws, { announce: true });
        break;
      default:
        throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleClose(ws: WebSocket): void {
    // A bare socket close is ambiguous. Clients drop signaling on purpose the
    // moment their data channels are up (see WebRTCNetworkEngine.closeSignaling),
    // so a close is not evidence the peer left the game — announcing PEER_LEFT
    // here would tear down a healthy peer connection. Departures that really
    // mean "gone" arrive as LEAVE_ROOM; genuine mid-connection drops surface on
    // the client as ICE failure. So close silently, only reclaiming the room.
    this.removeFromRoom(ws, { announce: false });
  }

  private removeFromRoom(ws: WebSocket, { announce }: { announce: boolean }): void {
    const client = this.clients.get(ws);
    if (!client) return; // already removed (e.g. LEAVE_ROOM then socket close)
    this.clients.delete(ws);
    client.room.members.delete(client.playerId);
    if (client.room.members.size === 0) {
      this.rooms.delete(client.room.code);
      console.log(`Room ${client.room.code} deleted`);
    } else if (announce) {
      for (const member of client.room.members.values()) {
        this.send(member, { type: 'PEER_LEFT', peerId: client.playerId });
      }
    }
  }

  // Temporary diagnostic sink. Browsers POST their WebRTC/socket-close trace
  // here over HTTP — a separate channel from the signaling socket, so it still
  // arrives when that socket is what died — and it lands in the Cloud Run logs.
  // Capped and unauthenticated: fine as a probe, wants a rate limit before it
  // stays. Remove once the ~1.8s socket deaths are understood.
  private handleClientLog(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8192) req.destroy(); // drop oversized noise
    });
    req.on('end', () => {
      if (body) console.log(`[client-log] ${body}`);
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
    });
    req.on('error', () => undefined); // best-effort; a dropped probe is not an error
  }

  private iceServers(playerId: string): IceServerConfig[] {
    return buildIceServers({ playerId, host: process.env.TURN_HOST, secret: process.env.TURN_SECRET });
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
