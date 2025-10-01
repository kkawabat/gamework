/**
 * UIEngine - Abstract base class for UI rendering
 * 
 * Handles all UI updates and rendering logic for games.
 * Developers extend this class to implement their specific UI rendering.
 */
export abstract class UIEngine {
  protected gameWork: any; // Will be typed as GameWork to avoid circular imports

  /**
   * Set the GameWork instance for the UI engine
   */
  setGameWork(gameWork: any): void {
    this.gameWork = gameWork;
  }

  // Event handler methods that match the event system
  onPlayerJoined?(payload: { playerId: string, playerName?: string }): void;
  onPlayerLeft?(payload: { playerId: string }): void;
  onStateChange?(payload: any): void;
  onPlayerMove?(payload: any): void;
  onPlayerMoveApplied?(payload: any): void;
  onTurnChange?(payload: { currentPlayerId: string }): void;
  onGameOver?(payload: { winnerId?: string, scores: Record<string, number> }): void;
  onScoreUpdate?(payload: { scores: Record<string, number> }): void;
  onRoomCreated?(payload: { roomId: string, hostId: string }): void;
  onRoomClosed?(payload: { roomId: string }): void;
  onConnectionLost?(payload: { playerId?: string, reason?: string }): void;
  onConnectionRestored?(payload: { playerId?: string }): void;
  onChatMessage?(payload: { playerId: string, message: string }): void;
  onRenderComplete?(payload: { frameTime: number }): void;
  onAnimationEnd?(payload: { animationId: string }): void;
  onUiInteraction?(payload: { elementId: string, action: string }): void;
  onError?(payload: { code: string, message: string }): void;

}
