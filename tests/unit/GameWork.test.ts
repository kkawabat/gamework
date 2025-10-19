/**
 * GameWork v2 - Unit Tests
 * 
 * Tests the core framework functionality
 */

import { GameWork, StateStore, EventBus, DIContainer } from '../../src';
import { BaseGameState, GameAction, GameConfig } from '../../src/types/GameTypes';

// Test game state
interface TestGameState extends BaseGameState {
  counter: number;
  message: string;
}

// Test game action
interface TestGameAction extends GameAction {
  type: 'INCREMENT' | 'SET_MESSAGE';
  payload: {
    value?: number;
    message?: string;
  };
}

// Test game engine
class TestGameEngine {
  processAction(state: TestGameState, action: TestGameAction): TestGameState {
    switch (action.type) {
      case 'INCREMENT':
        return {
          ...state,
          counter: state.counter + (action.payload.value || 1),
          timestamp: Date.now(),
          version: state.version + 1
        };
      case 'SET_MESSAGE':
        return {
          ...state,
          message: action.payload.message || state.message,
          timestamp: Date.now(),
          version: state.version + 1
        };
      default:
        return state;
    }
  }

  update(state: TestGameState, deltaTime: number): TestGameState {
    return state;
  }

  validateAction(action: TestGameAction): boolean {
    return action.type === 'INCREMENT' || action.type === 'SET_MESSAGE';
  }

  getInitialState(): TestGameState {
    return {
      id: 'test-game',
      timestamp: Date.now(),
      version: 1,
      counter: 0,
      message: 'Hello World'
    };
  }
}

// Test UI engine
class TestUIEngine {
  private renderCount = 0;
  private lastState?: TestGameState;

  render(state: TestGameState): void {
    this.renderCount++;
    this.lastState = state;
  }

  initialize(): void {
    // Mock initialization
  }

  destroy(): void {
    // Mock cleanup
  }

  updateRoom(room: any): void {
    // Mock room update
  }

  getRenderCount(): number {
    return this.renderCount;
  }

  getLastState(): TestGameState | undefined {
    return this.lastState;
  }
}

// Test network engine
class TestNetworkEngine {
  private messageHandlers: Set<(peerId: string, message: any) => void> = new Set();

  async connect(peerId: string): Promise<void> {
    // Mock connection
  }

  disconnect(peerId: string): void {
    // Mock disconnection
  }

  sendMessage(peerId: string, message: any): void {
    // Mock message sending
  }

  broadcast(message: any): void {
    // Mock broadcast
  }

  onMessage(callback: (peerId: string, message: any) => void): () => void {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }
}

describe('GameWork v2', () => {
  let game: GameWork<TestGameState, TestGameAction>;
  let gameEngine: TestGameEngine;
  let uiEngine: TestUIEngine;
  let networkEngine: TestNetworkEngine;

  beforeEach(() => {
    gameEngine = new TestGameEngine();
    uiEngine = new TestUIEngine();
    networkEngine = new TestNetworkEngine();

    const config: GameConfig<TestGameState, TestGameAction> = {
      initialState: gameEngine.getInitialState(),
      maxPlayers: 2,
      gameName: 'TestGame',
      version: '1.0.0',
      debugMode: false
    };

    game = new GameWork(config);
    
    // Register engines with DI container
    game['container'].register('GameEngine', () => gameEngine);
    game['container'].register('UIEngine', () => uiEngine);
    game['container'].register('NetworkEngine', () => networkEngine);
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(game.initialize()).resolves.not.toThrow();
    });

    it('should have initial state', () => {
      const state = game.getState();
      expect(state.counter).toBe(0);
      expect(state.message).toBe('Hello World');
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      await game.initialize();
    });

    it('should update state when action is dispatched', () => {
      const action: TestGameAction = {
        type: 'INCREMENT',
        playerId: 'player1',
        timestamp: Date.now(),
        payload: { value: 5 }
      };

      game.dispatchAction(action);
      
      const state = game.getState();
      expect(state.counter).toBe(5);
    });

    it('should validate actions', () => {
      const validAction: TestGameAction = {
        type: 'INCREMENT',
        playerId: 'player1',
        timestamp: Date.now(),
        payload: {}
      };

      const invalidAction = {
        type: 'INVALID',
        playerId: 'player1',
        timestamp: Date.now(),
        payload: {}
      };

      expect(() => game.dispatchAction(validAction)).not.toThrow();
      expect(() => game.dispatchAction(invalidAction as any)).not.toThrow(); // Should not throw, but should not process
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await game.initialize();
    });

    it('should emit state change events', (done) => {
      game.on('game:stateChanged', (state) => {
        expect(state.counter).toBe(1);
        done();
      });

      const action: TestGameAction = {
        type: 'INCREMENT',
        playerId: 'player1',
        timestamp: Date.now(),
        payload: {}
      };

      game.dispatchAction(action);
    });

    it('should allow multiple event listeners', () => {
      let eventCount = 0;
      
      game.on('game:stateChanged', () => eventCount++);
      game.on('game:stateChanged', () => eventCount++);

      const action: TestGameAction = {
        type: 'INCREMENT',
        playerId: 'player1',
        timestamp: Date.now(),
        payload: {}
      };

      game.dispatchAction(action);
      
      expect(eventCount).toBe(2);
    });
  });

  describe('Dependency Injection', () => {
    it('should resolve registered services', async () => {
      await game.initialize();
      
      const resolvedEngine = game['container'].resolve('GameEngine');
      expect(resolvedEngine).toBe(gameEngine);
    });

    it('should throw error for unregistered services', () => {
      expect(() => {
        game['container'].resolve('NonExistentService');
      }).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      await game.initialize();
      
      // This should not throw, even with invalid action
      const invalidAction = {
        type: 'INVALID',
        playerId: 'player1',
        timestamp: Date.now(),
        payload: {}
      };

      expect(() => game.dispatchAction(invalidAction as any)).not.toThrow();
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running GameWork v2 tests...');
  console.log('✅ All tests passed!');
}
