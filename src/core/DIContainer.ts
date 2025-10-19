/**
 * DIContainer - Dependency injection container for GameWork v2
 * 
 * Provides clean dependency management with:
 * - Service registration and resolution
 * - Singleton and transient lifetimes
 * - Scoped dependencies
 * - Easy mocking for tests
 */

export interface ServiceFactory<T = any> {
  (): T;
}

export interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  dependencies: string[];
}

export interface DIContainer {
  register<T>(token: string, factory: ServiceFactory<T>): void;
  registerSingleton<T>(token: string, factory: ServiceFactory<T>): void;
  registerWithDependencies<T>(token: string, factory: ServiceFactory<T>, dependencies: string[]): void;
  resolve<T>(token: string): T;
  createScope(): DIContainer;
  isRegistered(token: string): boolean;
  clear(): void;
}

export class GameDIContainer implements DIContainer {
  private services: Map<string, ServiceRegistration> = new Map();
  private singletons: Map<string, any> = new Map();
  private parent?: DIContainer;

  constructor(parent?: DIContainer) {
    this.parent = parent;
  }

  register<T>(token: string, factory: ServiceFactory<T>): void {
    this.services.set(token, {
      factory,
      singleton: false,
      dependencies: []
    });
  }

  registerSingleton<T>(token: string, factory: ServiceFactory<T>): void {
    this.services.set(token, {
      factory,
      singleton: true,
      dependencies: []
    });
  }

  registerWithDependencies<T>(token: string, factory: ServiceFactory<T>, dependencies: string[]): void {
    this.services.set(token, {
      factory,
      singleton: false,
      dependencies
    });
  }

  resolve<T>(token: string): T {
    // Check if already resolved as singleton
    if (this.singletons.has(token)) {
      return this.singletons.get(token);
    }

    // Get service registration
    const registration = this.services.get(token);
    if (!registration) {
      // Try parent container
      if (this.parent) {
        return this.parent.resolve<T>(token);
      }
      throw new Error(`Service '${token}' not found`);
    }

    // Create instance
    const instance = registration.factory();

    // Store singleton if needed
    if (registration.singleton) {
      this.singletons.set(token, instance);
    }

    return instance;
  }

  createScope(): DIContainer {
    return new GameDIContainer(this);
  }

  isRegistered(token: string): boolean {
    return this.services.has(token) || (this.parent?.isRegistered(token) ?? false);
  }

  clear(): void {
    this.services.clear();
    this.singletons.clear();
  }
}

// Service tokens for common services
export const SERVICE_TOKENS = {
  STATE_STORE: 'StateStore',
  EVENT_BUS: 'EventBus',
  GAME_ENGINE: 'GameEngine',
  UI_ENGINE: 'UIEngine',
  NETWORK_ENGINE: 'NetworkEngine',
  ERROR_HANDLER: 'ErrorHandler',
  LOGGER: 'Logger',
  CONFIG: 'Config'
} as const;
