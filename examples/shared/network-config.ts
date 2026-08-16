import { DataChannelConfig, WebRTCNetworkEngineConfig } from '../../src';

// Replaced at build time by Vite's `define` (vite.config.ts); undefined in dev.
declare const __SIGNALING_SERVER_URL__: string | undefined;

const defined = (value: string | undefined): string => (typeof value !== 'undefined' && value) || '';

/**
 * Fully reliable, deliberately: omitting `maxRetransmits` is what makes an SCTP
 * channel retransmit until delivered. It used to cap at 3, which quietly made
 * this partially reliable — a lost message was abandoned. That is fatal here,
 * because nothing in the session layer retries or reconciles: a dropped `hello`
 * or `registry` hangs a device in the lobby forever, and a dropped move desyncs
 * a replicated game permanently.
 *
 * Games with a high-rate state stream declare those channels `unreliable` in
 * their session options instead, which routes them to a second data channel
 * (see UNRELIABLE_CHANNEL_CONFIG) rather than weakening this one.
 */
export const DATA_CHANNEL_CONFIG: DataChannelConfig = { ordered: true };

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
