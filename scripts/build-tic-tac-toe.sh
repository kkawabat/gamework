#!/bin/bash

echo "🎮 Building GameWork Tic-Tac-Toe Multiplayer Game..."

# Set script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/tic-tac-toe-build"

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build the framework
echo "🔨 Building GameWork framework..."
cd "$PROJECT_ROOT"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Framework build failed!"
    exit 1
fi

# Create the Tic-Tac-Toe multiplayer game build
echo "🎯 Preparing Tic-Tac-Toe multiplayer game..."

# Copy the multiplayer game HTML file
cp "$PROJECT_ROOT/examples/tic-tac-toe-multiplayer.html" "$BUILD_DIR/index.html"

# Copy the compiled framework
cp -r "$PROJECT_ROOT/dist" "$BUILD_DIR/"

# Copy the Tic-Tac-Toe game rules
cp "$PROJECT_ROOT/examples/simple-tic-tac-toe.ts" "$BUILD_DIR/"

# Create a package.json for the game
cat > "$BUILD_DIR/package.json" << EOF
{
  "name": "gamework-tic-tac-toe-multiplayer",
  "version": "1.0.0",
  "description": "Multiplayer Tic-Tac-Toe game built with GameWork framework",
  "main": "index.html",
  "type": "module",
  "scripts": {
    "start": "python3 -m http.server 8000",
    "serve": "npx serve ."
  },
  "keywords": [
    "tic-tac-toe",
    "multiplayer",
    "gamework",
    "webrtc",
    "p2p"
  ],
  "author": "GameWork Framework",
  "license": "MIT"
}
EOF

# Create a README for the game
cat > "$BUILD_DIR/README.md" << EOF
# GameWork Tic-Tac-Toe Multiplayer

A complete multiplayer Tic-Tac-Toe game implementation using the GameWork framework.

## Features

- 🎮 **True Multiplayer**: Real-time multiplayer using WebRTC
- 🎨 **Beautiful UI**: Modern, responsive design with animations
- 📱 **Mobile Friendly**: Works great on phones and tablets
- 🔄 **State Management**: Export/import game state functionality
- 📊 **Game Logging**: Real-time game event logging
- 🏠 **Host-Authoritative**: Uses GameWork's host-authoritative architecture
- 📱 **QR Code Invites**: Generate QR codes for easy room joining

## How to Play

1. **Host a Game**: The first player becomes the host automatically
2. **Share Room Code**: Share the 6-character room code with other players
3. **Join via QR Code**: Players can scan the QR code to join
4. **Make Moves**: Players take turns making moves on the board
5. **Win Condition**: Get three in a row (horizontally, vertically, or diagonally)

## GameWork Integration

This game demonstrates the GameWork framework's capabilities:

- **Game Rules**: Defined in \`simple-tic-tac-toe.ts\`
- **State Management**: Uses GameWork's state synchronization
- **WebRTC**: Real-time peer-to-peer communication
- **Host-Authoritative**: One device maintains game state
- **Signaling Service**: Facilitates peer discovery and connection setup

## Technical Details

- **Framework**: GameWork (compiled in \`dist/\` folder)
- **Game Logic**: TypeScript-based game rules
- **UI**: Pure HTML/CSS/JavaScript with ES6 modules
- **Deployment**: Static files ready for any hosting service
- **Multiplayer**: WebRTC DataChannels for real-time communication

## Local Development

To run locally:

\`\`\`bash
# Using Python
python3 -m http.server 8000

# Using Node.js serve
npx serve .

# Using any static file server
\`\`\`

Then open http://localhost:8000 in your browser.

## Framework Files

- \`dist/\`: Compiled GameWork framework
- \`simple-tic-tac-toe.ts\`: Game rules and configuration
- \`index.html\`: Complete multiplayer game implementation

## Live Demo

This game is automatically deployed to GitHub Pages when changes are pushed to the main branch.

## Multiplayer Setup

1. **Host**: Opens the game and becomes the host automatically
2. **Players**: Join using the room code or QR code
3. **WebRTC**: Establishes direct peer-to-peer connections
4. **Game State**: Synchronized across all players in real-time
EOF

# Create a simple server script for local testing
cat > "$BUILD_DIR/serve.js" << 'EOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        fs.readFile('./index.html', (error, content) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        });
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🎮 Tic-Tac-Toe Multiplayer game server running at http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop the server');
});
EOF

# Make the server script executable
chmod +x "$BUILD_DIR/serve.js"

# Create a simple start script
cat > "$BUILD_DIR/start.sh" << 'EOF'
#!/bin/bash
echo "🎮 Starting GameWork Tic-Tac-Toe Multiplayer Game..."
echo "Server will be available at: http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo ""

# Try different methods to start the server
if command -v python3 &> /dev/null; then
    echo "Using Python 3..."
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "Using Python..."
    python -m SimpleHTTPServer 8000
elif command -v node &> /dev/null; then
    echo "Using Node.js..."
    node serve.js
else
    echo "❌ No suitable server found. Please install Python or Node.js"
    echo "Or use any static file server to serve the files in this directory"
    exit 1
fi
EOF

chmod +x "$BUILD_DIR/start.sh"

# Create a .gitignore for the build directory
cat > "$BUILD_DIR/.gitignore" << EOF
# Node modules (if using npm serve)
node_modules/
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
EOF

# Display build summary
echo ""
echo "✅ Tic-Tac-Toe multiplayer game build completed!"
echo "📁 Build directory: $BUILD_DIR"
echo ""
echo "📊 Build contents:"
ls -la "$BUILD_DIR"
echo ""
echo "🚀 To run the game locally:"
echo "  cd $BUILD_DIR"
echo "  ./start.sh"
echo ""
echo "🌐 Or use any static file server:"
echo "  python3 -m http.server 8000"
echo "  npx serve ."
echo "  # Or any other static file server"
echo ""
echo "📦 Files ready for deployment:"
echo "  - index.html (multiplayer game file)"
echo "  - dist/ (compiled GameWork framework)"
echo "  - simple-tic-tac-toe.ts (game rules)"
echo "  - README.md (documentation)"
echo ""
echo "🎉 GameWork Tic-Tac-Toe Multiplayer is ready for deployment!"
