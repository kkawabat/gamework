/**
 * GameEngine - Pure game logic for GameWork v2
 * 
 * Provides clean game logic with:
 * - Pure functions only
 * - No side effects
 * - Easy testing
 * - Type safety
 */

import { BaseGameState, GameAction, GameEngine as IGameEngine } from '../types/GameTypes';

export abstract class GameEngine<TState extends BaseGameState, TAction extends GameAction> 
  implements IGameEngine<TState, TAction> {
  
  abstract processAction(state: TState, action: TAction): TState;
  abstract update(state: TState, deltaTime: number): TState;
  abstract validateAction(action: TAction): boolean;
  abstract getInitialState(): TState;

  // Utility methods for common game logic
  protected createBaseState(id: string): BaseGameState {
    return {
      id,
      timestamp: Date.now(),
      version: 1
    };
  }

  protected updateTimestamp(state: TState): TState {
    return {
      ...state,
      timestamp: Date.now()
    };
  }

  protected incrementVersion(state: TState): TState {
    return {
      ...state,
      version: state.version + 1
    };
  }

  protected isActionValid(action: TAction, state: TState): boolean {
    // Basic validation - can be overridden by subclasses
    return action && 
           typeof action.type === 'string' && 
           typeof action.playerId === 'string' && 
           typeof action.timestamp === 'number';
  }

  protected createError(message: string, action: TAction): Error {
    return new Error(`Game logic error: ${message}. Action: ${JSON.stringify(action)}`);
  }
}
