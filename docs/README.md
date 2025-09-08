# GameWork Framework Documentation

This directory contains comprehensive documentation for the GameWork framework.

## Documentation Files

- **[Framework Components](framework-components.mdc)** - Detailed overview of all framework components, their purposes, and usage patterns
- **[Original Requirements](../.cursor/rules/original_prompt.txt)** - The original project requirements and specifications

## Quick Reference

### Core Components
- **GameEngine**: Manages game state and applies moves
- **WebRTCManager**: Handles peer-to-peer connections
- **SignalingService**: Facilitates peer discovery
- **GameHost**: Orchestrates game sessions
- **GameClient**: Connects players to games
- **Utilities**: Helper functions for common operations

### Key Features
- Host-authoritative architecture
- WebRTC peer-to-peer communication
- State synchronization with version control
- PWA support for host devices
- QR code room invites
- Export/import game state
- TypeScript support throughout

### Getting Started
1. Define your game state and rules
2. Create a GameHost instance
3. Create GameClient instances for players
4. Implement UI rendering logic
5. Deploy to static hosting

For detailed information, see the [Framework Components](framework-components.mdc) documentation.
