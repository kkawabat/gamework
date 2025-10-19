/**
 * EventBus - Pure event communication for GameWork v2
 * 
 * Provides type-safe event handling with:
 * - Type-safe event payloads
 * - Async event handling
 * - Event middleware support
 * - Debugging and logging
 */

export interface EventHandler<T = any> {
  (payload: T): void | Promise<void>;
}

export interface EventMiddleware<T = any> {
  (event: string, payload: T, next: () => void): void;
}

export interface EventBus {
  emit<T>(event: string, payload: T): void;
  on<T>(event: string, handler: EventHandler<T>): () => void;
  off(event: string, handler: EventHandler): void;
  once<T>(event: string, handler: EventHandler<T>): void;
  addMiddleware(middleware: EventMiddleware): void;
  removeMiddleware(middleware: EventMiddleware): void;
  getEventNames(): string[];
  getHandlerCount(event: string): number;
}

export class GameEventBus implements EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private middlewares: Set<EventMiddleware> = new Set();
  private debugMode: boolean = false;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  emit<T>(event: string, payload: T): void {
    if (this.debugMode) {
      console.log(`[EventBus] Emitting event: ${event}`, payload);
    }

    // Apply middlewares
    this.applyMiddlewares(event, payload, () => {
      this.executeHandlers(event, payload);
    });
  }

  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    
    this.handlers.get(event)!.add(handler);
    
    if (this.debugMode) {
      console.log(`[EventBus] Handler registered for event: ${event}`);
    }
    
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
      
      if (this.debugMode) {
        console.log(`[EventBus] Handler removed for event: ${event}`);
      }
    }
  }

  once<T>(event: string, handler: EventHandler<T>): void {
    const onceHandler = (payload: T) => {
      handler(payload);
      this.off(event, onceHandler);
    };
    
    this.on(event, onceHandler);
  }

  addMiddleware(middleware: EventMiddleware): void {
    this.middlewares.add(middleware);
    
    if (this.debugMode) {
      console.log('[EventBus] Middleware added');
    }
  }

  removeMiddleware(middleware: EventMiddleware): void {
    this.middlewares.delete(middleware);
    
    if (this.debugMode) {
      console.log('[EventBus] Middleware removed');
    }
  }

  getEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  getHandlerCount(event: string): number {
    const eventHandlers = this.handlers.get(event);
    return eventHandlers ? eventHandlers.size : 0;
  }

  private applyMiddlewares<T>(event: string, payload: T, next: () => void): void {
    const middlewares = Array.from(this.middlewares);
    let index = 0;

    const runMiddleware = () => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        middleware(event, payload, runMiddleware);
      } else {
        next();
      }
    };

    runMiddleware();
  }

  private executeHandlers<T>(event: string, payload: T): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.forEach(handler => {
        try {
          const result = handler(payload);
          
          // Handle async handlers
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(`[EventBus] Error in async handler for event ${event}:`, error);
            });
          }
        } catch (error) {
          console.error(`[EventBus] Error in handler for event ${event}:`, error);
        }
      });
    }
  }
}
