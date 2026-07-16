import { WebRTCNetworkEngineConfig } from '../../src/engines/WebRTCNetworkEngine';
import { DataChannelConfig } from '../../src/types/NetworkTypes';

// Replaced at build time by Vite's `define` (vite.config.ts); undefined in dev.
declare const __SIGNALING_SERVER_URL__: string | undefined;

const defined = (value: string | undefined): string => (typeof value !== 'undefined' && value) || '';

export const DATA_CHANNEL_CONFIG: DataChannelConfig = { ordered: true, maxRetransmits: 3 };

/**
 * STUN alone only tells a peer its own public address. Carrier-grade NAT — which
 * every player on cellular sits behind — hands out a different port per
 * destination, so that address is useless to the other peer and no direct
 * connection can form. A TURN relay is the only thing that works there.
 *
 * TURN is deliberately absent here: the signaling server holds the relay secret
 * and sends per-player credentials with ROOM_CREATED/ROOM_JOINED, so no
 * credential is ever baked into this public bundle. These STUN entries are only
 * the pre-room default and the local-dev fallback.
 */
export function createNetworkConfig(): WebRTCNetworkEngineConfig {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    signalingServerUrl: defined(__SIGNALING_SERVER_URL__) || 'ws://localhost:8080'
  };
}
