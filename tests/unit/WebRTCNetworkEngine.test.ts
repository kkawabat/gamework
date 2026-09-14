import { describeCandidate, SIGNALING_PING_INTERVAL_MS, WebRTCNetworkEngine } from '../../src/engines/WebRTCNetworkEngine';
import { ServerToClient } from '../../shared/signaling-types';
import {
  RELIABLE_CHANNEL,
  UNRELIABLE_CHANNEL,
  UNRELIABLE_CHANNEL_CONFIG
} from '../../src/types/NetworkTypes';

/**
 * Minimal stand-in for the browser WebSocket: lets a test push server messages
 * into the engine and read back what the engine sent.
 */
class FakeWebSocket {
  static readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

/** Just enough RTCPeerConnection for the engine to wire its handlers onto. */
class FakePeerConnection {
  onicecandidate: ((event: unknown) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  ondatachannel: ((event: unknown) => void) | null = null;
  iceConnectionState = 'new';
  iceGatheringState = 'new';
  remoteDescription: unknown = null;
  /** Records what was asked for, so the reliability split can be asserted. */
  channels: Array<{ label: string; config: Record<string, unknown> }> = [];
  readonly config: RTCConfiguration | undefined;
  private iceStateListeners: Array<() => void> = [];
  createDataChannel = (label: string, config: Record<string, unknown>) => {
    this.channels.push({ label, config });
    return { label, readyState: 'open', close: () => undefined, send: () => undefined };
  };
  createOffer = async () => ({ type: 'offer', sdp: 'fake' });
  createAnswer = async () => ({ type: 'answer', sdp: 'fake' });
  setLocalDescription = async () => undefined;
  setRemoteDescription = async (sdp: unknown) => { this.remoteDescription = sdp; };
  addIceCandidate = async () => undefined;
  addEventListener = (type: string, handler: () => void) => {
    if (type === 'iceconnectionstatechange') this.iceStateListeners.push(handler);
  };
  fireIce(state: string): void {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
    this.iceStateListeners.forEach((handler) => handler());
  }
  fireGathering(state: string): void {
    this.iceGatheringState = state;
    this.onicegatheringstatechange?.();
  }
  close = () => undefined;

  constructor(config?: RTCConfiguration) {
    this.config = config;
  }
}

let socket: FakeWebSocket;
const peerConnections: FakePeerConnection[] = [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deliver = (message: ServerToClient) => socket.onmessage?.({ data: JSON.stringify(message) });

describe('WebRTCNetworkEngine signaling', () => {
  let engine: WebRTCNetworkEngine;

  beforeEach(async () => {
    (globalThis as any).WebSocket = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        socket = this;
      }
    };
    peerConnections.length = 0;
    (globalThis as any).RTCPeerConnection = class extends FakePeerConnection {
      constructor(config?: RTCConfiguration) {
        super(config);
        peerConnections.push(this);
      }
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    engine = new WebRTCNetworkEngine(
      { iceServers: [], signalingServerUrl: 'ws://localhost:8080' },
      { ordered: true },
      'player_host'
    );
    await engine.initialize();
  });

  afterEach(() => {
    engine.destroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('tells the host a peer joined without waiting for a data channel', async () => {
    const joined: string[] = [];
    engine.onPeerJoined((peerId) => joined.push(peerId));

    deliver({ type: 'PEER_JOINED', peerId: 'player_joiner' });
    await flush();

    expect(joined).toEqual(['player_joiner']);
  });

  // The queue chains .then per message, so a single rejection used to skip the
  // callback of every message behind it — signaling died silently and for good.
  it('keeps processing messages after one of them fails', async () => {
    const joined: string[] = [];
    engine.onPeerJoined((peerId) => joined.push(peerId));

    // No peer connection exists for this sender, so handling it throws.
    deliver({ type: 'SIGNAL', from: 'ghost', data: { kind: 'answer', sdp: {} } });
    await flush();

    deliver({ type: 'PEER_JOINED', peerId: 'player_joiner' });
    await flush();

    expect(joined).toEqual(['player_joiner']);
  });

  // The server only ever relays setup traffic, so once the data channels are up
  // the game must survive without it — that is the whole peer-to-peer premise.
  it('closes signaling without disturbing peer connections', async () => {
    engine.onPeerJoined(() => undefined);
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);

    engine.closeSignaling();

    expect(socket.readyState).toBe(3);
    expect(engine.getConnections()).toEqual([]); // no peers here, but none were torn down
  });

  it('pings while the signaling socket is open so an idle lobby is not dropped', async () => {
    engine.destroy();
    jest.useFakeTimers();
    engine = new WebRTCNetworkEngine(
      { iceServers: [], signalingServerUrl: 'ws://localhost:8080' },
      { ordered: true },
      'player_host'
    );
    const opened = engine.initialize();
    jest.runOnlyPendingTimers();
    await opened;
    socket.sent = [];
    jest.advanceTimersByTime(SIGNALING_PING_INTERVAL_MS);
    expect(socket.sent.map((m) => JSON.parse(m).type)).toContain('PING');
  });

  it('reports an unexpected signaling close, but not closeSignaling()', async () => {
    const codes: number[] = [];
    engine.onSignalingClosed((code) => codes.push(code));

    (socket as any).onclose?.({ code: 1006, wasClean: false, reason: '' });
    expect(codes).toEqual([1006]);

    codes.length = 0;
    engine.closeSignaling();
    (socket as any).onclose?.({ code: 1000, wasClean: true, reason: '' });
    expect(codes).toEqual([]);
  });

  // A bare socket close is silent by design, so a deliberate teardown has to
  // tell the server it is really leaving — otherwise the other peers are never
  // told to tear down their side.
  it('announces LEAVE_ROOM before closing on destroy', async () => {
    engine.destroy();

    expect(socket.sent.map((m) => JSON.parse(m).type)).toContain('LEAVE_ROOM');
    expect(socket.readyState).toBe(3);
  });

  it('derives the HTTP /log endpoint from the signaling URL', () => {
    expect((engine as any).logUrl()).toBe('http://localhost:8080/log');
  });

  // The whole point of the probe: the diagnostic must travel when the signaling
  // socket is exactly what died, so it beacons over HTTP on close.
  it('beacons the socket close code for diagnostics', async () => {
    const sendBeacon = jest.fn();
    (globalThis as any).navigator = { sendBeacon };

    expect(() => (socket as any).onclose?.({ code: 1006, wasClean: false, reason: '' })).not.toThrow();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, payload] = sendBeacon.mock.calls[0];
    expect(url).toBe('http://localhost:8080/log');
    expect(JSON.parse(payload).events.join('\n')).toContain('ws close code=1006');

    delete (globalThis as any).navigator;
  });

  it('drops late ICE candidates instead of throwing once signaling is closed', async () => {
    engine.closeSignaling();

    // setupPeer's onicecandidate fires on a connection whose socket is gone.
    expect(() => (engine as any).setupPeer('player_joiner').connection.onicecandidate({
      candidate: { toJSON: () => ({}) }
    })).not.toThrow();
  });

  it('does not fail on a server error arriving with no room request pending', async () => {
    const joined: string[] = [];
    engine.onPeerJoined((peerId) => joined.push(peerId));

    // Trickle ICE aimed at a peer that already left produces exactly this.
    deliver({ type: 'ERROR', message: 'Peer player_joiner not in room' });
    await flush();

    deliver({ type: 'PEER_JOINED', peerId: 'player_joiner2' });
    await flush();

    expect(joined).toEqual(['player_joiner2']);
  });

  const turnServers = [
    { urls: ['stun:stun.example'] },
    { urls: ['turn:8.8.8.8:3478?transport=udp'], username: 'u', credential: 'c' }
  ];

  const joinWith = async (peers: string[], iceServers = turnServers, hostId = 'host') => {
    const joining = engine.joinRoom('ABC123');
    deliver({ type: 'ROOM_JOINED', roomCode: 'ABC123', peers, hostId, iceServers });
    await joining;
  };

  it('passes TURN servers into the peer connection without the signaling URL', async () => {
    await joinWith(['host']);

    expect(peerConnections[0].config?.iceServers).toEqual(turnServers);
    expect(peerConnections[0].config?.iceTransportPolicy).toBe('all');
    expect(peerConnections[0].config).not.toHaveProperty('signalingServerUrl');
    expect(peerConnections[0].config).not.toHaveProperty('dialPolicy');
  });

  it('dials only the host under star dialPolicy', async () => {
    engine.destroy();
    engine = new WebRTCNetworkEngine(
      { iceServers: [], signalingServerUrl: 'ws://localhost:8080', dialPolicy: 'host' },
      { ordered: true },
      'player_joiner'
    );
    await engine.initialize();

    await joinWith(['host', 'other']);

    const offers = socket.sent
      .map((m) => JSON.parse(m))
      .filter((m) => m.type === 'SIGNAL' && m.data?.kind === 'offer');
    expect(offers.map((offer) => offer.to)).toEqual(['host']);
  });

  it('redials relay-only when ICE disconnects before ever connecting', async () => {
    await joinWith(['host']);
    expect(peerConnections).toHaveLength(1);

    peerConnections[0].fireIce('disconnected');
    await flush();

    expect(peerConnections).toHaveLength(2);
    expect(peerConnections[1].config?.iceTransportPolicy).toBe('relay');
    const offers = socket.sent
      .map((m) => JSON.parse(m))
      .filter((m) => m.type === 'SIGNAL' && m.data?.kind === 'offer');
    expect(offers).toHaveLength(2);
  });

  it('retries via relay when gathering finishes with no relay candidate', async () => {
    await joinWith(['host']);
    peerConnections[0].fireGathering('complete');
    await flush();

    expect(peerConnections).toHaveLength(2);
    expect(peerConnections[1].config?.iceTransportPolicy).toBe('relay');
  });

  it('does not tear down a working pair to force TURN', async () => {
    await joinWith(['host']);
    peerConnections[0].fireIce('connected');
    await flush();
    peerConnections[0].fireGathering('complete');
    await flush();
    expect(peerConnections).toHaveLength(1);
  });

  it('does not relay-retry when no TURN server was issued', async () => {
    await joinWith(['host'], [{ urls: ['stun:stun.example'] }]);
    peerConnections[0].fireIce('disconnected');
    await flush();
    expect(peerConnections).toHaveLength(1);
  });
});

describe('WebRTCNetworkEngine data channels', () => {
  let engine: WebRTCNetworkEngine;

  beforeEach(async () => {
    (globalThis as any).WebSocket = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        socket = this;
      }
    };
    peerConnections.length = 0;
    // Only this block dials directly, so only it needs the offer half of the
    // handshake; the signaling tests above deliberately let connect() fail.
    (globalThis as any).RTCPeerConnection = class extends FakePeerConnection {
      constructor(config?: RTCConfiguration) {
        super(config);
        peerConnections.push(this);
      }
    };

    engine = new WebRTCNetworkEngine(
      { iceServers: [], signalingServerUrl: 'ws://localhost:8080' },
      { ordered: true },
      'player_host'
    );
    await engine.initialize();
    await engine.connect('peer-1');
  });

