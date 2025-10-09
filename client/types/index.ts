export interface Player {
  id: string;
  name?: string;
  queuedCandidates?: RTCIceCandidateInit[];
  connection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  isConnected?: boolean;
  isHost?: boolean;
  remoteSet?: boolean;
  [key: string]: any;
}

export interface GameWorkConfig {
  webrtcConfig: WebRTCConfig;
  signalServiceConfig: {
    serverUrl: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
  };
}

export interface WebRTCConfig {
  rtcConfig: {
    iceServers: RTCIceServer[];
    iceCandidatePoolSize?: number;
    bundlePolicy?: string;
    rtcpMuxPolicy?: string;
    iceTransportPolicy?: string;
  };
  dataChannelConfig: {
    ordered: boolean;
  };
}