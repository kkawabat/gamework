/**
 * ErrorHandler - Centralized error handling for GameWork v2
 * 
 * Provides comprehensive error management with:
 * - Error categorization and handling
 * - Automatic retry mechanisms
 * - Graceful degradation
 * - Error reporting and logging
 */

export enum ErrorType {
  NETWORK = 'NETWORK',
  GAME_LOGIC = 'GAME_LOGIC',
  UI = 'UI',
  STATE = 'STATE',
  CONFIGURATION = 'CONFIGURATION',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface GameError extends Error {
  type: ErrorType;
  severity: ErrorSeverity;
  context: string;
  recoverable: boolean;
  retryCount: number;
  maxRetries: number;
  timestamp: number;
}

export interface ErrorHandler {
  handle(error: GameError, context: string): void;
  recover(error: GameError): boolean;
  report(error: GameError): void;
  setRetryPolicy(type: ErrorType, maxRetries: number, delay: number): void;
  addErrorListener(listener: (error: GameError) => void): () => void;
}

export class GameErrorHandler implements ErrorHandler {
  private retryPolicies: Map<ErrorType, { maxRetries: number; delay: number }> = new Map();
  private errorListeners: Set<(error: GameError) => void> = new Set();
  private errorHistory: GameError[] = [];

  constructor() {
    this.setupDefaultRetryPolicies();
  }

  handle(error: GameError, context: string): void {
    // Add context to error
    error.context = context;
    error.timestamp = Date.now();

    // Log error
    console.error(`[ErrorHandler] ${error.type} error in ${context}:`, error);

    // Add to history
    this.errorHistory.push(error);

    // Notify listeners
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[ErrorHandler] Error in error listener:', listenerError);
      }
    });

    // Attempt recovery
    if (error.recoverable && error.retryCount < error.maxRetries) {
      this.attemptRecovery(error);
    } else {
      this.report(error);
    }
  }

  recover(error: GameError): boolean {
    if (!error.recoverable || error.retryCount >= error.maxRetries) {
      return false;
    }

    error.retryCount++;
    
    // Get retry policy
    const policy = this.retryPolicies.get(error.type);
    if (!policy) {
      return false;
    }

    // Schedule retry
    setTimeout(() => {
      this.attemptRecovery(error);
    }, policy.delay);

    return true;
  }

  report(error: GameError): void {
    // In a real implementation, this would send to error reporting service
    console.error(`[ErrorHandler] Reporting error:`, {
      type: error.type,
      severity: error.severity,
      context: error.context,
      message: error.message,
      stack: error.stack,
      timestamp: error.timestamp
    });
  }

  setRetryPolicy(type: ErrorType, maxRetries: number, delay: number): void {
    this.retryPolicies.set(type, { maxRetries, delay });
  }

  addErrorListener(listener: (error: GameError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private attemptRecovery(error: GameError): void {
    console.log(`[ErrorHandler] Attempting recovery for ${error.type} error (attempt ${error.retryCount})`);
    
    // Emit recovery event
    // This would be handled by the specific component that can recover
    // The actual recovery logic is implemented by the components themselves
  }

  private setupDefaultRetryPolicies(): void {
    this.setRetryPolicy(ErrorType.NETWORK, 3, 1000);
    this.setRetryPolicy(ErrorType.GAME_LOGIC, 1, 0);
    this.setRetryPolicy(ErrorType.UI, 2, 500);
    this.setRetryPolicy(ErrorType.STATE, 1, 0);
    this.setRetryPolicy(ErrorType.CONFIGURATION, 0, 0);
  }
}

// Utility functions for creating errors
export function createGameError(
  message: string,
  type: ErrorType,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  recoverable: boolean = true,
  maxRetries: number = 3
): GameError {
  const error = new Error(message) as GameError;
  error.type = type;
  error.severity = severity;
  error.recoverable = recoverable;
  error.retryCount = 0;
  error.maxRetries = maxRetries;
  error.timestamp = Date.now();
  return error;
}

export function createNetworkError(message: string, recoverable: boolean = true): GameError {
  return createGameError(message, ErrorType.NETWORK, ErrorSeverity.MEDIUM, recoverable);
}

export function createGameLogicError(message: string, recoverable: boolean = false): GameError {
  return createGameError(message, ErrorType.GAME_LOGIC, ErrorSeverity.HIGH, recoverable);
}

export function createUIError(message: string, recoverable: boolean = true): GameError {
  return createGameError(message, ErrorType.UI, ErrorSeverity.LOW, recoverable);
}

export function createStateError(message: string, recoverable: boolean = false): GameError {
  return createGameError(message, ErrorType.STATE, ErrorSeverity.HIGH, recoverable);
}
