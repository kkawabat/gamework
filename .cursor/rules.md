# Cursor Rules for WebSocket and Network Debugging

## WebSocket Connection Debugging Strategy

When debugging WebSocket connection failures, follow this systematic approach:

### 1. Test Each Layer Separately
```bash
# Test 1: Basic HTTP connectivity
curl -I https://your-domain.com/

# Test 2: Health endpoint
curl https://your-domain.com/health

# Test 3: Root path response
curl https://your-domain.com/

# Test 4: WebSocket upgrade test
curl -H 'Upgrade: websocket' -H 'Connection: Upgrade' https://your-domain.com/
```

### 2. Check Server Logs for ALL Request Types
```bash
# Look for HTTP requests, not just WebSocket connections
docker logs your-container | grep -E "(GET|POST|WebSocket|upgrade)"

# Check for 404 errors specifically
docker logs your-container | grep "404"
```

### 3. Common WebSocket Issues and Solutions

#### Issue: "WebSocket connection failed" but server shows connections
- **Root Cause**: Server missing route for root path `/`
- **Solution**: Add HTTP route handler for `/` that returns 200
- **Test**: `curl https://your-domain.com/` should return 200, not 404

#### Issue: HTTP/2 404 responses
- **Root Cause**: HTTP/2 doesn't support WebSocket upgrades OR missing route
- **Solution**: Check if server has route for `/` first, then consider HTTP/1.1
- **Test**: Verify server responds to basic HTTP requests

#### Issue: Server binding problems
- **Root Cause**: Server binding to IPv6 only (`:::8080`) instead of all interfaces
- **Solution**: Bind to `0.0.0.0:8080` for IPv4 compatibility
- **Test**: `netstat -tlnp | grep 8080` should show `0.0.0.0:8080`

### 4. Debugging Checklist

When WebSocket connections fail:

1. **✅ Test basic HTTP first**: `curl -I https://your-domain.com/`
2. **✅ Check server logs**: Look for HTTP requests, not just WebSocket
3. **✅ Verify server binding**: `netstat -tlnp | grep PORT`
4. **✅ Test each endpoint**: `/`, `/health`, WebSocket upgrade
5. **✅ Don't assume obvious causes**: WebSocket failure ≠ WebSocket problem

### 5. Common Misconceptions to Avoid

- **❌ "WebSocket connection failed" = WebSocket problem**
  - **✅ Reality**: Could be missing HTTP route handler

- **❌ "HTTP/2 404" = HTTP/2 problem**  
  - **✅ Reality**: Could be missing server route

- **❌ "Connection error" = Network problem**
  - **✅ Reality**: Could be server binding issue

### 6. Network Debugging Commands

```bash
# Check what the server is listening on
netstat -tlnp | grep PORT

# Test server directly (bypass proxy)
curl http://localhost:PORT/

# Check container health
docker ps
docker logs container-name

# Test WebSocket with proper headers
curl -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
     -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     -H 'Sec-WebSocket-Version: 13' \
     https://your-domain.com/ -v
```

### 7. Key Principle: Test Each Layer Systematically

1. **Network Layer**: Can you reach the server?
2. **HTTP Layer**: Does the server respond to HTTP requests?
3. **WebSocket Layer**: Does the WebSocket handshake work?

**Never assume the obvious cause - test each layer methodically!**
