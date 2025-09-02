#!/bin/bash

echo "🏗️  Building GameWork Framework..."

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist/

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build TypeScript
echo "🔨 Compiling TypeScript..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📁 Output directory: dist/"
    echo "📊 Build size:"
    du -sh dist/
else
    echo "❌ Build failed!"
    exit 1
fi

echo "🎉 GameWork Framework is ready!"
echo ""
echo "To test the framework:"
echo "  npm test"
echo ""
echo "To start development mode:"
echo "  npm run dev"
echo ""
echo "To use in your project:"
echo "  import { GameHost, GameClient } from './dist'"

