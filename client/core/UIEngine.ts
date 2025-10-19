import { StateChange } from "../events/EventFlow";
import { GameRoom } from "../../shared/signaling-types";

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
  abstract initialize(): void;

  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Update game state - called directly by GameWork
   */
  updateState(gameState: any): void {
    // Override in subclasses to handle state updates
    this.render();
  }

  /**
   * Update room information - called directly by GameWork
   */
  updateRoom(room: GameRoom, isHost: boolean): void {
    // Override in subclasses to handle room updates
    this.render();
  }

  // === EXTERNAL COMMUNICATION (Events) ===
  
  async onSendPlayerAction(action: A): Promise<void>{
    this.gameWork.sendPlayerAction(action);
  };
  async onReceivePlayerAction(action: A): Promise<void>{};
  async onSendStateChange(stateChange: StateChange): Promise<void>{};
  async onReceiveStateChange(stateChange: StateChange): Promise<void>{};

}
