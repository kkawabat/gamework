# GameWork v2 - Clean Architecture PRD

## Executive Summary

**Complete rewrite** of GameWork framework with modern, clean architecture. No backward compatibility concerns - we're building from scratch with best practices.

## Core Design Principles

### 1. **Clean Architecture**
- Clear separation of concerns
- Dependency inversion
- Single responsibility principle
- No circular dependencies

### 2. **Event-Driven Architecture**
- Pure event-based communication
- No direct method calls between components
- Async-first design

### 3. **Type Safety First**
- Zero `any` types
- Strong generics
- Runtime validation
- Compile-time guarantees

### 4. **Testability**
- Dependency injection
- Easy mocking
- Isolated components
- 100% test coverage

## New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GameWork v2 Core                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   State     │  │   Events    │  │    DI      │         │
│  │  Store      │  │    Bus      │  │ Container  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Game      │  │     UI      │  │  Network    │         │
│  │  Engine     │  │   Engine    │  │  Engine    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Error     │  │   Logger   │  │   Config    │         │
│  │  Handler    │  │            │  │  Manager    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. State Store (Centralized State Management)

```typescript
interface StateStore<T> {
  getState(): T;
  setState(newState: T): void;
  subscribe(callback: (state: T) => void): () => void;
  dispatch(action: Action): void;
  reset(): void;
}

class GameStateStore<T> implements StateStore<T> {
  private state: T;
  private subscribers: Set<(state: T) => void> = new Set();
  
  constructor(initialState: T) {
    this.state = initialState;
  }
  
  getState(): T {
    return this.state;
  }
  
  setState(newState: T): void {
    this.state = newState;
    this.notifySubscribers();
  }
  
  subscribe(callback: (state: T) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.state));
  }
}
```

### 2. Event Bus (Pure Event Communication)

```typescript
interface EventBus {
  emit<T>(event: string, payload: T): void;
  on<T>(event: string, handler: (payload: T) => void): () => void;
  off(event: string, handler: Function): void;
  once<T>(event: string, handler: (payload: T) => void): void;
}

class GameEventBus implements EventBus {
  private handlers: Map<string, Set<Function>> = new Map();
  
  emit<T>(event: string, payload: T): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }
  
  on<T>(event: string, handler: (payload: T) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }
  
  off(event: string, handler: Function): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
    }
  }
}
```

### 3. Dependency Injection Container

```typescript
interface DIContainer {
  register<T>(token: string, factory: () => T): void;
  registerSingleton<T>(token: string, factory: () => T): void;
  resolve<T>(token: string): T;
  createScope(): DIContainer;
}

class GameDIContainer implements DIContainer {
  private services: Map<string, () => any> = new Map();
  private singletons: Map<string, any> = new Map();
  
  register<T>(token: string, factory: () => T): void {
    this.services.set(token, factory);
  }
  
  registerSingleton<T>(token: string, factory: () => T): void {
    this.services.set(token, factory);
    this.singletons.set(token, null);
  }
  
  resolve<T>(token: string): T {
    if (this.singletons.has(token)) {
      if (this.singletons.get(token) === null) {
        const factory = this.services.get(token);
        if (factory) {
          this.singletons.set(token, factory());
        }
      }
      return this.singletons.get(token);
    }
    
    const factory = this.services.get(token);
    if (!factory) {
      throw new Error(`Service ${token} not found`);
    }
    return factory();
  }
}
```

### 4. Game Engine (Pure Logic)

```typescript
interface GameEngine<TState, TAction> {
  processAction(state: TState, action: TAction): TState;
  update(state: TState, deltaTime: number): TState;
  validateAction(action: TAction): boolean;
}

abstract class BaseGameEngine<TState, TAction> implements GameEngine<TState, TAction> {
  abstract processAction(state: TState, action: TAction): TState;
  abstract update(state: TState, deltaTime: number): TState;
  abstract validateAction(action: TAction): boolean;
}
```

### 5. UI Engine (Pure Rendering)

