import { StateChange } from "../events/EventFlow";

import { PlayerAction } from "../events/EventFlow";

/**
 * UIEngine - Abstract base class for UI rendering
 * 
 * Handles all UI updates and rendering logic for games.
 * Developers extend this class to implement their specific UI rendering.
 */
export abstract class UIEngine<S, A = unknown> {
  protected gameWork: any; // Will be typed as GameWork to avoid circular imports

  /**
   * Set the GameWork instance for the UI engine
   */
  setGameWork(gameWork: any): void {
    this.gameWork = gameWork;
  }

  abstract render(): void;
  abstract initialize?(): void;

  async onSendPlayerAction(action: A): Promise<void>{
    this.gameWork.sendPlayerAction(action);
  };
  async onReceivePlayerAction(action: A): Promise<void>{};
  async onSendStateChange(state: S): Promise<void>{};
  async onReceiveStateChange(state: S): Promise<void>{
    this.render();
  };

}
