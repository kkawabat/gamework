import { EventName, EventPayloadMap, EventFlows } from './EventFlow';

/**
 * EventManager - Centralized event handling system
 * 
 * Manages all events across NetworkEngine, GameEngine, and UIEngine
 * with defined listeners for each event type.
 */
export class EventManager {
  private eventHandlers: Record<EventName, (payload: EventPayloadMap[EventName]) => void> = {} as any;
  private eventFlow: EventFlows<EventPayloadMap>;
  private networkEngine: any;
  private gameEngine: any;
  private uiEngine: any;
  private gameWork: any;

  constructor(gameWork: any) {
    this.gameWork = gameWork;
    this.eventFlow = gameWork.eventFlow;

    this.setupEventHandlers();
  }

  /**
   * Emit an event to all registered listeners
   */
  emit<T extends EventName>(event: T, payload: EventPayloadMap[T]): void {
    const eventHandler = this.eventHandlers[event];
    if (!eventHandler) return;
    eventHandler(payload as EventPayloadMap[T])
  }

  /**
   * Set up all event handlers for GameWork components programmatically
   */
  setupEventHandlers(): void {
    // Store references for use in other methods
    this.networkEngine = this.gameWork.network;
    this.gameEngine = this.gameWork.gameEngine;
    this.uiEngine = this.gameWork.uiEngine;
    
    // Map of listener names to their component instances
    const listenerMapping = new Map([
      ['NetworkEngine', this.networkEngine],
      ['GameEngine', this.gameEngine],
      ['UIEngine', this.uiEngine],
      ['GameWork', this] // GameWork is the EventManager itself
    ]);

    // Programmatically set up all event handlers based on this.events configuration
    Object.entries(this.eventFlow).forEach(([eventName, eventConfig]) => {
      const handlerName = `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
      
      this.eventHandlers[eventName as EventName] = (payload: EventPayloadMap[EventName]) => {
        
        console.log(`[EventManager] Event ${eventName} emitted to ${eventConfig.listeners} with payload:`, payload);

        eventConfig.listeners.forEach((listenerName: string) => {
          const listener = listenerMapping.get(listenerName);
          if (!listener) return;
          listener[handlerName](payload);
        });
      };
    });
  }
}