```typescript
interface UIEngine<TState> {
  render(state: TState): void;
  initialize(): void;
  destroy(): void;
}

abstract class BaseUIEngine<TState> implements UIEngine<TState> {
  abstract render(state: TState): void;
  abstract initialize(): void;
  abstract destroy(): void;
}
```

### 6. Network Engine (Pure Communication)

```typescript
interface NetworkEngine {
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): void;
  sendMessage(peerId: string, message: any): void;
  broadcast(message: any): void;
  onMessage(callback: (peerId: string, message: any) => void): () => void;
}

class WebRTCNetworkEngine implements NetworkEngine {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private messageHandlers: Set<(peerId: string, message: any) => void> = new Set();
  
  async connect(peerId: string): Promise<void> {
    // WebRTC connection logic
  }
  
  disconnect(peerId: string): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.close();
      this.connections.delete(peerId);
    }
  }
  
  sendMessage(peerId: string, message: any): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      // Send via data channel
    }
  }
  
  onMessage(callback: (peerId: string, message: any) => void): () => void {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }
}
```

## Main GameWork Class

```typescript
interface GameWorkConfig<TState, TAction> {
  initialState: TState;
  gameEngine: GameEngine<TState, TAction>;
  uiEngine: UIEngine<TState>;
  networkEngine: NetworkEngine;
  eventBus: EventBus;
  stateStore: StateStore<TState>;
}

class GameWork<TState, TAction> {
  private config: GameWorkConfig<TState, TAction>;
  private isInitialized: boolean = false;
  
  constructor(config: GameWorkConfig<TState, TAction>) {
    this.config = config;
    this.setupEventHandlers();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Initialize components
    this.config.uiEngine.initialize();
    
    // Set up state subscription
    this.config.stateStore.subscribe((state) => {
      this.config.uiEngine.render(state);
    });
    
    // Set up network message handling
    this.config.networkEngine.onMessage((peerId, message) => {
      this.handleNetworkMessage(peerId, message);
    });
    
    this.isInitialized = true;
  }
  
  private setupEventHandlers(): void {
    // Game actions
    this.config.eventBus.on('game:action', (action: TAction) => {
      this.handleGameAction(action);
    });
    
    // Network events
    this.config.eventBus.on('network:connected', (peerId: string) => {
      this.handlePlayerConnected(peerId);
    });
    
    this.config.eventBus.on('network:disconnected', (peerId: string) => {
      this.handlePlayerDisconnected(peerId);
    });
  }
  
  private handleGameAction(action: TAction): void {
    const currentState = this.config.stateStore.getState();
    const newState = this.config.gameEngine.processAction(currentState, action);
    this.config.stateStore.setState(newState);
  }
  
  private handleNetworkMessage(peerId: string, message: any): void {
    // Handle incoming network messages
    this.config.eventBus.emit('network:message', { peerId, message });
  }
  
  // Public API
  getState(): TState {
    return this.config.stateStore.getState();
  }
  
  dispatchAction(action: TAction): void {
    this.config.eventBus.emit('game:action', action);
  }
  
  connect(peerId: string): Promise<void> {
    return this.config.networkEngine.connect(peerId);
  }
  
  disconnect(peerId: string): void {
    this.config.networkEngine.disconnect(peerId);
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
1. **State Store** - Centralized state management
2. **Event Bus** - Pure event communication
3. **DI Container** - Dependency injection
4. **Error Handler** - Centralized error management

### Phase 2: Game Components (Week 2)
1. **Game Engine** - Pure game logic
2. **UI Engine** - Pure rendering
3. **Network Engine** - Pure communication
4. **Main GameWork Class** - Orchestration

### Phase 3: Examples and Testing (Week 3)
1. **Tic-Tac-Toe Example** - Clean implementation
2. **Unit Tests** - 100% coverage
3. **Integration Tests** - End-to-end testing
4. **Documentation** - Complete API docs

## Deployment Workflow Integration

### Current Deployment Setup
The existing deployment workflow includes:

#### **Frontend Build Process**
- **Vite Configuration** - Optimized bundling with code splitting
- **Environment Variables** - `SIGNALING_SERVER_URL` injection
- **Legacy Browser Support** - ES2020 target with legacy plugin
- **Demo Build Script** - `scripts/build-demos-vite.sh`

#### **Server Deployment**
- **Docker Container** - Node.js 18 Alpine
- **Health Checks** - HTTP endpoint monitoring
- **Docker Compose** - Production orchestration
- **Security** - Non-root user, minimal dependencies

#### **Build Scripts**
```bash
# Framework build
npm run build