  it('opens a reliable and an unreliable channel per peer, with the right configs', () => {
    const [reliable, unreliable] = peerConnections[0].channels;

    expect(peerConnections[0].channels.map((c) => c.label)).toEqual([RELIABLE_CHANNEL, UNRELIABLE_CHANNEL]);
    // Omitting maxRetransmits is what makes SCTP retransmit until delivered;
    // setting it to 0 is what makes the sibling lossy on purpose.
    expect(reliable.config.maxRetransmits).toBeUndefined();
    expect(reliable.config.ordered).toBe(true);
    expect(unreliable.config).toEqual(UNRELIABLE_CHANNEL_CONFIG);
  });

  it('tells the two apart by label when it is the answering side', () => {
    const peer = engine['connections'].get('peer-1')!;
    const connected: string[] = [];
    engine.onPeerConnected((id) => connected.push(id));

    // Arrive out of order: the unreliable one must not be taken for the
    // reliable one, which is the only channel that reports a peer as connected.
    peerConnections[0].ondatachannel!({
      channel: { label: UNRELIABLE_CHANNEL, close: () => undefined }
    } as never);
    expect(connected).toEqual([]);

    const reliable: Record<string, unknown> = { label: RELIABLE_CHANNEL, close: () => undefined };
    peerConnections[0].ondatachannel!({ channel: reliable } as never);
    (reliable.onopen as () => void)();

    expect(connected).toEqual(['peer-1']);
    expect(peer.fastChannel).not.toBeNull();
  });

