import { EventListeners, NetworkEngineEvents, GameEngineEvents, RenderEngineEvents } from './types/EventInterfaces';

type AllEventPayloads = NetworkEngineEvents & GameEngineEvents & RenderEngineEvents;
type EventName = keyof AllEventPayloads;
type EventListener<T extends EventName> = (payload: AllEventPayloads[T]) => void;

/**
 * EventManager - Centralized event handling system
 * 
 * Manages all events across NetworkEngine, GameEngine, and RenderEngine
 * with defined listeners for each event type.
 */
export class EventManager {
  private listeners: Map<string, EventListener<any>[]> = new Map();
  private eventListeners: EventListeners;
  private networkEngine: any;
  private gameEngine: any;
  private renderingEngine: any;
  private gameWork: any;

  constructor() {
    this.eventListeners = {
      // NetworkEngine Events
      playerMove: ['GameEngine', 'RenderEngine'],
      playerJoined: ['GameEngine', 'RenderEngine'],
      playerLeft: ['GameEngine', 'RenderEngine'],
      roomCreated: ['GameWork'],
      roomClosed: ['GameWork', 'RenderEngine'],
      connectionLost: ['GameWork', 'RenderEngine'],
      connectionRestored: ['GameWork'],
      chatMessage: ['RenderEngine'],

      // GameEngine Events
      stateChange: ['RenderEngine', 'NetworkEngine'],
      playerMoveApplied: ['RenderEngine'],
      turnChange: ['RenderEngine', 'NetworkEngine'],
      gameOver: ['RenderEngine', 'NetworkEngine'],
      scoreUpdate: ['RenderEngine'],

      // RenderEngine Events
      renderComplete: ['GameWork', 'GameEngine'],
      animationEnd: ['GameEngine', 'GameWork'],
      uiInteraction: ['NetworkEngine', 'GameEngine'],

      error: ['GameWork', 'RenderEngine', 'GameEngine'],
    };
  }

  /**
   * Register a listener for a specific event
   */
  on<T extends EventName>(event: T, listener: EventListener<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * Remove a listener for a specific event
   */
  off<T extends EventName>(event: T, listener: EventListener<T>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  emit<T extends EventName>(event: T, payload: AllEventPayloads[T]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(payload);
        } catch (error) {
          console.error(`[EventManager] Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get the expected listeners for an event
   */
  getExpectedListeners(event: string): string[] {
    return this.eventListeners[event as keyof EventListeners] || [];
  }

  /**
   * Validate that all expected listeners are registered
   */
  validateListeners(): { event: string, missing: string[] }[] {
    const issues: { event: string, missing: string[] }[] = [];
    
    Object.entries(this.eventListeners).forEach(([event, expectedListeners]) => {
      const registeredListeners = this.listeners.get(event) || [];
      const missing = expectedListeners.filter((listener: string) => 
        !registeredListeners.some(registered => 
          registered.name === listener || registered.toString().includes(listener)
        )
      );
      
      if (missing.length > 0) {
        issues.push({ event, missing });
      }
    });
    
    return issues;
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get listener count for an event
   */
  getListenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0;
  }

  /**
   * Set up all event handlers for GameWork components
   */
  setupGameWorkEventHandlers(
    networkEngine: any,
    gameEngine: any,
    renderingEngine: any,
    gameWork: any
  ): void {
    // Store references for use in other methods
    this.networkEngine = networkEngine;
    this.gameEngine = gameEngine;
    this.renderingEngine = renderingEngine;
    this.gameWork = gameWork;
    // NetworkEngine event handlers
    networkEngine.setEvents({
      onPlayerJoined: (payload: { playerId: string, playerName?: string }) => {
        this.emit('playerJoined', payload);
      },
      onPlayerLeft: (payload: { playerId: string }) => {
        this.emit('playerLeft', payload);
      },
      onError: (payload: { code: string, message: string }) => {
        this.emit('error', payload);
      },
      onRoomCreated: (payload: { roomId: string, hostId: string }) => {
        this.emit('roomCreated', payload);
      },
      onRoomClosed: (payload: { roomId: string }) => {
        this.emit('roomClosed', payload);
      },
      onConnectionLost: (payload: { playerId?: string, reason?: string }) => {
        this.emit('connectionLost', payload);
      },
      onConnectionRestored: (payload: { playerId?: string }) => {
        this.emit('connectionRestored', payload);
      },
      onChatMessage: (payload: { playerId: string, message: string }) => {
        this.emit('chatMessage', payload);
      },
    });

    // GameWork internal event listeners
    this.on('playerJoined', (payload: { playerId: string, playerName?: string }) => {
      console.log(`[GameWork] Player joined: ${payload.playerId}`);
    });

    this.on('playerLeft', (payload: { playerId: string }) => {
      console.log(`[GameWork] Player left: ${payload.playerId}`);
    });

    this.on('error', (payload: { code: string, message: string }) => {
      console.error(`[GameWork] Error: ${payload.message}`);
    });

    this.on('roomCreated', (payload: { roomId: string, hostId: string }) => {
      console.log(`[GameWork] Room created: ${payload.roomId}`);
    });

    this.on('roomClosed', (payload: { roomId: string }) => {
      console.log(`[GameWork] Room closed: ${payload.roomId}`);
    });

    this.on('connectionLost', (payload: { playerId?: string, reason?: string }) => {
      console.warn(`[GameWork] Connection lost: ${payload.playerId || 'unknown'}`);
    });

    this.on('connectionRestored', (payload: { playerId?: string }) => {
      console.log(`[GameWork] Connection restored: ${payload.playerId || 'unknown'}`);
    });

    // Set up NetworkEngine to listen to playerMove events
    this.on('playerMove', (payload: any) => {
      console.log(`[EventManager] Forwarding playerMove to NetworkEngine`);
      this.networkEngine.sendMove(payload);
    });
  }


}
