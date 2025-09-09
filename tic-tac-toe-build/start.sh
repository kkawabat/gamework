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
