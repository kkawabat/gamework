// Example usage of the GameWork WebSocket Signaling Service
// This shows how to integrate the signaling server with the GameWork framework

// Example 1: Basic WebSocket connection test
function testWebSocketConnection() {
    const ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        console.log('Connected to signaling server');
        
        // Join a room
        ws.send(JSON.stringify({
            type: 'join_room',
            payload: {
                roomId: 'TEST123',
                playerId: 'player-1',
                playerName: 'Test Player'
            }
        }));
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received:', message);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

// Example 2: Using with GameWork framework (TypeScript)
/*
import { GameHost } from 'gamework';
import { WebSocketSignalingService } from 'gamework/src/networking/SignalingService';

// Create WebSocket signaling service
const signalingService = new WebSocketSignalingService({
    serverUrl: 'ws://your-server:8080',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
});

// Create game host with WebSocket signaling
const gameHost = new GameHost({
    roomId: 'GAME123',
    roomName: 'My Game Room',
    gameConfig: {
        gameType: 'tic-tac-toe',
        maxPlayers: 4,
        initialState: { /* your game state */ },
        rules: { /* your game rules */ }
    }
}, signalingService);

// Start the game
gameHost.start().then(() => {
    console.log('Game host started with WebSocket signaling');
});
*/

// Example 3: Client-side usage
/*
import { GameClient } from 'gamework';
import { WebSocketSignalingService } from 'gamework/src/networking/SignalingService';

// Create WebSocket signaling service for client
const signalingService = new WebSocketSignalingService({
    serverUrl: 'ws://your-server:8080'
});

// Create game client
const gameClient = new GameClient({
    roomId: 'GAME123',
    playerName: 'Player Name'
}, signalingService);

// Connect to game
gameClient.connect().then(() => {
    console.log('Connected to game with WebSocket signaling');
});
*/

// Example 4: Environment-based configuration
function getSignalingConfig() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const serverUrl = isDevelopment 
        ? 'ws://localhost:8080'
        : 'wss://your-production-server.com:8080';
    
    return {
        serverUrl,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
        pingInterval: 30000
    };
}

// Example 5: Error handling and reconnection
function createRobustSignalingService() {
    const signalingService = new WebSocketSignalingService({
        serverUrl: 'ws://your-server:8080',
        reconnectInterval: 5000,
        maxReconnectAttempts: 10
    });
    
    // Handle connection errors
    signalingService.onError((error) => {
        console.error('Signaling service error:', error);
        // Implement your error handling logic here
    });
    
    return signalingService;
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    console.log('WebSocket signaling service example loaded');
    console.log('Run testWebSocketConnection() to test the connection');
} else {
    // Node.js environment
    console.log('WebSocket signaling service example loaded');
    console.log('This example is designed for browser usage');
}




