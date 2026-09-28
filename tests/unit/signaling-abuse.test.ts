import http from 'http';
import { SignalingServer } from '../../server/server';
import {
  SlidingWindowLimiter,
  clientIp,
  originAllowed,
  parseOrigins
} from '../../server/abuse';

// ws is a signaling-server dependency, not the library package's.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require('../../server/node_modules/ws');

async function listen(options: ConstructorParameters<typeof SignalingServer>[1] = {}): Promise<{
  server: SignalingServer;
  port: number;
}> {
  const server = new SignalingServer(0, options);
  const port = await server.ready;
  return { server, port };
}

function open(port: number, origin?: string): Promise<InstanceType<typeof WebSocket>> {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}`,
    origin ? { headers: { Origin: origin } } : undefined
  );
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function onceJson(ws: { once: Function }): Promise<{ type: string; message?: string; roomCode?: string }> {
  return new Promise((resolve) => {
    ws.once('message', (data: Buffer) => resolve(JSON.parse(data.toString())));
  });
}

function post(port: number, path: string, body = 'hi', headers: http.OutgoingHttpHeaders = {}): Promise<{
  status: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(body), ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk as Buffer));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}

describe('signaling abuse guards', () => {
  it('takes the last X-Forwarded-For hop', () => {
    expect(clientIp({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, '10.0.0.1')).toBe('9.9.9.9');
  });

  it('rejects unknown origins only when enforcement is on', () => {
    const allowed = ['https://games.kankawabata.com'];
    expect(originAllowed('https://evil.example', allowed, false)).toBe(true);
    expect(originAllowed('https://evil.example', allowed, true)).toBe(false);
    expect(originAllowed(undefined, allowed, true)).toBe(false);
    expect(originAllowed('https://games.kankawabata.com', allowed, true)).toBe(true);
  });

  it('parses ALLOWED_ORIGINS and falls back to the default list', () => {
    expect(parseOrigins('https://a.example, https://b.example', ['x'])).toEqual([
      'https://a.example',
      'https://b.example'
    ]);
    expect(parseOrigins(undefined, ['x'])).toEqual(['x']);
  });

  it('caps hits inside a sliding window', () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    expect(limiter.allow('a', 1_000)).toBe(true);
    expect(limiter.allow('a', 1_001)).toBe(true);
    expect(limiter.allow('a', 1_002)).toBe(false);
    expect(limiter.allow('b', 1_002)).toBe(true);
  });

  it('does not advertise room counts on /health', async () => {
    const { server, port } = await listen();
    try {
      const res = await get(port, '/health');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'healthy' });
    } finally {
      await server.close();
    }
  });

  it('rate-limits POST /log', async () => {
    const { server, port } = await listen({ logLimit: { max: 2, windowMs: 60_000 } });
    try {
      expect((await post(port, '/log')).status).toBe(204);
      expect((await post(port, '/log')).status).toBe(204);
      expect((await post(port, '/log')).status).toBe(429);
    } finally {
      await server.close();
    }
  });

  it('rejects /log from a disallowed origin when enforcement is on', async () => {
    const { server, port } = await listen({
      enforceOrigin: true,
      allowedOrigins: ['https://games.kankawabata.com']
    });
    try {
      const blocked = await post(port, '/log', 'hi', { Origin: 'https://evil.example' });
      expect(blocked.status).toBe(403);
      const allowed = await post(port, '/log', 'hi', { Origin: 'https://games.kankawabata.com' });
      expect(allowed.status).toBe(204);
    } finally {
      await server.close();
    }
  });

  it('stops minting rooms once the cap is hit', async () => {
    const { server, port } = await listen({
      maxRooms: 1,
      createRoomLimit: { max: 50, windowMs: 60_000 }
    });
    const sockets: Array<{ close: () => void; send: (data: string) => void }> = [];
    try {
      const a = await open(port);
      sockets.push(a);
      a.send(JSON.stringify({ type: 'CREATE_ROOM', playerId: 'host-a' }));
      expect((await onceJson(a)).type).toBe('ROOM_CREATED');

      const b = await open(port);
      sockets.push(b);
      b.send(JSON.stringify({ type: 'CREATE_ROOM', playerId: 'host-b' }));
      const err = await onceJson(b);
      expect(err).toEqual({ type: 'ERROR', message: 'Server is full' });
    } finally {
      for (const socket of sockets) socket.close();
      await server.close();
    }
  });

  it('rate-limits CREATE_ROOM per network', async () => {
    const { server, port } = await listen({
      createRoomLimit: { max: 1, windowMs: 60_000 }
    });
    const sockets: Array<{ close: () => void; send: (data: string) => void }> = [];
    try {
      const a = await open(port);
      sockets.push(a);
      a.send(JSON.stringify({ type: 'CREATE_ROOM', playerId: 'host-a' }));
      expect((await onceJson(a)).type).toBe('ROOM_CREATED');

      const b = await open(port);
      sockets.push(b);
      b.send(JSON.stringify({ type: 'CREATE_ROOM', playerId: 'host-b' }));
      expect(await onceJson(b)).toEqual({
        type: 'ERROR',
        message: 'Too many rooms from this network'
      });
    } finally {
      for (const socket of sockets) socket.close();
      await server.close();
    }
  });

  it('drops a websocket whose Origin is not allowed', async () => {
    const { server, port } = await listen({
      enforceOrigin: true,
      allowedOrigins: ['https://games.kankawabata.com']
    });
    try {
      await expect(open(port, 'https://evil.example')).rejects.toThrow();
    } finally {
      await server.close();
    }
  });
});
