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
    
    // Map of component names to their instances
    const componentMapping = new Map([
      ['NetworkEngine', this.networkEngine],
      ['GameEngine', this.gameEngine],
      ['UIEngine', this.uiEngine],
      ['GameWork', this] // GameWork is the EventManager itself
    ]);

    // Programmatically set up all event handlers based on event flow configuration
    Object.entries(this.eventFlow).forEach(([eventName, eventConfig]) => {
      this.eventHandlers[eventName as EventName] = (payload: EventPayloadMap[EventName]) => {
        console.log(`[EventManager] Event ${eventName} emitted to ${eventConfig.listeners.map(l => l.component)} with payload:`, payload);

        // Call all listeners for this event
        eventConfig.listeners.forEach((listener) => {
          const component = componentMapping.get(listener.component);
          if (!component) {
            console.warn(`[EventManager] Component ${listener.component} not found for event ${eventName}`);
            return;
          }
          
          // Check if the method exists on the component
          if (typeof component[listener.method] !== 'function') {
            console.warn(`[EventManager] Method ${listener.method} not found on ${listener.component} for event ${eventName}`);
            return;
          }
          
          // Call the handler method
          component[listener.method](payload);
        });
      };
    });
  }
}
