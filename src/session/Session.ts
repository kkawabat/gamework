import { NetworkMessage } from '../types/GameTypes';
import { Delivery } from '../types/NetworkTypes';
import { anyMatches, channelMatches, resolveChannel } from './channels';
import {
  Authority,
  Channel,
  DeviceId,
  Entity,
  EntityId,
  EntitySpec,
  Role,
  SessionEnvelope,
  SessionMode,
  SessionOptions,
  WriteMeta
} from './SessionTypes';

/**
 * The slice of WebRTCNetworkEngine the session needs. Declared structurally so
 * the engine satisfies it without inheriting anything, and so tests can drive a
 * session with a plain fake instead of a WebRTC stack.
 */
export interface SessionTransport {
  initialize(): Promise<void>;
  createRoom(): Promise<string>;
  joinRoom(roomCode: string): Promise<boolean>;
  getHostId(): string | null;
  sendMessage(deviceId: DeviceId, message: NetworkMessage, delivery?: Delivery): void;
  broadcast(message: NetworkMessage, delivery?: Delivery): void;
  onMessage(callback: (from: DeviceId, message: NetworkMessage) => void): () => void;
  onPeerJoined(callback: (deviceId: DeviceId) => void): () => void;
  onPeerConnected(callback: (deviceId: DeviceId) => void): () => void;
  onPeerFailed(callback: (deviceId: DeviceId) => void): () => void;
  isConnected(deviceId: DeviceId): boolean;
  getConnections(): DeviceId[];
  closeSignaling(): void;
  destroy(): void;
}

type ChannelHandler = (payload: unknown, meta: WriteMeta) => void;
type RegistryHandler = (entities: Entity[], locked: boolean) => void;

interface Subscription {
  pattern: string;
  handler: ChannelHandler;
}

/**
 * A handle for acting as one entity. A device hosting several — a host that is
 * both the admin console and a player, a tablet running two hot-seat players —
 * takes one handle each, and their permissions stay genuinely separate because
 * the permission belongs to the entity rather than to the connection.
 */
export class EntityHandle {
  constructor(private readonly session: Session, readonly id: EntityId) {}

  get role(): Role {
    return this.session.roleOf(this.id);
  }

  /** `{self}` in the channel name resolves to this entity's id. */
  write(channel: Channel, payload: unknown): void {
    this.session.write(this.id, resolveChannel(channel, this.id), payload);
  }

  /** Subscribe to a channel or pattern. Only fires for channels the role reads. */
  on(pattern: string, handler: ChannelHandler): () => void {
    return this.session.subscribe(this.id, pattern, handler);
  }

  canRead(channel: Channel): boolean {
    return anyMatches(this.role.reads, channel, this.id);
  }

  canWrite(channel: Channel): boolean {
    return anyMatches(this.role.writes, channel, this.id);
  }
}

/**
 * Owns everything about a session that is not the game's rules: who is
 * connected, which entities exist and where they live, and which of them a
 * given channel write should reach.
 *
 * Routing is entirely the channel ACLs. The mode is a declaration about where
 * the reducer runs, which no ACL can express.
 */
export class Session {
  private readonly transport: SessionTransport;
  private readonly mode: SessionMode;
  private readonly deviceId: DeviceId;
  private readonly roles: Map<string, Role>;
  private readonly localSpecs: EntitySpec[];
  private readonly caps: Record<string, number>;
  private readonly unreliablePatterns: string[];

  private registry: Entity[] = [];
  private hostFlag = false;
  /** The session is closed to new entities. A shared fact, authored by the host. */
  private lockedFlag = false;
  /** Purely local: whether this device has dropped its own signaling socket. */
  private signalingReleased = false;

  private subscriptions = new Map<EntityId, Set<Subscription>>();
  private handles = new Map<EntityId, EntityHandle>();
  private registryHandlers = new Set<RegistryHandler>();
  private unsubscribe: Array<() => void> = [];

  constructor(transport: SessionTransport, options: SessionOptions) {
    this.transport = transport;
    this.mode = options.mode;
    this.deviceId = options.deviceId;
    this.roles = new Map(options.roles.map((role) => [role.name, role]));
    this.localSpecs = options.entities;
    this.caps = options.maxEntities ?? {};
    this.unreliablePatterns = options.unreliable ?? [];
  }

