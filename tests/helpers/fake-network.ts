import { SessionTransport } from '../../src/session/Session';
import { Connectivity, DeviceId } from '../../src/session/SessionTypes';
import { Delivery } from '../../src/types/NetworkTypes';
import { NetworkMessage } from '../../src/types/GameTypes';

/**
 * An in-memory stand-in for the WebRTC mesh. It models the one thing that
 * actually differs between connectivities — who can reach whom — so the routing
 * assertions below are about the session layer and not about a mock's opinion.
 */
export class FakeNet {
  readonly transports = new Map<DeviceId, FakeTransport>();
  hostId: DeviceId | null = null;

  constructor(private readonly connectivity: Connectivity) {}

  /** Mesh: everyone. Star: the hub sees all spokes, a spoke sees only the hub. */
  peersOf(deviceId: DeviceId): DeviceId[] {
    const others = [...this.transports.keys()].filter((id) => id !== deviceId);
    if (this.connectivity === 'mesh' || deviceId === this.hostId) return others;
    return this.hostId ? [this.hostId] : [];
  }

  /** Every message that crossed the fake wire, with the channel it took. */
  readonly sent: Array<{ from: DeviceId; to: DeviceId; delivery: Delivery; channel: string }> = [];

  deliver(from: DeviceId, to: DeviceId, message: NetworkMessage, delivery: Delivery): void {
    const envelope = message.payload as { kind: string; channel?: string };
    this.sent.push({ from, to, delivery, channel: envelope.channel ?? envelope.kind });
    this.transports.get(to)?.receive(from, message);
  }

  /** Which transport a given session channel (or control kind) actually used. */
  deliveriesFor(channel: string): Delivery[] {
    return this.sent.filter((entry) => entry.channel === channel).map((entry) => entry.delivery);
  }
}

export class FakeTransport implements SessionTransport {
  signalingOpen = true;
  private messageCbs = new Set<(from: DeviceId, m: NetworkMessage) => void>();
  private joinedCbs = new Set<(id: DeviceId) => void>();
  private connectedCbs = new Set<(id: DeviceId) => void>();
  private failedCbs = new Set<(id: DeviceId) => void>();

  constructor(readonly net: FakeNet, readonly deviceId: DeviceId) {
    net.transports.set(deviceId, this);
  }

  async initialize(): Promise<void> {}
  async createRoom(): Promise<string> {
    this.net.hostId = this.deviceId;
    return 'ROOM01';
  }
  async joinRoom(): Promise<boolean> {
    return true;
  }
  getHostId(): DeviceId | null {
    return this.net.hostId;
  }
  sendMessage(to: DeviceId, message: NetworkMessage, delivery: Delivery = 'reliable'): void {
    this.net.deliver(this.deviceId, to, message, delivery);
  }
  broadcast(message: NetworkMessage, delivery: Delivery = 'reliable'): void {
    for (const peer of this.net.peersOf(this.deviceId)) {
      this.net.deliver(this.deviceId, peer, message, delivery);
    }
  }
  onMessage(cb: (from: DeviceId, m: NetworkMessage) => void): () => void {
    this.messageCbs.add(cb);
    return () => this.messageCbs.delete(cb);
  }
  onPeerJoined(cb: (id: DeviceId) => void): () => void {
    this.joinedCbs.add(cb);
    return () => this.joinedCbs.delete(cb);
  }
  onPeerConnected(cb: (id: DeviceId) => void): () => void {
    this.connectedCbs.add(cb);
    return () => this.connectedCbs.delete(cb);
  }
  onPeerFailed(cb: (id: DeviceId) => void): () => void {
    this.failedCbs.add(cb);
    return () => this.failedCbs.delete(cb);
  }
  isConnected(id: DeviceId): boolean {
    return this.net.peersOf(this.deviceId).includes(id);
  }
  getConnections(): DeviceId[] {
    return this.net.peersOf(this.deviceId);
  }
  closeSignaling(): void {
    this.signalingOpen = false;
  }
  destroy(): void {}

  receive(from: DeviceId, message: NetworkMessage): void {
    this.messageCbs.forEach((cb) => cb(from, message));
  }
  /** Stand in for the data channel opening, which is what triggers `hello`. */
  fireConnected(id: DeviceId): void {
    this.connectedCbs.forEach((cb) => cb(id));
  }
}
