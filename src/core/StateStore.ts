/**
 * StateStore - Centralized state management for GameWork v2
 * 
 * Provides a single source of truth for game state with:
 * - Immutable state updates
 * - Reactive subscriptions
 * - Action dispatching
 * - State persistence
 */

export interface Action {
  type: string;
  payload?: any;
  timestamp?: number;
}

export interface StateStore<T> {
  getState(): T;
  setState(newState: T): void;
  subscribe(callback: (state: T) => void): () => void;
  dispatch(action: Action): void;
  reset(): void;
  getHistory(): T[];
  undo(): boolean;
  redo(): boolean;
}

export class GameStateStore<T> implements StateStore<T> {
  private state: T;
  private subscribers: Set<(state: T) => void> = new Set();
  private history: T[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 50;

  constructor(initialState: T, maxHistorySize: number = 50) {
    this.state = initialState;
    this.maxHistorySize = maxHistorySize;
    this.saveToHistory();
  }

  getState(): T {
    return this.state;
  }

  setState(newState: T): void {
    const previousState = this.state;
    this.state = newState;
    
    // Save to history
    this.saveToHistory();
    
    // Notify subscribers
    this.notifySubscribers();
  }

  subscribe(callback: (state: T) => void): () => void {
    this.subscribers.add(callback);
    
    // Immediately call with current state
    callback(this.state);
    
    return () => this.subscribers.delete(callback);
  }

  dispatch(action: Action): void {
    // This is a placeholder - actual action handling will be implemented
    // by the game engine that uses this store
    console.log('Action dispatched:', action);
  }

  reset(): void {
    if (this.history.length > 0) {
      this.state = this.history[0];
      this.history = [this.state];
      this.historyIndex = 0;
      this.notifySubscribers();
    }
  }

  getHistory(): T[] {
    return [...this.history];
  }

  undo(): boolean {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.state = this.history[this.historyIndex];
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  redo(): boolean {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.state = this.history[this.historyIndex];
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  private saveToHistory(): void {
    // Remove future history if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    // Add new state
    this.history.push(this.state);
    this.historyIndex = this.history.length - 1;
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('Error in state subscriber:', error);
      }
    });
  }
}
