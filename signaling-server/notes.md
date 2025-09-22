🎯 How to Better Locate Problems in the Future
1. Test Each Layer Separately

# Test 1: Can you reach the server?
curl -I https://gamework.kankawabata.com/

# Test 2: Can you reach the health endpoint?
curl https://gamework.kankawabata.com/health

# Test 3: Can you reach the root path?
curl https://gamework.kankawabata.com/

# Test 4: WebSocket upgrade test
curl -H 'Upgrade: websocket' -H 'Connection: Upgrade' https://gamework.kankawabata.com/

2. Check Server Logs for HTTP Requests

# Look for HTTP requests, not just WebSocket connections
docker logs gamework-signalling-server | grep -E "(GET|POST|PUT|DELETE)"

3. Test with Simple HTTP Client First

# Test basic HTTP connectivity before WebSocket
curl -v https://gamework.kankawabata.com/

4. Use Network Debugging Tools
# Check what the server is actually listening on
netstat -tlnp | grep 8080

# Check if the server responds to HTTP requests
telnet localhost 8080
# Then send: GET / HTTP/1.1