# WebSocket Connection Debugging Guide

This guide helps you troubleshoot WebSocket connection issues with the GameWork signaling server.

## Enhanced Logging

The `WebSocketSignalingService` now includes comprehensive diagnostic logging. When you run your game, you'll see detailed logs in the browser console with the `[WebSocket]` prefix.

### What You'll See in the Console

1. **Initial Diagnostic Information** - Shows when the service is created:
   - Configuration details (server URL, reconnect settings)
   - Browser information (user agent, location, protocol)
   - WebSocket support check
   - Network status
   - Protocol compatibility warnings

2. **Connection Attempts** - Shows for each connection attempt:
   - Server URL being connected to
   - Connection attempt number
   - Connection timing
   - Success/failure details

3. **Error Details** - Shows detailed error information:
   - Error type and message
   - WebSocket ready state
   - Connection duration
   - Reconnection attempts

4. **Message Flow** - Shows all WebSocket messages:
   - Incoming messages with type and payload
   - Outgoing messages (ping, join room, etc.)

## Using the Diagnostic Tools

### Method 1: Browser Console Commands

Open your browser's developer console and run:

```javascript
// Test the signaling server connection
window.gameworkDiagnostics.testSignalingServer();

// Test a specific URL
window.gameworkDiagnostics.testWebSocketConnection('wss://gamework.kankawabata.com');

// Get network information
window.gameworkDiagnostics.getNetworkInfo();

// Check WebSocket support
window.gameworkDiagnostics.checkWebSocketSupport();
```

### Method 2: Programmatic Access

If you have access to the WebSocketSignalingService instance:

```javascript
// Log current diagnostic information
signalingService.logCurrentDiagnostics();

// Get diagnostic data as an object
const diagnostics = signalingService.getDiagnosticInfo();
console.log(diagnostics);

// Test connection programmatically
const result = await WebSocketSignalingService.testConnection('wss://gamework.kankawabata.com');
console.log(result);
```

## Common Issues and Solutions

### 1. Mixed Content Error
**Symptoms**: HTTPS page trying to connect to WS (insecure)
**Solution**: Use `wss://` instead of `ws://` for secure connections

### 2. DNS Resolution Issues
**Symptoms**: Connection timeout or "Failed to connect"
**Solution**: Check if the domain resolves correctly:
```bash
nslookup gamework.kankawabata.com
```

### 3. Firewall/Proxy Issues
**Symptoms**: Connection refused or timeout
**Solution**: Check if WebSocket connections are allowed through your network

### 4. SSL/TLS Certificate Issues
**Symptoms**: WSS connection fails with certificate errors
**Solution**: Verify the SSL certificate is valid and trusted

### 5. Server Not Running
**Symptoms**: Connection refused
**Solution**: Check if the signaling server is running on the target host

## What to Look For in the Logs

When you encounter connection issues, look for these specific log entries:

1. **Protocol Mismatch**:
   ```
   [WebSocket] Protocol Check: { protocolMatch: false, mixedContentWarning: "⚠️ HTTPS page trying to connect to WS (insecure)" }
   ```

2. **Connection Timeout**:
   ```
   [WebSocket] ❌ Connection error after 10000ms
   ```

3. **DNS Issues**:
   ```
   [WebSocket] ❌ Connection error after 0ms
   ```

4. **SSL Issues**:
   ```
   [WebSocket] ❌ Connection error after 500ms
   ```

## Reporting Issues

When reporting connection issues, please include:

1. The complete console output with `[WebSocket]` logs
2. The result of `window.gameworkDiagnostics.testSignalingServer()`
3. Your browser and operating system information
4. Network environment (corporate firewall, VPN, etc.)

## Example Diagnostic Output

Here's what a successful connection looks like:

```
[WebSocket] 🔍 DIAGNOSTIC INFORMATION
[WebSocket] ======================================
[WebSocket] Configuration: { serverUrl: "wss://gamework.kankawabata.com", reconnectInterval: 5000, maxReconnectAttempts: 10, pingInterval: 30000 }
[WebSocket] Browser Info: { userAgent: "Mozilla/5.0...", location: "https://your-game.com", protocol: "https:", hostname: "your-game.com", port: "" }
[WebSocket] Protocol Check: { pageProtocol: "https:", wsProtocol: "wss", protocolMatch: true, mixedContentWarning: "OK" }
[WebSocket] WebSocket Support: { supported: true, constructor: "WebSocket" }
[WebSocket] Network Status: { online: true, connectionType: "4g" }
[WebSocket] ======================================
[WebSocket] Attempting to connect to: wss://gamework.kankawabata.com
[WebSocket] Connection attempt #1
[WebSocket] Current time: 2024-01-15T10:30:00.000Z
[WebSocket] ✅ Connected successfully in 250ms
[WebSocket] Server URL: wss://gamework.kankawabata.com
[WebSocket] Protocol: none
[WebSocket] Ready state: connected
```

And here's what a failed connection looks like:

```
[WebSocket] ❌ Connection error after 5000ms
[WebSocket] Error event: Event { isTrusted: true, type: "error", target: WebSocket, currentTarget: WebSocket, eventPhase: 2, bubbles: false, cancelable: false, defaultPrevented: false, timeStamp: 1234567890 }
[WebSocket] Error type: error
[WebSocket] Ready state at error: 3
[WebSocket] URL at error: wss://gamework.kankawabata.com
[WebSocket] Protocol at error: 
```
