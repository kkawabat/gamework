export interface Player {
  id: string;
  name?: string;
  [key: string]: any;
}

// ConnectionInfo interface removed - now using Player interface with WebRTC info

// Re-export RTCIceServer for convenience
export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export interface GameWorkConfig {
  stunServers?: RTCIceServer[];
  signalServiceConfig: {
    serverUrl: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
  };
  // GameWork-specific config can be added here
}