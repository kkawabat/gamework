# WebSocket Connection Troubleshooting Guide

## Problem Statement
WebSocket connection from client to `wss://gamework.kankawabata.com/` fails with:
- Client logs: `WebSocket connection to 'wss://gamework.kankawabata.com/' failed`
- Client logs: `Close code: 1006`
- Client logs: `❌ CORS ISSUE: Server must allow origin: https://kkawabat.github.io`

## Systematic Troubleshooting Process

### Step 1: Verify DNS Resolution Between Containers
```bash
ssh kankawabata "docker exec reverse-proxy ping -c 3 gamework-signalling-server"
ssh kankawabata "docker exec reverse-proxy nslookup gamework-signalling-server"
```
**Result**: ✅ DNS resolution works (resolves to 172.19.0.4)

### Step 2: Test Direct HTTP Connection to Signaling Server
```bash
ssh kankawabata "docker exec reverse-proxy wget -O- http://gamework-signalling-server:8080/health"
```
**Result**: ✅ Direct HTTP connection works, returns JSON health status

### Step 3: Examine Caddy Configuration
```bash
ssh kankawabata "docker exec reverse-proxy cat /etc/caddy/Caddyfile"
```
**Result**: ✅ Caddy configuration includes WebSocket headers and proper reverse proxy setup

### Step 4: Verify Server Binding
```bash
ssh kankawabata "docker exec gamework-signalling-server netstat -tlnp"
```
**Result**: ✅ Server binds to 0.0.0.0:8080 (all interfaces)

### Step 5: Test WebSocket Handshake Process
```bash
ssh kankawabata "docker exec reverse-proxy wget -O- --header='Connection: Upgrade' --header='Upgrade: websocket' --header='Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' --header='Sec-WebSocket-Version: 13' http://gamework-signalling-server:8080/"
```
**Result**: ✅ Direct WebSocket handshake works (returns HTTP/1.1 101 Switching Protocols)

### Step 6: Test Through Caddy Proxy
```bash
ssh kankawabata "wget -O- --header='Connection: Upgrade' --header='Upgrade: websocket' --header='Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' --header='Sec-WebSocket-Version: 13' https://gamework.kankawabata.com/"
```
**Result**: ❌ **PROBLEM IDENTIFIED** - Returns JSON response instead of WebSocket upgrade

### Step 7: Check Caddy Logs for WebSocket Attempts
```bash
ssh kankawabata "docker exec reverse-proxy tail -20 /var/log/caddy/gamework.log"
```
**Result**: ✅ WebSocket requests reach Caddy with proper headers, but Caddy returns JSON instead of upgrading

### Step 8: Check Signaling Server Logs
```bash
ssh kankawabata "docker logs gamework-signalling-server --tail=10"
```
**Result**: ✅ Server receives WebSocket connections and processes them correctly

## Root Cause Analysis

### The Real Problem
**Caddy is not performing WebSocket upgrades**. Instead, it's treating WebSocket upgrade requests as regular HTTP requests and returning JSON responses from the server.

### Evidence
1. **Direct connection to signaling server**: Returns `HTTP/1.1 101 Switching Protocols` ✅
2. **Connection through Caddy**: Returns JSON response ❌
3. **Caddy logs**: Show WebSocket requests with proper headers but return HTTP 200 with JSON
4. **Server logs**: Show WebSocket connections are processed correctly

### The Issue
Caddy is not automatically detecting WebSocket upgrade requests. The current Caddyfile configuration:
```caddyfile
gamework.kankawabata.com {
    reverse_proxy gamework-signalling-server:8080 {
        # WebSocket headers are configured but Caddy doesn't auto-detect upgrades
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
        # ... other headers
    }
}
```

## Potential Solutions

### Solution 1: Add Explicit WebSocket Handling to Caddyfile
```caddyfile
gamework.kankawabata.com {
    # WebSocket handling
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket gamework-signalling-server:8080 {
        # WebSocket specific configuration
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
        header_up Sec-WebSocket-Key {>Sec-WebSocket-Key}
        header_up Sec-WebSocket-Version {>Sec-WebSocket-Version}
        header_up Sec-WebSocket-Protocol {>Sec-WebSocket-Protocol}
        header_up Sec-WebSocket-Extensions {>Sec-WebSocket-Extensions}
    }
    
    # HTTP handling for non-WebSocket requests
    reverse_proxy gamework-signalling-server:8080 {
        health_uri /health
        health_interval 30s
        health_timeout 10s
        # ... standard headers
    }
}
```

### Solution 2: Check Caddy Version and WebSocket Support
```bash
ssh kankawabata "docker exec reverse-proxy caddy version"
ssh kankawabata "docker exec reverse-proxy caddy list-modules | grep -i websocket"
```

### Solution 3: Alternative - Use Different Reverse Proxy
Consider using nginx or traefik if Caddy WebSocket handling continues to be problematic.

## Key Learnings

1. **Always test the full path**: Client → Caddy → Server
2. **Test each component individually**: Direct server connection vs. through proxy
3. **Check logs at each layer**: Client logs, Caddy logs, Server logs
4. **WebSocket upgrades require explicit handling**: Not all reverse proxies auto-detect WebSocket upgrades
5. **CORS is a red herring**: The real issue was WebSocket upgrade handling, not CORS

## Commands for Future Debugging

### Quick Health Check
```bash
# Check all containers
ssh kankawabata "docker ps"

# Check DNS resolution
ssh kankawabata "docker exec reverse-proxy nslookup gamework-signalling-server"

# Test direct server connection
ssh kankawabata "docker exec reverse-proxy wget -O- http://gamework-signalling-server:8080/health"

# Test WebSocket through Caddy
ssh kankawabata "wget -O- --header='Connection: Upgrade' --header='Upgrade: websocket' --header='Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' --header='Sec-WebSocket-Version: 13' https://gamework.kankawabata.com/"
```

### Log Analysis
```bash
# Caddy logs
ssh kankawabata "docker logs reverse-proxy --tail=20"
ssh kankawabata "docker exec reverse-proxy tail -20 /var/log/caddy/gamework.log"

# Server logs
ssh kankawabata "docker logs gamework-signalling-server --tail=10"
```

### Network Diagnostics
```bash
# Check server binding
ssh kankawabata "docker exec gamework-signalling-server netstat -tlnp"

# Test connectivity
ssh kankawabata "docker exec reverse-proxy ping -c 3 gamework-signalling-server"
```

## Next Steps
1. Implement explicit WebSocket handling in Caddyfile
2. Test WebSocket connection after configuration change
3. If Caddy continues to fail, consider alternative reverse proxy solutions
4. Document the final working configuration
