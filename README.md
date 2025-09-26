# GameWork

A simple multiplayer game framework that makes it easy for developers to create multiplayer games. GameWork handles all the difficult networking tasks so developers can focus on game logic.

## 🎯 Philosophy

**GameWork handles networking. You handle game logic.**

- **Simple API**: Just extend `GameEngine` and pass it to `GameWork`
- **No Complex Setup**: No need to manage WebRTC, signaling, or player connections
- **Focus on Games**: Write your game rules, GameWork does the rest

## 🚀 Quick Start

### 1. Create Your Game Engine

```typescript
import { GameEngine, GameState, GameMove, GameRules } from 'gamework';

class MyGameEngine extends GameEngine {
  constructor() {
    const initialState: GameState = {
      version: 1,
      timestamp: Date.now(),
      // Your game state here
    };
    
    const rules: GameRules = {
      applyMove: (state, move) => {
        // Your move logic here
        return newState;
      },
      isValidMove: (state, move) => {
        // Your validation logic here
        return true;
      },
      isGameOver: (state) => {
        // Your game over logic here
        return false;
      }
    };
    
    super(initialState, rules);
  }
}
```

### 2. Create Your Multiplayer Game

```typescript
import { GameWork } from 'gamework';

class MyMultiplayerGame {
  private gamework: GameWork;
  private engine: MyGameEngine;

  constructor(roomId: string, playerName: string) {
    // Create your game engine
    this.engine = new MyGameEngine();
    
    // Create GameWork with your engine
    this.gamework = new GameWork(this.engine, {
      roomId,
      playerName
    });
  }

  async start() {
    await this.gamework.start();
  }

  makeMove(moveData: any) {
    const move = {
      type: 'move',
      playerId: this.gamework.getCurrentPlayer()?.id,
      timestamp: Date.now(),
      data: moveData
    };
    
    this.gamework.sendMove(move);
  }
}
```

### 3. That's It!

```typescript
const game = new MyMultiplayerGame('room-123', 'Player 1');
await game.start();
game.makeMove({ position: 5 });
```

## 📚 API Reference

### GameEngine (Base Class)

Extend this class to implement your game logic:

```typescript
class MyGameEngine extends GameEngine {
  // Required: Implement constructor with initialState and rules
  constructor() {
    super(initialState, rules);
  }
  
  // Optional: Override these methods for custom behavior
  getGameType?(): string;
  getMaxPlayers?(): number;
  getPlayerRole?(playerId: string): string;
  canPlayerMakeMove?(playerId: string, move: GameMove): boolean;
}
```

### GameWork (Main Class)

The main multiplayer framework:

```typescript
const gamework = new GameWork(gameEngine, config);

// Core methods
await gamework.start();
await gamework.stop();
gamework.sendMove(move);

// State access
gamework.getCurrentState();
gamework.getPlayers();
gamework.getCurrentPlayer();
gamework.isGameOver();
gamework.getWinner();

// Events
gamework.setEvents({
  onPlayerJoin: (player) => {},
  onPlayerLeave: (playerId) => {},
  onStateUpdate: (state) => {},
  onError: (error) => {}
});
```

## 🎮 Complete Example

Here's a complete Tic-Tac-Toe implementation:

```typescript
import { GameEngine, GameWork, GameState, GameMove, GameRules } from 'gamework';

// 1. Define your game state
interface TicTacToeState extends GameState {
  board: (string | null)[];
  currentPlayer: string;
}

// 2. Define your game rules
const rules: GameRules = {
  applyMove: (state, move) => {
    const newState = { ...state };
    const { position, playerId } = move.data;
    newState.board[position] = playerId;
    newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
    return newState;
  },
  isValidMove: (state, move) => {
    const { position } = move.data;
    return state.board[position] === null;
  },
  isGameOver: (state) => {
    // Check win conditions
    return checkWin(state.board) || state.board.every(cell => cell !== null);
  }
};

// 3. Create your game engine
class TicTacToeEngine extends GameEngine {
  constructor() {
    super({
      version: 1,
      timestamp: Date.now(),
      board: Array(9).fill(null),
      currentPlayer: 'X'
    }, rules);
  }
  
  getGameType() { return 'tic-tac-toe'; }
  getMaxPlayers() { return 2; }
}

// 4. Create your multiplayer game
class TicTacToeGame {
  private gamework: GameWork;
  
  constructor(roomId: string, playerName: string) {
    this.gamework = new GameWork(new TicTacToeEngine(), {
      roomId,
      playerName
    });
  }
  
  async start() {
    await this.gamework.start();
  }
  
  makeMove(position: number) {
    const move = {
      type: 'move',
      playerId: this.gamework.getCurrentPlayer()?.id,
      timestamp: Date.now(),
      data: { position }
    };
    this.gamework.sendMove(move);
  }
}

// 5. Use it!
const game = new TicTacToeGame('room-123', 'Player 1');
await game.start();
game.makeMove(0); // Make a move
```

## 🔧 Configuration

```typescript
const gamework = new GameWork(engine, {
  roomId: 'my-room',
  playerName: 'Player Name',
  stunServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  signalingService: customSignalingService, // Optional
  signalingConfig: { serverUrl: 'ws://localhost:8080' } // Optional
});
```

## 🎯 Key Features

- **Simple API**: Just extend GameEngine and use GameWork
- **Automatic Networking**: WebRTC, signaling, and player management handled automatically
- **Role-Based Actions**: Define what actions each player role can perform
- **State Synchronization**: Game state automatically synchronized across all players
- **Event System**: React to player joins, state updates, and game events
- **Flexible**: Works with any game type (board games, card games, real-time games)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

MIT License - see LICENSE file for details.

---

**GameWork** - Making multiplayer games simple! 🎮