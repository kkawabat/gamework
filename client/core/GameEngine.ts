import { StateChange } from "../events/EventFlow";

/**
 * GameEngine - Base class for game logic
 * 
 * Developers extend this class to implement their game logic.
 * GameWork handles all networking, this class focuses purely on game rules.
 */
export abstract class GameEngine<S, A = unknown> {
  private _state: S;
  protected gameWork: any; // Will be typed as GameWork to avoid circular imports

  constructor(initialState: S) {
    this._state = initialState;
  }

  /**
   * Set the GameWork instance for the game engine
   */
  setGameWork(gameWork: any): void {
    this.gameWork = gameWork;
  }

  get state(): Readonly<S> {
    return this._state; // never undefined
  }
  
  protected setState(next: S) {
    this._state = next;
  }

  abstract applyAction(action: A): S;
  abstract applyStateChange(stateChange: StateChange): S;
  
  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Process player action - called directly by GameWork
   */
  processAction(gameState: any, action: A): any {
    // Override in subclasses to implement game logic
    return this.applyAction(action);
  }
  
  /**
   * Update game state - called directly by GameWork
   */
  update(gameState: any, deltaTime: number): any {
    // Override in subclasses to implement game loop logic
    return gameState;
  }
  
  async onSendPlayerAction(action: A): Promise<void>{};
  async onReceivePlayerAction(action: A): Promise<void>{
    this._state = this.applyAction(action);
  };
  async onSendStateChange(stateChange: StateChange): Promise<void>{};
  async onReceiveStateChange(stateChange: StateChange): Promise<void>{
    this._state = this.applyStateChange(stateChange);
  };

  
}