# Demo games build
npm run build:game

# Server build
npm run build:server

# Development
npm run dev:game
npm run dev:server
```

### New Architecture Deployment Integration

#### **Updated Build Configuration**

```typescript
// vite.config.ts - Updated for v2 architecture
import { defineConfig, loadEnv } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const signalingServerUrl = env.SIGNALING_SERVER_URL;
  
  return {
    base: './',
    plugins: [
      legacy({
        targets: ['defaults', 'not IE 11']
      })
    ],
    build: {
      outDir: 'demo-build',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: 'examples/index.html',
          'tic-tac-toe': 'examples/tic-tac-toe/tic-tac-toe.html'
        },
        output: {
          manualChunks: {
            // Updated for v2 architecture
            'gamework-core': ['src/core/StateStore.ts', 'src/core/EventBus.ts'],
            'gamework-engines': ['src/engines/GameEngine.ts', 'src/engines/UIEngine.ts'],
            'gamework-network': ['src/network/WebRTCManager.ts', 'src/network/SignalingClient.ts'],
            'gamework-main': ['src/core/GameWork.ts']
          }
        }
      },
      target: 'es2020'
    },
    define: {
      global: 'globalThis',
      __SIGNALING_SERVER_URL__: JSON.stringify(signalingServerUrl)
    }
  };
});
```

#### **Updated Package.json Scripts**

```json
{
  "scripts": {
    "build": "tsc",
    "build:client": "tsc",
    "build:server": "cd server && npm run build",
    "build:game": "chmod +x scripts/build-demos-vite.sh && ./scripts/build-demos-vite.sh",
    "dev": "tsc --watch",
    "dev:client": "tsc --watch",
    "dev:server": "cd server && npm run dev",
    "dev:game": "vite",
    "preview:game": "vite preview",
    "start:server": "cd server && npm start",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "clean": "rm -rf dist demo-build server/dist"
  }
}
```

#### **Updated Build Script**

```bash
#!/bin/bash
# scripts/build-demos-vite.sh - Updated for v2

echo "🎮 Building GameWork v2 Demo Games with Vite..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/demo-build"

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf "$BUILD_DIR"

# Build the framework first
echo "🔨 Building GameWork v2 framework..."
cd "$PROJECT_ROOT"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Framework build failed!"
    exit 1
fi

# Build the game using Vite
echo "🚀 Building game with Vite..."
npx vite build

if [ $? -ne 0 ]; then
    echo "❌ Vite build failed!"
    exit 1
fi

# Move HTML files to correct locations
echo "📝 Moving HTML files to correct locations..."
mv "$PROJECT_ROOT/demo-build/examples/index.html" "$PROJECT_ROOT/demo-build/index.html"
mv "$PROJECT_ROOT/demo-build/examples/tic-tac-toe/tic-tac-toe.html" "$PROJECT_ROOT/demo-build/tic-tac-toe.html"

# Remove empty examples directory
rm -rf "$PROJECT_ROOT/demo-build/examples"

# Fix asset paths
echo "📝 Fixing asset paths in HTML files..."
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/index.html"
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/tic-tac-toe.html"

echo "✅ GameWork v2 demo games build completed!"
echo "📁 Build directory: $BUILD_DIR"
echo "🚀 Ready for deployment!"
```

### **Server Deployment (Minimal Changes)**

The server deployment remains largely unchanged:

#### **Dockerfile (Updated for v2)**
```dockerfile
# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy source files maintaining directory structure
COPY server/ ./server/
COPY shared ./shared

# Install all dependencies
RUN cd server && npm install

# Build the application
RUN cd server && npm run build