  // --- Lifecycle -----------------------------------------------------------

  async initialize(): Promise<void> {
    await this.transport.initialize();
    this.unsubscribe.push(
      this.transport.onMessage((from, message) => this.receive(from, message)),
      // The host learns what a joiner brings over the data channel, not
      // signaling: signaling only ever knew a device id, and an entity needs a
      // role. So the joiner introduces itself once its channel opens.
      this.transport.onPeerConnected((peerId) => {
        if (!this.hostFlag && peerId === this.transport.getHostId()) this.sendHello();
      })
    );
  }

  async host(): Promise<string> {
    const roomCode = await this.transport.createRoom();
    this.hostFlag = true;
    this.admit(this.deviceId, this.localSpecs, { announce: false });
    this.notifyRegistry();
    return roomCode;
  }

  async join(roomCode: string): Promise<void> {
    await this.transport.joinRoom(roomCode);
    this.hostFlag = false;
  }

  /**
   * No more entities. Under mesh this drops signaling everywhere; under star
   * the hub keeps its socket, since it is the only node a late joiner could be
   * introduced to and one held socket per room beats N.
   */
  lock(): void {
    // The announcement is guarded but the socket release is not, and they need
    // different guards: a joiner learns `locked` from the host's broadcast
    // before it calls lock() itself, so guarding the release on lockedFlag too
    // would leave that device holding its signaling socket open all game.
    const alreadyLocked = this.lockedFlag;
    this.lockedFlag = true;
    if (this.hostFlag && !alreadyLocked) this.broadcastRegistry();
    this.releaseSignaling();
    if (!alreadyLocked) this.notifyRegistry();
  }

  destroy(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.subscriptions.clear();
    this.registryHandlers.clear();
    this.transport.destroy();
  }

  // --- Entities ------------------------------------------------------------

  /** Act as one of this device's entities. */
  actAs(entityId: EntityId): EntityHandle {
    const existing = this.handles.get(entityId);
    if (existing) return existing;
    const handle = new EntityHandle(this, entityId);
    this.handles.set(entityId, handle);
    return handle;
  }

  /** Every entity in the session, in admission order. */
  get entities(): Entity[] {
    return this.registry;
  }

  /** The entities hosted by this device. */
  get localEntities(): Entity[] {
    return this.registry.filter((entity) => entity.deviceId === this.deviceId);
  }

  entitiesOfRole(role: string): Entity[] {
    return this.registry.filter((entity) => entity.role === role);
  }

  /** The first local entity of a role — the common "which one am I" question. */
  localEntityOfRole(role: string): Entity | null {
    return this.localEntities.find((entity) => entity.role === role) ?? null;
  }

  roleOf(entityId: EntityId): Role {
    const entity = this.registry.find((candidate) => candidate.entityId === entityId);
    if (!entity) throw new Error(`Unknown entity ${entityId}`);
    const role = this.roles.get(entity.role);
    if (!role) throw new Error(`Entity ${entityId} has unknown role ${entity.role}`);
    return role;
  }

  // --- Roles ---------------------------------------------------------------

  /** Created the room. Owns the entity registry in every mode. */
  get isHost(): boolean {
    return this.hostFlag;
  }

  /**
   * Where the reducer runs, as declared. Deliberately not a per-device flag:
   * "am I the one who reduces" is answered precisely by whether this device
   * holds the role that reads the game's intent channel, which is the game's
   * own vocabulary. A generic `isAuthority` could only restate it more vaguely.
   */
  get authority(): Authority {
    return this.mode.authority;
  }

  get locked(): boolean {
    return this.lockedFlag;
  }

  onRegistry(handler: RegistryHandler): () => void {
    this.registryHandlers.add(handler);
    return () => this.registryHandlers.delete(handler);
  }

  onPeerJoined(handler: (deviceId: DeviceId) => void): () => void {
    return this.transport.onPeerJoined(handler);
  }

  onPeerConnected(handler: (deviceId: DeviceId) => void): () => void {
    return this.transport.onPeerConnected(handler);
  }

