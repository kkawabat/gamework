# GameWork Framework

A general-purpose framework for online board games that runs with minimal operational cost. Designed for friends playing together with 100% trust assumption.

## 🎯 Overview

GameWork is a serverless framework that enables real-time multiplayer board games using WebRTC DataChannels. The architecture is host-authoritative, where one device (typically an iPad) acts as the host and maintains the authoritative game state, while other devices act as controllers.

## 🎮 Live Demo

**Try the GameWork framework in action!**

🚀 **[Play Tic-Tac-Toe Game](https://kkawabata.github.io/gamework/)** - Complete Tic-Tac-Toe implementation with beautiful UI

🎯 **[Framework Demo](https://kkawabata.github.io/gamework/)** - Interactive demo showing GameWork framework capabilities

*Note: The demos are automatically deployed to GitHub Pages when changes are pushed to the main branch.*

## 🏗️ Architecture

### Core Principles
- **Host-Authoritative**: One device maintains the authoritative game state
- **Serverless**: Minimal operational cost using static hosting + signaling
- **WebRTC**: Direct peer-to-peer communication for low latency
- **Trust-Based**: No anti-cheat mechanisms (assumes friends playing together)

### Communication Flow
```
Player Input → Host → Game Engine → State Update → Broadcast to All Players
```

### Components
1. **Game Engine**: Manages game state and applies moves using reducer pattern
2. **WebRTC Manager**: Handles peer connections and data channels
3. **Signaling Service**: Facilitates peer discovery and connection setup
4. **Game Host**: Orchestrates the game session and manages players
5. **Game Client**: Allows players to connect and participate

## 🚀 Getting Started

### Installation

```bash
npm install gamework
```

### Basic Usage

#### 1. Define Your Game

```typescript
import { GameConfig, GameRules, GameState, GameMove } from 'gamework';

interface MyGameState extends GameState {
  board: (string | null)[];
  currentPlayer: string;
  winner: string | null;
}

const myGameRules: GameRules = {
  applyMove: (state: MyGameState, move: GameMove): MyGameState => {
    // Implement your game logic here
    const newState = { ...state };
    // Apply the move and return new state
    return newState;
  },
  
  isValidMove: (state: MyGameState, move: GameMove): boolean => {
    // Validate if the move is legal
    return true; // Implement validation logic
  },
  
  isGameOver: (state: MyGameState): boolean => {
    // Check if the game is over
    return false; // Implement game over logic
  }
};

const gameConfig: GameConfig = {
  gameType: 'my-game',
  maxPlayers: 4,
  initialState: {
    version: 0,
    timestamp: Date.now(),
    board: Array(9).fill(null),
    currentPlayer: 'X',
    winner: null
  },
  rules: myGameRules
};
```

#### 2. Create a Host

```typescript
import { GameHost } from 'gamework';

const host = new GameHost({
  roomId: 'ABC123',
  roomName: 'My Game Room',
  gameConfig: gameConfig,
  enableWakeLock: true,
  enablePWA: true
});

// Set up event handlers
host.setStateUpdateHandler((state) => {
  console.log('Game state updated:', state);
});

host.setPlayerJoinHandler((player) => {
  console.log('Player joined:', player.name);
});

// Start the host
await host.start();
```

#### 3. Create a Client

```typescript
import { GameClient } from 'gamework';

const client = new GameClient({
  roomId: 'ABC123',
  playerName: 'Player 1'
});

// Set up event handlers
client.setStateUpdateHandler((state) => {
  console.log('Received state update:', state);
});

client.setConnectHandler(() => {
  console.log('Connected to host!');
});

// Connect to the game
await client.connect();

// Send a move
client.sendMove('place_piece', { position: 5 });
```

## 📱 PWA Features

The framework includes Progressive Web App support for the host device:

- **Fullscreen Mode**: Installable as a fullscreen app
- **Wake Lock**: Prevents display from sleeping during games
- **Offline Support**: Works without internet once connected
- **QR Code Invites**: Easy room joining for players

## 🌐 Signaling Services

### Built-in Services

1. **InMemorySignalingService**: For development and testing
2. **FirebaseSignalingService**: For production use (placeholder)

### Custom Signaling

Implement the `SignalingService` interface to use your own signaling solution:

```typescript
import { SignalingService, SignalingMessage, GameRoom } from 'gamework';

class MySignalingService implements SignalingService {
  async connect(): Promise<void> {
    // Connect to your signaling server
  }
  
  async sendMessage(message: SignalingMessage): Promise<void> {
    // Send message through your service
  }
  
  // ... implement other methods
}
```

## 🎮 Game Development

### State Management

Games use a reducer pattern where each move transforms the current state:

```typescript
const gameRules: GameRules = {
  applyMove: (state, move) => {
    // Create new state based on move
    const newState = { ...state };
    
    // Apply the move
    switch (move.type) {
      case 'place_piece':
        newState.board[move.data.position] = move.playerId;
        break;
      // ... other move types
    }
    
    // Update game state
    newState.currentPlayer = getNextPlayer(state);
    newState.winner = checkWinner(newState.board);
    
    return newState;
  }
};
```

### Move Validation

Implement validation logic to ensure moves are legal:

```typescript
isValidMove: (state, move) => {
  // Check if it's the player's turn
  if (move.playerId !== state.currentPlayer) return false;
  
  // Check if the move is legal
  if (move.type === 'place_piece') {
    return state.board[move.data.position] === null;
  }
  
  return false;
}
```

## 🔧 Configuration

### Host Configuration

```typescript
interface HostConfig {
  roomId: string;
  roomName: string;
  gameConfig: GameConfig;
  stunServers?: RTCIceServer[];
  enableWakeLock?: boolean;
  enablePWA?: boolean;
}
```

### Client Configuration

```typescript
interface ClientConfig {
  roomId: string;
  playerName: string;
  stunServers?: RTCIceServer[];
}
```

## 📊 State Synchronization

The framework handles state synchronization automatically:

- **Full Snapshots**: Sent when players join or request resync
- **Incremental Updates**: Sent after each move
- **Version Control**: Each state has a version number for conflict resolution
- **Resync Requests**: Clients can request fresh state if they fall behind

## 🚀 Deployment

### Static Hosting

1. Build your game using the framework
2. Deploy to any static hosting service (Netlify, Vercel, GitHub Pages)
3. Use a signaling service (Firebase, Cloudflare Workers, etc.)

### Signaling Server Options

- **Firebase**: Easy to set up, good for small to medium scale
- **Cloudflare Workers**: Very low cost, good performance
- **Custom Server**: Full control over signaling logic

## 📝 Examples & Documentation

See the `examples/` directory for:

- **Tic-Tac-Toe**: Complete game implementation
- **Demo HTML**: UI demonstration
- **Integration Examples**: How to use the framework

See the `docs/` directory for:

- **Framework Components**: Detailed component documentation
- **Original Requirements**: Project specifications and requirements

## 🧪 Testing

```bash
# Install dependencies
npm install

# Build the framework
npm run build

# Run tests
npm test

# Start development mode
npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: Report bugs and feature requests on GitHub
- **Discussions**: Ask questions and share ideas
- **Documentation**: Check the examples and type definitions

## 🔮 Roadmap

- [ ] Host migration support
- [ ] Cloud persistence for replays
- [ ] Advanced game templates
- [ ] Mobile-optimized UI components
- [ ] Analytics and logging
- [ ] Tournament support

---

Built with ❤️ for board game enthusiasts who want to play online with minimal setup and cost.