# Remove dev dependencies after build
RUN cd server && npm prune --omit=dev

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check using HTTP endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://127.0.0.1:8080/health', (res) => { if (res.statusCode === 200) process.exit(0); else process.exit(1); }); req.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 5000);"

# Start the server
CMD ["node", "server/dist/server/server.js"]
```

#### **Docker Compose (Unchanged)**
```yaml
version: '3.8'

services:
  signaling-server:
    build:
      context: ..
      dockerfile: server/Dockerfile
    container_name: gamework-signalling-server
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
    restart: unless-stopped
    networks:
      - app_network

networks:
  app_network:
    external: true
```

### **Deployment Workflow**

#### **Development Workflow**
```bash
# Start development
npm run dev:server    # Start signaling server
npm run dev:game      # Start frontend dev server

# Build for production
npm run build:server  # Build server
npm run build:game    # Build frontend demos
```

#### **Production Deployment**
```bash
# Build everything
npm run build
npm run build:server
npm run build:game

# Deploy server
cd server
docker-compose up -d

# Deploy frontend (static files)
# Upload demo-build/ contents to CDN/static host
```

### **Environment Configuration**

#### **Development**
```bash
# .env.development
SIGNALING_SERVER_URL=ws://localhost:8080
NODE_ENV=development
```

#### **Production**
```bash
# .env.production
SIGNALING_SERVER_URL=wss://your-signaling-server.com
NODE_ENV=production
```

### **Key Benefits of Deployment Integration**

1. **Seamless Migration** - Existing deployment scripts work with v2
2. **No Breaking Changes** - Same build commands and outputs
3. **Optimized Bundling** - Better code splitting for v2 architecture
4. **Environment Flexibility** - Same environment variable system
5. **Docker Compatibility** - Server deployment unchanged
6. **Static Hosting** - Frontend still deploys as static files

## File Structure

```
gamework-v2/
├── src/
│   ├── core/
│   │   ├── StateStore.ts
│   │   ├── EventBus.ts
│   │   ├── DIContainer.ts
│   │   └── GameWork.ts
│   ├── engines/
│   │   ├── GameEngine.ts
│   │   ├── UIEngine.ts
│   │   └── NetworkEngine.ts
│   ├── network/
│   │   ├── WebRTCManager.ts
│   │   └── SignalingClient.ts
│   ├── types/
│   │   ├── GameTypes.ts
│   │   └── NetworkTypes.ts
│   └── utils/
│       ├── ErrorHandler.ts
│       └── Logger.ts
├── examples/
│   └── tic-tac-toe/
│       ├── TicTacToeGame.ts
│       ├── TicTacToeEngine.ts
│       └── TicTacToeUI.ts
├── tests/
│   ├── unit/
│   └── integration/
└── docs/
    └── API.md
```

## Benefits of Clean Architecture

### 1. **No Legacy Baggage**
- Fresh start with modern patterns
- No deprecated code mixed with new code
- Clean, consistent architecture

### 2. **Easy Testing**
- All components are testable in isolation
- Dependency injection enables easy mocking
- Pure functions are easy to test

### 3. **Maintainable**
- Clear separation of concerns
- Single responsibility principle
- Easy to understand and modify

### 4. **Scalable**
- Event-driven architecture scales well
- Easy to add new features
- Modular design allows for extensions

### 5. **Type Safe**
- Zero `any` types
- Strong generics throughout
- Compile-time guarantees

## Migration Strategy

### 1. **Backup Current Code**
```bash
# Create backup
cp -r gamework gamework-backup
```

### 2. **Delete Current Implementation**
```bash
# Remove old code
rm -rf client/
rm -rf examples/
# Keep server/ and shared/ for now
```

### 3. **Build New Architecture**
- Start with core infrastructure
- Build components one by one
- Test each component thoroughly

### 4. **Create Examples**
- Build Tic-Tac-Toe example
- Test with real scenarios
- Validate architecture

This approach gives you a **completely clean codebase** with no legacy patterns or deprecated code mixed in. Every line of code follows the same architectural principles.