  onPeerFailed(handler: (deviceId: DeviceId) => void): () => void {
    return this.transport.onPeerFailed(handler);
  }

  // --- Channels ------------------------------------------------------------

  /** Prefer `actAs(id).write(...)`; this is what the handle calls through to. */
  write(author: EntityId, channel: Channel, payload: unknown): void {
    const role = this.roleOf(author);
    if (!anyMatches(role.writes, channel, author)) {
      throw new Error(`Role '${role.name}' may not write '${channel}'`);
    }
    const envelope: SessionEnvelope = { kind: 'write', from: this.deviceId, author, channel, payload };
    // On the wire first: a local handler may lock the session or throw, and the
    // copy other devices need must not depend on any of that succeeding.
    this.routeWrite(envelope, channel, this.deliveryFor(channel, author));
    this.deliver(channel, payload, { channel, author, from: this.deviceId });
  }

  subscribe(entityId: EntityId, pattern: string, handler: ChannelHandler): () => void {
    const subscription: Subscription = { pattern, handler };
    const existing = this.subscriptions.get(entityId) ?? new Set<Subscription>();
    existing.add(subscription);
    this.subscriptions.set(entityId, existing);
    return () => existing.delete(subscription);
  }

  // --- Wire ----------------------------------------------------------------

  private receive(from: DeviceId, message: NetworkMessage): void {
    if (message.type !== 'SESSION') return;
    const envelope = message.payload as SessionEnvelope;

    switch (envelope.kind) {
      case 'hello':
        // Only the host admits anyone. A hello reaching a non-host means a
        // joiner misidentified the host — a bug worth not papering over with an
        // admission nobody else would agree with.
        if (this.hostFlag) this.admit(envelope.from, envelope.entities, { announce: true });
        break;
      case 'registry':
        if (this.hostFlag) break; // the host is the author, never a recipient
        this.registry = envelope.entities;
        this.lockedFlag = envelope.locked;
        this.notifyRegistry();
        break;
      case 'write': {
        const role = this.roles.get(
          this.registry.find((entity) => entity.entityId === envelope.author)?.role ?? ''
        );
        // Validate on arrival too. Every device can check cheaply, and a write
        // the author's role does not permit is a bug somewhere, not a message.
        if (!role || !anyMatches(role.writes, envelope.channel, envelope.author)) {
          console.warn(`[gamework] dropped unauthorised write to '${envelope.channel}' by ${envelope.author}`);
          break;
        }
        this.relay(from, envelope, envelope.channel, envelope.author);
        this.deliver(envelope.channel, envelope.payload, {
          channel: envelope.channel, author: envelope.author, from
        });
        break;
      }
    }
  }

  /**
   * Pick the devices a write has to reach. Under mesh, every device holding a
   * reader. Under star a spoke can only reach the hub, so it sends there and
   * the hub forwards — the hub is a router regardless of whether it reads the
   * channel itself.
   */
  private routeWrite(envelope: SessionEnvelope, channel: Channel, delivery: Delivery): void {
    if (this.mode.connectivity === 'star' && !this.hostFlag) {
      const hub = this.transport.getHostId();
      if (hub && this.transport.isConnected(hub)) this.sendEnvelope(hub, envelope, delivery);
      return;
    }
    for (const deviceId of this.devicesReading(channel)) {
      if (deviceId !== this.deviceId && this.transport.isConnected(deviceId)) {
        this.sendEnvelope(deviceId, envelope, delivery);
      }
    }
  }

  /**
   * Control messages are never unreliable — they are one-shot and nothing
   * retries them, so a lost hello or registry hangs a device silently.
   */
  private deliveryFor(channel: Channel, author: EntityId): Delivery {
    return anyMatches(this.unreliablePatterns, channel, author) ? 'unreliable' : 'reliable';
  }

  /** The hub half of the above: spokes have no path to each other. */
  private relay(from: DeviceId, envelope: SessionEnvelope, channel: Channel, author: EntityId): void {
    if (!this.hostFlag || this.mode.connectivity !== 'star') return;
    const delivery = this.deliveryFor(channel, author);
    for (const deviceId of this.devicesReading(channel)) {
      if (deviceId !== from && deviceId !== this.deviceId && this.transport.isConnected(deviceId)) {
        this.sendEnvelope(deviceId, envelope, delivery);
      }
    }
  }

