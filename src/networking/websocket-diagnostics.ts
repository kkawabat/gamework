// WebSocket Diagnostics Utility
// This file provides helper functions for debugging WebSocket connection issues
// Can be imported and used in browser console for troubleshooting

import { WebSocketSignalingService } from './WebSocketSignalingService';

// Global diagnostic functions that can be called from browser console
declare global {
  interface Window {
    gameworkDiagnostics: {
      testWebSocketConnection: (url: string) => Promise<any>;
      getNetworkInfo: () => any;
      checkWebSocketSupport: () => any;
      testSignalingServer: (url?: string) => Promise<any>;
    };
  }
}

// Network information gathering
function getNetworkInfo() {
  const info: any = {
    timestamp: new Date().toISOString(),
    location: window.location.href,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    port: window.location.port,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack
  };

  // Connection information if available
  if ('connection' in navigator) {
    const conn = (navigator as any).connection;
    info.connection = {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      rtt: conn.rtt,
      saveData: conn.saveData
    };
  }

  // WebSocket support
  info.websocketSupported = typeof WebSocket !== 'undefined';
  if (info.websocketSupported) {
    info.websocketConstructor = WebSocket.name;
  }

  return info;
}

// WebSocket support check
function checkWebSocketSupport() {
  const support = {
    supported: typeof WebSocket !== 'undefined',
    constructor: typeof WebSocket !== 'undefined' ? WebSocket.name : 'undefined',
    constants: typeof WebSocket !== 'undefined' ? {
      CONNECTING: WebSocket.CONNECTING,
      OPEN: WebSocket.OPEN,
      CLOSING: WebSocket.CLOSING,
      CLOSED: WebSocket.CLOSED
    } : null
  };

  console.log('WebSocket Support Check:', support);
  return support;
}

// Test WebSocket connection to a specific URL
async function testWebSocketConnection(url: string) {
  console.log(`Testing WebSocket connection to: ${url}`);
  const result = await WebSocketSignalingService.testConnection(url);
  console.log('Connection test result:', result);
  return result;
}

// Test the signaling server specifically
async function testSignalingServer(url?: string) {
  const testUrl = url || 'wss://gamework.kankawabata.com';
  console.log(`Testing signaling server at: ${testUrl}`);
  
  const networkInfo = getNetworkInfo();
  console.log('Network Information:', networkInfo);
  
  const supportCheck = checkWebSocketSupport();
  
  const connectionTest = await testWebSocketConnection(testUrl);
  
  const result = {
    networkInfo,
    supportCheck,
    connectionTest,
    timestamp: new Date().toISOString()
  };
  
  console.log('Complete diagnostic result:', result);
  return result;
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.gameworkDiagnostics = {
    testWebSocketConnection,
    getNetworkInfo,
    checkWebSocketSupport,
    testSignalingServer
  };
  
  console.log('🔍 GameWork WebSocket Diagnostics loaded!');
  console.log('Available functions:');
  console.log('- window.gameworkDiagnostics.testSignalingServer()');
  console.log('- window.gameworkDiagnostics.testWebSocketConnection(url)');
  console.log('- window.gameworkDiagnostics.getNetworkInfo()');
  console.log('- window.gameworkDiagnostics.checkWebSocketSupport()');
}

export {
  testWebSocketConnection,
  getNetworkInfo,
  checkWebSocketSupport,
  testSignalingServer
};
