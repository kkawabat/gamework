import { GameEngine } from './core/GameEngine';
import { GameState, GameMove, GameRules } from './types';

// Simple test game state
interface TestGameState extends GameState {
  counter: number;
  lastMove?: string;
}

// Simple test game rules
const testGameRules: GameRules = {
  applyMove: (state: GameState, move: GameMove): GameState => {
    const testState = state as TestGameState;
    return {
      ...testState,
      counter: testState.counter + 1,
      lastMove: move.type,
      version: testState.version + 1,
      timestamp: Date.now()
    };
  },
  
  isValidMove: (state: GameState, move: GameMove): boolean => {
    const testState = state as TestGameState;
    return move.type === 'increment' && testState.counter < 10;
  },
  
  isGameOver: (state: GameState): boolean => {
    const testState = state as TestGameState;
    return testState.counter >= 10;
  }
};

describe('GameEngine', () => {
  let engine: GameEngine;
  let initialState: TestGameState;

  beforeEach(() => {
    initialState = {
      version: 0,
      timestamp: Date.now(),
      counter: 0
    };
    engine = new GameEngine(initialState, testGameRules);
  });

  test('should initialize with initial state', () => {
    const state = engine.getCurrentState();
    expect(state.counter).toBe(0);
    expect(state.version).toBe(0);
  });

  test('should apply valid moves', () => {
    const move: GameMove = {
      type: 'increment',
      playerId: 'player1',
      timestamp: Date.now(),
      data: {}
    };

    const newState = engine.applyMove(move);
    expect(newState).toBeTruthy();
    expect(newState!.counter).toBe(1);
    expect(newState!.lastMove).toBe('increment');
  });

  test('should reject invalid moves', () => {
    // Apply 10 moves to reach the limit
    for (let i = 0; i < 10; i++) {
      engine.applyMove({
        type: 'increment',
        playerId: 'player1',
        timestamp: Date.now(),
        data: {}
      });
    }

    // Now try to make another move (should be invalid)
    const invalidMove: GameMove = {
      type: 'increment',
      playerId: 'player1',
      timestamp: Date.now(),
      data: {}
    };

    const result = engine.applyMove(invalidMove);
    expect(result).toBeNull();
  });

  test('should track game version', () => {
    expect(engine.getCurrentVersion()).toBe(0);
    
    engine.applyMove({
      type: 'increment',
      playerId: 'player1',
      timestamp: Date.now(),
      data: {}
    });
    
    expect(engine.getCurrentVersion()).toBe(1);
  });

  test('should detect game over', () => {
    expect(engine.isGameOver()).toBe(false);
    
    // Apply 10 moves to reach game over
    for (let i = 0; i < 10; i++) {
      engine.applyMove({
        type: 'increment',
        playerId: 'player1',
        timestamp: Date.now(),
        data: {}
      });
    }
    
    expect(engine.isGameOver()).toBe(true);
  });

  test('should export and import state', () => {
    // Apply some moves
    engine.applyMove({
      type: 'increment',
      playerId: 'player1',
      timestamp: Date.now(),
      data: {}
    });

    const exported = engine.exportState();
    expect(exported).toContain('"counter":1');
    
    // Create new engine and import state
    const newEngine = new GameEngine(initialState, testGameRules);
    const success = newEngine.importState(exported);
    
    expect(success).toBe(true);
    expect(newEngine.getCurrentState().counter).toBe(1);
  });
});

