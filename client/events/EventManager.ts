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
    console.log('[EventManager] emit called with event:', event);
    console.log('[EventManager] Payload:', payload);
    
    const eventHandler = this.eventHandlers[event];
    if (!eventHandler) {
      console.warn('[EventManager] No event handler found for:', event);
      return;
    }
    
    console.log('[EventManager] Calling event handler for:', event);
    eventHandler(payload as EventPayloadMap[T]);
    console.log('[EventManager] Event handler completed for:', event);
  }

  /**
   * Set up all event handlers for GameWork components programmatically
   */
  setupEventHandlers(): void {
    console.log('[EventManager] setupEventHandlers called');
    
    // Store references for use in other methods
    console.log('[EventManager] Getting component references');
    this.networkEngine = this.gameWork.network;
    this.gameEngine = this.gameWork.gameEngine;
    this.uiEngine = this.gameWork.uiEngine;
    
    console.log('[EventManager] NetworkEngine:', this.networkEngine);
    console.log('[EventManager] GameEngine:', this.gameEngine);
    console.log('[EventManager] UIEngine:', this.uiEngine);
    
    // Map of component names to their instances
    const componentMapping = new Map([
      ['NetworkEngine', this.networkEngine],
      ['GameEngine', this.gameEngine],
      ['UIEngine', this.uiEngine],
      ['GameWork', this] // GameWork is the EventManager itself
    ]);

    console.log('[EventManager] Component mapping:', componentMapping);

    // Programmatically set up all event handlers based on event flow configuration
    console.log('[EventManager] Setting up event handlers for:', Object.keys(this.eventFlow));
    Object.entries(this.eventFlow).forEach(([eventName, eventConfig]) => {
      console.log(`[EventManager] Setting up handler for ${eventName}`);
      this.eventHandlers[eventName as EventName] = (payload: EventPayloadMap[EventName]) => {
        console.log(`[EventManager] Event ${eventName} emitted to ${eventConfig.listeners.map(l => l.component)} with payload:`, payload);

        // Call all listeners for this event
        eventConfig.listeners.forEach((listener) => {
          console.log(`[EventManager] Calling ${listener.component}.${listener.method}`);
          const component = componentMapping.get(listener.component);
          if (!component) {
            console.warn(`[EventManager] Component ${listener.component} not found for event ${eventName}`);
            console.warn(`[EventManager] Available components:`, Array.from(componentMapping.keys()));
            return;
          }
          
          // Check if the method exists on the component
          if (typeof component[listener.method] !== 'function') {
            console.warn(`[EventManager] Method ${listener.method} not found on ${listener.component} for event ${eventName}`);
            console.warn(`[EventManager] Available methods on ${listener.component}:`, Object.getOwnPropertyNames(component));
            return;
          }
          
          // Call the handler method
          console.log(`[EventManager] Calling ${listener.component}.${listener.method} with payload:`, payload);
          try {
            component[listener.method](payload);
            console.log(`[EventManager] ${listener.component}.${listener.method} completed`);
          } catch (error) {
            console.error(`[EventManager] Error calling ${listener.component}.${listener.method}:`, error);
          }
        });
      };
    });
    
    console.log('[EventManager] Event handlers setup complete');
  }

  /**
   * Update component references after they are initialized
   */
  updateComponents(gameEngine: any, uiEngine: any): void {
    console.log('[EventManager] updateComponents called');
    console.log('[EventManager] GameEngine:', gameEngine);
    console.log('[EventManager] UIEngine:', uiEngine);
    
    this.gameEngine = gameEngine;
    this.uiEngine = uiEngine;
    
    // Update component mapping
    const componentMapping = new Map([
      ['NetworkEngine', this.networkEngine],
      ['GameEngine', this.gameEngine],
      ['UIEngine', this.uiEngine],
      ['GameWork', this] // GameWork is the EventManager itself
    ]);

    console.log('[EventManager] Updated component mapping:', componentMapping);
    
    // Re-setup event handlers with updated components
    this.setupEventHandlers();
  }
}
