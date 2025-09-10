# GameWork Development Guide

This guide explains how to set up and use the development testbed for the GameWork framework.

## 🚀 Quick Start

### 1. Development Server (Recommended)
```bash
npm run dev:game
```
This starts an auto-reloading development server that:
- ✅ Automatically rebuilds when you change TypeScript files
- ✅ Serves the Tic-Tac-Toe game at `http://localhost:3000`
- ✅ Provides hot-reload for development
- ✅ No need to manually start/stop servers

**Note**: If you encounter file watching issues on WSL2, use the simple server instead:
```bash
npm run dev:game
```

### 2. Manual Build & Test
```bash
# Build the framework
npm run build

# Build the Tic-Tac-Toe game
npm run build:game

# Start a simple server
cd demo-build/tic-tac-toe && python3 -m http.server 8000
```

## 🧪 Testing

### Unit Tests
```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Testing
```bash
# Run all tests
npm run test:all
```

### Manual Testing
1. Start the dev server: `npm run dev:game`
2. Open `http://localhost:3000` in your browser
3. Open browser dev tools to see console logs
4. Test the Tic-Tac-Toe game functionality

## 📁 Project Structure

```
gamework/
├── src/                    # Framework source code
│   ├── core/              # Core game engine
│   ├── host/              # Host-side logic
│   ├── client/            # Client-side logic
│   ├── networking/        # WebRTC and signaling
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── examples/              # Example games
│   ├── tic-tac-toe-multiplayer.html
│   └── simple-tic-tac-toe.ts
├── tests/                 # Test files
│   ├── setup.ts          # Test environment setup
│   └── *.integration.test.ts
├── scripts/               # Build and development scripts
│   └── build-tic-tac-toe-vite.sh
├── demo-build/            # Built demos (auto-generated)
└── dist/                  # Built framework (auto-generated)
```

## 🔧 Development Workflow

### 1. Framework Development
```bash
# Start development server
npm run dev:game

# In another terminal, run tests in watch mode
npm run test:watch
```

### 2. Game Development
```bash
# Make changes to src/demos/simple-tic-tac-toe.ts
# The dev server will auto-rebuild

# Test the game at http://localhost:3000
```

### 3. Testing Changes
```bash
# Run all tests
npm run test:all

# Or run specific test types
npm test                    # Unit tests only
npm run test:browser        # Browser tests only
```

## 🐛 Debugging

### Console Logs
The development server provides detailed console output:
- 🔨 Build status
- 📝 File change notifications
- 🌐 Server status
- ❌ Error messages

### Browser Dev Tools
1. Open `http://localhost:3000`
2. Press F12 to open dev tools
3. Check Console tab for errors
4. Check Network tab for failed requests

### Common Issues

#### Module Import Errors
```bash
# Rebuild the game to fix import paths
npm run build:game
```

#### WebRTC Connection Issues
- Check browser console for WebRTC errors
- Ensure you're using HTTPS in production
- Test with multiple browser tabs/windows

#### Build Failures
```bash
# Clean and rebuild
npm run clean
npm run build
npm run build:game
```

## 📦 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:game` | Start Vite development server |
| `npm run build` | Build the framework |
| `npm run build:game` | Build the Tic-Tac-Toe game |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:all` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run clean` | Clean build directories |

## 🌐 Testing URLs

When running the development server:

- **Main Game**: `http://localhost:3000/`
- **Tic-Tac-Toe**: `http://localhost:3000/tic-tac-toe/`
- **Framework Demo**: `http://localhost:3000/demo/`

## 🔄 Auto-Reload Features

The development server automatically:
- ✅ Rebuilds when TypeScript files change
- ✅ Serves updated files immediately
- ✅ Provides no-cache headers for development
- ✅ Supports SPA routing

## 🚀 Production Deployment

For production deployment:
```bash
# Build everything
npm run build:game

# The demo-build/ directory contains all files needed
# Upload to your hosting service
```

## 📚 Additional Resources

- [GameWork Framework Documentation](./README.md)
- [Tic-Tac-Toe Game Guide](./demo-build/tic-tac-toe/README.md)
- [WebRTC Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