  private devicesReading(channel: Channel): Set<DeviceId> {
    const devices = new Set<DeviceId>();
    for (const entity of this.registry) {
      const role = this.roles.get(entity.role);
      if (role && anyMatches(role.reads, channel, entity.entityId)) devices.add(entity.deviceId);
    }
    return devices;
  }

  private deliver(channel: Channel, payload: unknown, meta: WriteMeta): void {
    for (const entity of this.localEntities) {
      const role = this.roles.get(entity.role);
      if (!role || !anyMatches(role.reads, channel, entity.entityId)) continue;
      const subs = this.subscriptions.get(entity.entityId);
      if (!subs) continue;
      for (const subscription of [...subs]) {
        if (channelMatches(subscription.pattern, channel, entity.entityId)) {
          subscription.handler(payload, meta);
        }
      }
    }
  }

  /** Host only. Assigns ids and admits what the caps and the lock allow. */
  private admit(deviceId: DeviceId, specs: EntitySpec[], { announce }: { announce: boolean }): void {
    if (this.registry.some((entity) => entity.deviceId === deviceId)) {
      // A device already in the registry saying hello again is one that came
      // back — a backgrounded tab whose channel died, or a reload that kept its
      // device id. Its entities are still here and still its own, so there is
      // nothing to admit; what it has lost is everything it was ever told. Send
      // the registry again and let the game republish behind it, which under
      // `authoritative` is the whole of the resync.
      //
      // This is not the claim token in docs/TODO.md: a device asserts its own
      // id rather than proving a right to an entity, so it recovers an accident
      // and would not stop a peer that claimed someone else's id. That is the
      // same honesty as the channel ACLs — a correctness boundary, not a trust
      // boundary — and a returning phone is the case that actually happens.
      this.sendRegistry(deviceId);
      this.notifyRegistry();
      return;
    }

    let admitted = false;
    for (const spec of specs) {
      if (!this.roles.has(spec.role)) continue;
      const ofRole = this.registry.filter((entity) => entity.role === spec.role).length;
      if (this.lockedFlag || ofRole >= (this.caps[spec.role] ?? Infinity)) continue;
      this.registry = [
        ...this.registry,
        { entityId: spec.entityId ?? `${spec.role}-${ofRole}`, role: spec.role, deviceId }
      ];
      admitted = true;
    }

    if (!admitted || !announce) return;
    this.broadcastRegistry();
    this.notifyRegistry();
  }

  private sendHello(): void {
    const hub = this.transport.getHostId();
    if (!hub) return;
    this.sendEnvelope(hub, { kind: 'hello', from: this.deviceId, entities: this.localSpecs });
  }

  private broadcastRegistry(): void {
    this.broadcastEnvelope(this.registryEnvelope());
  }

  /** The same announcement, to one device that has just come back. */
  private sendRegistry(to: DeviceId): void {
    if (this.transport.isConnected(to)) this.sendEnvelope(to, this.registryEnvelope());
  }

  private registryEnvelope(): SessionEnvelope {
    return { kind: 'registry', from: this.deviceId, entities: this.registry, locked: this.lockedFlag };
  }

  private notifyRegistry(): void {
    this.registryHandlers.forEach((handler) => handler(this.registry, this.lockedFlag));
  }

  private releaseSignaling(): void {
    if (this.signalingReleased) return;
    if (this.mode.connectivity === 'star' && this.hostFlag) return;
    this.signalingReleased = true;
    this.transport.closeSignaling();
  }

  private sendEnvelope(to: DeviceId, envelope: SessionEnvelope, delivery: Delivery = 'reliable'): void {
    this.transport.sendMessage(to, this.wrap(envelope, to), delivery);
  }

  private broadcastEnvelope(envelope: SessionEnvelope): void {
    this.transport.broadcast(this.wrap(envelope));
  }

  private wrap(envelope: SessionEnvelope, to?: DeviceId): NetworkMessage {
    return { type: 'SESSION', payload: envelope, from: this.deviceId, to, timestamp: Date.now() };
  }
}
