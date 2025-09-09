// Test setup for browser environment
// Note: Browser testing dependencies removed for now to fix CI

// Mock WebRTC for testing
global.RTCPeerConnection = class MockRTCPeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceConnectionState = 'new';
    this.connectionState = 'new';
  }
  
  createOffer() {
    return Promise.resolve({
      type: 'offer',
      sdp: 'mock-sdp'
    });
  }
  
  createAnswer() {
    return Promise.resolve({
      type: 'answer',
      sdp: 'mock-sdp'
    });
  }
  
  setLocalDescription(desc) {
    this.localDescription = desc;
    return Promise.resolve();
  }
  
  setRemoteDescription(desc) {
    this.remoteDescription = desc;
    return Promise.resolve();
  }
  
  addIceCandidate(candidate) {
    return Promise.resolve();
  }
  
  createDataChannel(label, options) {
    return new MockRTCDataChannel();
  }
  
  close() {
    this.iceConnectionState = 'closed';
    this.connectionState = 'closed';
  }
};

class MockRTCDataChannel {
  constructor() {
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this.binaryType = 'arraybuffer';
  }
  
  send(data) {
    // Mock send
  }
  
  close() {
    this.readyState = 'closed';
  }
}

global.RTCDataChannel = MockRTCDataChannel;

// Mock crypto for UUID generation
global.crypto = {
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }
};

// Mock fetch for signaling service
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
