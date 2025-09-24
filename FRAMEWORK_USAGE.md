# GameWork Framework Usage Guide

GameWork is a general-purpose multiplayer framework for online board games with minimal operational cost. It uses WebRTC for peer-to-peer communication and a lightweight signaling server for initial connections.

## Quick Start

### 1. Installation

```bash
# Install GameWork as a dependency
npm install gamework

# Or if using from local development
npm install /path/to/gamework
```

### 2. Basic Setup

```typescript
import { GameHost, GameClient, WebSocketSignalingService } from 'gamework';

// Configure signaling server
const signalingConfig = {
  serverUrl: 'wss://your-signaling-server.com',
  reconnectAttempts: 5,
  reconnectDelay: 1000
};

// Create signaling service
const signalingService = new WebSocketSignalingService(signalingConfig);
```

## Core Components

### GameEngine
The heart of GameWork - handles game state, rules, and move validation.

```typescript
import { GameEngine, GameConfig, GameRules } from 'gamework';

// Define your game rules
const gameRules: GameRules = {
  applyMove: (state, move) => { /* your move logic */ },
  isValidMove: (state, move) => { /* your validation logic */ },
  isGameOver: (state) => { /* your game over logic */ },
  getWinner: (state) => { /* your winner logic */ }
};

// Create game configuration
const gameConfig: GameConfig = {
  gameType: 'your-game',
  maxPlayers: 2,
  initialState: yourInitialState,
  rules: gameRules
};
```

### GameHost
Manages the game server-side, handles player connections, and validates moves.

```typescript
import { GameHost } from 'gamework';

// Create game host
const gameHost = new GameHost({
  roomId: 'ROOM123',
  roomName: 'My Game Room',
  gameConfig: gameConfig
}, signalingService);

// Set up event handlers
gameHost.setStateUpdateHandler((state) => {
  console.log('Game state updated:', state);
});

gameHost.setPlayerJoinHandler((player) => {
  console.log('Player joined:', player);
});

// Start the host
await gameHost.start();
```

### GameClient
Connects to a game host and sends moves.

```typescript
import { GameClient } from 'gamework';

// Create game client
const gameClient = new GameClient({
  roomId: 'ROOM123',
  playerName: 'Player Name'
}, signalingService);

// Set up event handlers
gameClient.setStateUpdateHandler((state) => {
  console.log('Received state update:', state);
});

// Connect to the game
await gameClient.connect();
```

## Game Types

### 1. Turn-Based Games (like Tic-Tac-Toe)

```typescript
// Define your game state
interface MyGameState extends GameState {
  board: (string | null)[];
  currentPlayer: string;
  winner: string | null;
  gameOver: boolean;
}

// Define your move data
interface MyGameMove {
  position: number;
  playerId: string;
}

// Create game rules
const myGameRules: GameRules = {
  applyMove: (state: GameState, move: GameMove): GameState => {
    const gameState = state as MyGameState;
    const moveData = move.data as MyGameMove;
    
    // Apply the move
    const newState = { ...gameState };
    newState.board[moveData.position] = moveData.playerId;
    
    // Check for winner
    newState.winner = checkWinner(newState.board);
    newState.gameOver = newState.winner !== null;
    
    return newState;
  },
  
  isValidMove: (state: GameState, move: GameMove): boolean => {
    const gameState = state as MyGameState;
    const moveData = move.data as MyGameMove;
    
    // Validate the move
    return gameState.board[moveData.position] === null;
  },
  
  isGameOver: (state: GameState): boolean => {
    return (state as MyGameState).gameOver;
  },
  
  getWinner: (state: GameState): string | null => {
    return (state as MyGameState).winner;
  }
};
```

### 2. Real-Time Games (like Chess)

```typescript
// For real-time games, you might want to send moves immediately
// without waiting for turn validation

const gameClient = new GameClient({
  roomId: 'CHESS123',
  playerName: 'Chess Player'
}, signalingService);

// Send a move
const move = {
  type: 'move',
  playerId: 'player1',
  timestamp: Date.now(),
  data: { from: 'e2', to: 'e4' }
};

gameClient.sendMove('move', { from: 'e2', to: 'e4' });
```

## Signaling Server Setup

### Option 1: Use the Provided Signaling Server

```bash
# Clone the signaling server
git clone <signaling-server-repo>
cd signaling-server

# Install dependencies
npm install

# Start the server
npm start
```

### Option 2: Deploy to Your Own Server

```bash
# Deploy to your server
docker-compose up -d
```

### Option 3: Use a Third-Party Signaling Service

