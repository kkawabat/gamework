/**
 * GameWork v2 - Clean Architecture Framework
 * 
 * Main entry point for the GameWork framework
 */

// Core exports
export { GameWork } from './core/GameWork';
export { StateStore, Action } from './core/StateStore';
export { EventBus, EventHandler, EventMiddleware } from './core/EventBus';
export { DIContainer, SERVICE_TOKENS } from './core/DIContainer';
export { 
  ErrorHandler, 
  GameError, 
  ErrorType, 
  ErrorSeverity,
  createGameError,
  createNetworkError,
  createGameLogicError,
  createUIError,
  createStateError
} from './core/ErrorHandler';

// Engine exports
export { GameEngine } from './engines/GameEngine';
export { UIEngine } from './engines/UIEngine';
export { NetworkEngine, BaseNetworkEngine } from './engines/NetworkEngine';

// Type exports
export * from './types/GameTypes';
export * from './types/NetworkTypes';

// Re-export for convenience
export { GameWork as default } from './core/GameWork';
