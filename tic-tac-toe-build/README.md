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

- **Game Rules**: Defined in `simple-tic-tac-toe.ts`
- **State Management**: Uses GameWork's state synchronization
- **WebRTC**: Real-time peer-to-peer communication
- **Host-Authoritative**: One device maintains game state
- **Signaling Service**: Facilitates peer discovery and connection setup

## Technical Details

- **Framework**: GameWork (compiled in `dist/` folder)
- **Game Logic**: TypeScript-based game rules
- **UI**: Pure HTML/CSS/JavaScript with ES6 modules
- **Deployment**: Static files ready for any hosting service
- **Multiplayer**: WebRTC DataChannels for real-time communication

## Local Development

To run locally:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js serve
npx serve .

# Using any static file server
```

Then open http://localhost:8000 in your browser.

## Framework Files

- `dist/`: Compiled GameWork framework
- `simple-tic-tac-toe.ts`: Game rules and configuration
- `index.html`: Complete multiplayer game implementation

## Live Demo

This game is automatically deployed to GitHub Pages when changes are pushed to the main branch.

## Multiplayer Setup

1. **Host**: Opens the game and becomes the host automatically
2. **Players**: Join using the room code or QR code
3. **WebRTC**: Establishes direct peer-to-peer connections
4. **Game State**: Synchronized across all players in real-time
