/**
 * GameWork v2 - Clean Architecture Framework
 * 
 * Main entry point for the GameWork framework
 */

// Core exports
export { GameWork } from './core/GameWork';
export type { StateStore, Action } from './core/StateStore';
export { GameStateStore } from './core/StateStore';
export type { EventBus, EventHandler, EventMiddleware } from './core/EventBus';
export { GameEventBus } from './core/EventBus';
export type { DIContainer } from './core/DIContainer';
export { GameDIContainer, SERVICE_TOKENS } from './core/DIContainer';
export type { ErrorHandler, GameError } from './core/ErrorHandler';
export {
  ErrorType,
  ErrorSeverity,
  createGameError,
  createNetworkError,
  createGameLogicError,
  createUIError,
  createStateError
} from './core/ErrorHandler';

// Session exports — devices, entities, roles and channels
export { Session, EntityHandle } from './session/Session';
export type { SessionTransport } from './session/Session';
export { SELF, resolveChannel, channelMatches, anyMatches } from './session/channels';
export * from './session/SessionTypes';

// Engine exports
export { GameEngine } from './engines/GameEngine';
export { UIEngine } from './engines/UIEngine';
export type { NetworkEngine } from './engines/NetworkEngine';
export { BaseNetworkEngine } from './engines/NetworkEngine';
export { WebRTCNetworkEngine } from './engines/WebRTCNetworkEngine';
export type { WebRTCNetworkEngineConfig } from './engines/WebRTCNetworkEngine';

// Type exports
export * from './types/GameTypes';
export * from './types/NetworkTypes';

// Re-export for convenience
export { GameWork as default } from './core/GameWork';
