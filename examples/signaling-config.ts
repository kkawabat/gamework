// Signaling server configuration for examples
// Uses Vite-injected environment variable

const getSignalingServerUrl = (): string => {
  // Use Vite-injected environment variable (replaced at build time)
  // @ts-ignore - This is defined by Vite's define config
  if (typeof __SIGNALING_SERVER_URL__ !== 'undefined') {
    console.log('[SignalingConfig] Using Vite-injected URL:', __SIGNALING_SERVER_URL__);
    return __SIGNALING_SERVER_URL__;
  }
  
  // Fallback (should not happen in production)
  console.warn('[SignalingConfig] No URL injected, using fallback');
  return 'wss://gamework.kankawabata.com';
};

export const activeSignalingConfig = {
  get serverUrl() {
    return getSignalingServerUrl();
  },
  reconnectAttempts: 10,
  reconnectInterval: 3000
};

// Export for debugging
export const getSignalingUrl = getSignalingServerUrl;
