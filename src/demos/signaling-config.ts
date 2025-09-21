// Signaling server configuration
// This file allows easy switching between development and production signaling servers

export const SIGNALING_CONFIG = {
    // Production signaling server (deployed on your droplet)
    PRODUCTION: {
        serverUrl: 'wss://gamework.kankawabata.com',
        reconnectInterval: 5000,
        maxReconnectAttempts: 10
    },
    
    // Local development signaling server
    DEVELOPMENT: {
        serverUrl: 'ws://localhost:8080',
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
    }
};

// Determine which configuration to use based on environment
export function getSignalingConfig() {
    // Check if we're in development mode (localhost or 127.0.0.1)
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname === '0.0.0.0';
    
    return isDevelopment ? SIGNALING_CONFIG.DEVELOPMENT : SIGNALING_CONFIG.PRODUCTION;
}

// Export the active configuration
export const activeSignalingConfig = getSignalingConfig();