  it('still reports isConnected through an ICE disconnect while the channel is open', () => {
    expect(engine.isConnected('peer-1')).toBe(true);
    const failed: string[] = [];
    engine.onPeerFailed((id) => failed.push(id));

    peerConnections[0].fireIce('disconnected');

    expect(engine.isConnected('peer-1')).toBe(true);
    expect(failed).toEqual([]);
  });
});

describe('describeCandidate', () => {
  it('names host, srflx and relay candidates with protocol and IP version', () => {
    expect(describeCandidate('candidate:1 1 udp 1 192.168.1.2 9 typ host'))
      .toBe('host udp v4');
    expect(describeCandidate('candidate:1 1 udp 1 203.0.113.1 9 typ srflx raddr 192.168.1.2 rport 9'))
      .toBe('srflx udp v4');
    expect(describeCandidate('candidate:1 1 udp 1 8.231.224.49 9 typ relay raddr 0.0.0.0 rport 0'))
      .toBe('relay udp v4');
    expect(describeCandidate('candidate:1 1 tcp 1 2600:1011::1 9 typ host tcptype active'))
      .toBe('host tcp v6');
  });

  it('labels the end-of-gathering null candidate', () => {
    expect(describeCandidate(null)).toBe('end');
    expect(describeCandidate({ candidate: '' })).toBe('end');
  });
});
