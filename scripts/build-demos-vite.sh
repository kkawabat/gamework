#!/bin/bash

echo "🎮 Building GameWork Demo Games with Vite..."

# Set script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/demo-build"

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

# Move the built HTML files to the correct locations
echo "📝 Moving HTML files to correct locations..."
mv "$PROJECT_ROOT/demo-build/examples/index.html" "$PROJECT_ROOT/demo-build/index.html"
mv "$PROJECT_ROOT/demo-build/examples/tic-tac-toe/tic-tac-toe.html" "$PROJECT_ROOT/demo-build/tic-tac-toe.html"
mv "$PROJECT_ROOT/demo-build/examples/connect-four/connect-four.html" "$PROJECT_ROOT/demo-build/connect-four.html"
mv "$PROJECT_ROOT/demo-build/examples/simple-card-game/card-game.html" "$PROJECT_ROOT/demo-build/card-game.html"
mv "$PROJECT_ROOT/demo-build/examples/simple-chess/chess.html" "$PROJECT_ROOT/demo-build/chess.html"

# Remove the empty examples directory structure
rm -rf "$PROJECT_ROOT/demo-build/examples"

# Fix asset paths in the HTML files (change ../../assets/ to ./assets/)
echo "📝 Fixing asset paths in HTML files..."
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/index.html"
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/tic-tac-toe.html"
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/connect-four.html"
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/card-game.html"
sed -i 's|../../assets/|./assets/|g' "$PROJECT_ROOT/demo-build/chess.html"

# Environment variables are handled by Vite's loadEnv and define config
echo "📝 Using Vite environment variable injection..."
echo "SIGNALING_SERVER_URL: ${SIGNALING_SERVER_URL:-<from-.env-file>}"

# Pure production build - no development files needed
echo "📝 Creating pure production build..."

# The main demo index.html is now built directly to demo-build root
# No need to copy it since Vite now outputs it correctly

# Display build summary
echo ""
echo "✅ GameWork demo games build completed with Vite!"
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
echo "  cd $PROJECT_ROOT/demo-build"
echo "  python3 -m http.server 8000"
echo ""
echo "🌐 Or use any static file server:"
echo "  python3 -m http.server 8000"
echo "  npx serve ."
echo "  # Or any other static file server"
echo ""
echo "📦 Files ready for deployment:"
echo "  - demo-build/index.html (main demo page)"
echo "  - demo-build/tic-tac-toe.html (tic-tac-toe game)"
echo "  - demo-build/connect-four.html (connect four game)"
echo "  - demo-build/card-game.html (card game)"
echo "  - demo-build/chess.html (chess game)"
echo "  - demo-build/assets/ (bundled and optimized framework)"
echo ""
echo "🎉 GameWork Multiplayer Games are ready for deployment!"
echo "✨ Built with Vite for optimal performance and compatibility!"