```typescript
// You can implement your own signaling service
class CustomSignalingService implements SignalingService {
  // Implement the required methods
}
```

## Advanced Usage

### Custom Game Rules

```typescript
// Complex game with multiple phases
const complexGameRules: GameRules = {
  applyMove: (state, move) => {
    const gameState = state as ComplexGameState;
    
    switch (gameState.phase) {
      case 'setup':
        return handleSetupPhase(gameState, move);
      case 'play':
        return handlePlayPhase(gameState, move);
      case 'end':
        return handleEndPhase(gameState, move);
      default:
        return gameState;
    }
  },
  
  isValidMove: (state, move) => {
    const gameState = state as ComplexGameState;
    return gameState.phase === 'play' && !gameState.gameOver;
  },
  
  isGameOver: (state) => {
    return (state as ComplexGameState).gameOver;
  },
  
  getWinner: (state) => {
    return (state as ComplexGameState).winner;
  }
};
```

### Custom UI Integration

```typescript
// Integrate with your existing UI framework
class MyGameController {
  private gameHost: GameHost | null = null;
  private gameClient: GameClient | null = null;
  
  async initializeAsHost(roomId: string) {
    this.gameHost = new GameHost({
      roomId,
      roomName: 'My Game',
      gameConfig: myGameConfig
    }, signalingService);
    
    this.gameHost.setStateUpdateHandler((state) => {
      this.updateUI(state);
    });
    
    await this.gameHost.start();
  }
  
  async initializeAsClient(roomId: string) {
    this.gameClient = new GameClient({
      roomId,
      playerName: 'Player'
    }, signalingService);
    
    this.gameClient.setStateUpdateHandler((state) => {
      this.updateUI(state);
    });
    
    await this.gameClient.connect();
  }
  
  private updateUI(state: GameState) {
    // Update your UI based on game state
    const gameState = state as MyGameState;
    this.renderBoard(gameState.board);
    this.updatePlayerTurn(gameState.currentPlayer);
  }
}
```

## Best Practices

### 1. Error Handling

```typescript
try {
  await gameHost.start();
} catch (error) {
  console.error('Failed to start game:', error);
  // Handle error appropriately
}
```

### 2. Connection Management

```typescript
// Handle connection drops
gameHost.setConnectionChangeHandler((peerId, isConnected) => {
  if (!isConnected) {
    console.log('Player disconnected:', peerId);
    // Handle disconnection
  }
});
```

### 3. State Synchronization

```typescript
// Always validate moves on the host
gameHost.setPlayerInputHandler((playerId, move) => {
  if (isValidMove(currentState, move)) {
    gameHost.applyMove(move);
  } else {
    gameHost.sendErrorToPlayer(playerId, 'Invalid move');
  }
});
```

## Deployment

### 1. Build Your Game

```bash
# Build your game
npm run build

# The built files will be in the dist/ directory
```

### 2. Deploy Signaling Server

```bash
# Deploy to your server
docker-compose up -d
```

### 3. Host Your Game

```bash
# Serve your game files
# You can use any static file server
npx serve dist
```

## Examples

### Built-in Examples
See the `examples/` directory for complete examples:
- `tic-tac-toe/` - Complete multiplayer Tic-Tac-Toe game
- `connect-four/` - Connect Four game implementation
- `simple-card-game/` - Card game example

### Additional Examples
See the `examples/` directory for more game types:
- `connect-four/` - Connect Four game implementation
- `simple-card-game/` - Card game example

### Quick Start Examples

#### 1. Tic-Tac-Toe (Already Implemented)
```typescript
// Use the existing Tic-Tac-Toe implementation
import { ticTacToeConfig } from 'gamework/examples/tic-tac-toe/src/simple-tic-tac-toe';

const gameHost = new GameHost({
  roomId: 'TIC_TAC_TOE_123',
  roomName: 'Tic-Tac-Toe Game',
  gameConfig: ticTacToeConfig
}, signalingService);
```

#### 2. Connect Four
```typescript
// See examples/connect-four/ for full implementation
import { connectFourConfig } from './connect-four-game';

const gameHost = new GameHost({
  roomId: 'CONNECT4_123',
  roomName: 'Connect Four Game',
  gameConfig: connectFourConfig
}, signalingService);
```

#### 3. Card Games
```typescript
// See examples/simple-card-game/ for full implementation
import { cardGameConfig } from './card-game';

const gameHost = new GameHost({
  roomId: 'CARD_GAME_123',
  roomName: 'Card Game',
  gameConfig: cardGameConfig
}, signalingService);
```

## Support

For questions or issues, please refer to the documentation or create an issue in the repository.
