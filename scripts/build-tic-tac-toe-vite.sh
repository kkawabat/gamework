#!/bin/bash

echo "🎮 Building GameWork Tic-Tac-Toe Multiplayer Game with Vite..."

# Set script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/demo-build/tic-tac-toe"

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf "$BUILD_DIR"

# Build the framework first
echo "🔨 Building GameWork framework..."
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

# Copy additional files from demo folder
echo "📝 Copying additional files from demo folder..."

# Copy files from the demo folder
cp "$PROJECT_ROOT/src/demos/package.json" "$BUILD_DIR/"
cp "$PROJECT_ROOT/src/demos/README.md" "$BUILD_DIR/"
cp "$PROJECT_ROOT/src/demos/start.sh" "$BUILD_DIR/"
cp "$PROJECT_ROOT/src/demos/.gitignore" "$BUILD_DIR/"

# Ensure start.sh is executable
chmod +x "$BUILD_DIR/start.sh"

# Copy the main demo index.html to the demo-build root
echo "📝 Copying main demo index.html..."
cp "$PROJECT_ROOT/src/demos/index.html" "$PROJECT_ROOT/demo-build/"

# Display build summary
echo ""
echo "✅ Tic-Tac-Toe multiplayer game build completed with Vite!"
echo "📁 Build directory: $BUILD_DIR"
echo "📁 Demo build directory: $PROJECT_ROOT/demo-build"
echo ""
echo "📊 Build contents:"
ls -la "$BUILD_DIR"
echo ""
echo "📊 Demo build contents:"
ls -la "$PROJECT_ROOT/demo-build"
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
echo "  - demo-build/index.html (main demo page)"
echo "  - demo-build/tic-tac-toe/ (tic-tac-toe game)"
echo "  - demo-build/tic-tac-toe/assets/ (bundled and optimized framework)"
echo "  - demo-build/tic-tac-toe/README.md (documentation)"
echo ""
echo "🎉 GameWork Tic-Tac-Toe Multiplayer is ready for deployment!"
echo "✨ Built with Vite for optimal performance and compatibility!"
