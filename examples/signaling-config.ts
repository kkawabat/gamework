// Signaling server configuration
// This can be overridden by environment variables during deployment

const getSignalingServerUrl = (): string => {
  // Check for environment variable first (used in deployment)
  if (typeof process !== 'undefined' && process.env.SIGNALING_SERVER_URL) {
    return process.env.SIGNALING_SERVER_URL;
  }
  
  // Check for window.SIGNALING_SERVER_URL (set by build process)
  if (typeof window !== 'undefined' && (window as any).SIGNALING_SERVER_URL) {
    return (window as any).SIGNALING_SERVER_URL;
  }
  
  // Default to production server
  return 'wss://gamework.kankawabata.com';
};

export const activeSignalingConfig = {
  url: getSignalingServerUrl(),
  reconnectAttempts: 10,
  reconnectInterval: 3000
};

// Export for debugging
export const getSignalingUrl = getSignalingServerUrl;
