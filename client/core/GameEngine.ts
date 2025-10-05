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

  async onSendPlayerAction(action: A): Promise<void>{};
  async onReceivePlayerAction(action: A): Promise<void>{
    this._state = this.applyAction(action);
  };
  async onSendStateChange(state: S): Promise<void>{};
  async onReceiveStateChange(state: S): Promise<void>{
    this._state = state;
  };

  
}