# GameWork Signaling Server Setup

This guide explains how to set up and deploy the GameWork signaling server for production use.

## Overview

The GameWork framework uses WebRTC for peer-to-peer communication, but requires a signaling server to facilitate initial connection setup. This signaling server is lightweight and designed for easy deployment on cloud providers like DigitalOcean.

## Quick Start

### Option 1: One-Command Deployment (Recommended)

1. **Clone the repository on your droplet**:
   ```bash
   git clone https://github.com/kkawabat/gamework.git
   cd gamework/signaling-server
   ```

2. **Run the automated deployment script**:
   ```bash
   ./deploy.sh
   ```

That's it! The script will:
- Install Docker and Docker Compose
- Build and start the signaling server
- Configure the firewall
- Show you the server URL

### Option 2: Manual Docker Setup

1. **Install Docker and Docker Compose** (if not already installed):
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

2. **Start the signaling server**:
   ```bash
   cd gamework/signaling-server
   docker-compose up -d
   ```

3. **Verify it's running**:
   ```bash
   docker-compose ps
   curl -I http://localhost:8080
   ```

## Configuration

### Environment Variables

You can customize the server by setting environment variables in `docker-compose.yml`:

```yaml
services:
  signaling-server:
    environment:
      - PORT=8080          # Server port
      - NODE_ENV=production
```

### Custom Port

To use a different port (e.g., 80 for HTTP):

```yaml
services:
  signaling-server:
    ports:
      - "80:8080"  # Map host port 80 to container port 8080
    environment:
      - PORT=8080
```

## Integration with GameWork

### Using the WebSocket Signaling Service

Replace the default in-memory signaling service with the WebSocket implementation:

```typescript
import { GameHost } from 'gamework';
import { WebSocketSignalingService } from 'gamework/src/networking/SignalingService';

// Create WebSocket signaling service
const signalingService = new WebSocketSignalingService({
    serverUrl: 'ws://your-server:8080',  // Replace with your server URL
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
});

// Create game host with WebSocket signaling
const gameHost = new GameHost({
    roomId: 'GAME123',
    roomName: 'My Game Room',
    gameConfig: {
        gameType: 'tic-tac-toe',
        maxPlayers: 4,
        initialState: { /* your game state */ },
        rules: { /* your game rules */ }
    }
}, signalingService);

// Start the game
gameHost.start();
```

### Client-Side Usage

```typescript
import { GameClient } from 'gamework';
import { WebSocketSignalingService } from 'gamework/src/networking/SignalingService';

// Create WebSocket signaling service for client
const signalingService = new WebSocketSignalingService({
    serverUrl: 'ws://your-server:8080'  // Replace with your server URL
});

// Create game client
const gameClient = new GameClient({
    roomId: 'GAME123',
    playerName: 'Player Name'
}, signalingService);

// Connect to game
gameClient.connect();
```

## Production Deployment

### DigitalOcean Droplet Setup

1. **Create a droplet**:
   - Choose Ubuntu 20.04+ LTS
   - Minimum 1GB RAM, 1 CPU
   - Add your SSH key

2. **Connect and run deployment**:
   ```bash
   ssh root@your-droplet-ip
   git clone https://github.com/kkawabat/gamework.git
   cd gamework/signaling-server
   ./deploy.sh
   ```

3. **Configure domain (optional)**:
   - Point your domain to the droplet IP
   - Use a reverse proxy (Nginx) for SSL/HTTPS

### Using a Reverse Proxy (Nginx)

For production with SSL, set up Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then update your GameWork configuration to use `wss://your-domain.com` instead of `ws://your-server:8080`.

## Monitoring and Maintenance

### Health Checks

The server includes built-in health checks:

```bash
# Check if server is running
docker-compose ps

# View logs
docker-compose logs -f

# Check server health
curl -I http://localhost:8080
```

### Logs

```bash
# View real-time logs
docker-compose logs -f signaling-server

# View last 100 lines
docker-compose logs --tail=100 signaling-server
```

### Updates

To update the server:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Backup and Recovery

The signaling server is stateless, so no data backup is needed. For high availability:

1. **Set up multiple instances** behind a load balancer
2. **Use Docker Swarm** or **Kubernetes** for orchestration
3. **Monitor with tools** like Prometheus and Grafana

## Testing

### Test the Server

Use the included test script:

```bash
# Test local server
node test-server.js

# Test remote server
node test-server.js --url ws://your-server:8080
```

### Manual Testing

You can also test manually using the browser console:

```javascript
const ws = new WebSocket('ws://your-server:8080');
ws.onopen = () => {
    console.log('Connected!');
    ws.send(JSON.stringify({
        type: 'join_room',
        payload: {
            roomId: 'TEST123',
            playerId: 'test-player',
            playerName: 'Test Player'
        }
    }));
};
ws.onmessage = (event) => {
    console.log('Received:', JSON.parse(event.data));
};
```

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :8080
   
   # Kill the process or change port
   ```

2. **Container won't start**:
   ```bash
   # Check logs
   docker-compose logs signaling-server
   
   # Check Docker status
   docker ps -a
   ```

3. **WebSocket connection fails**:
   - Ensure port 8080 is open in firewall
   - Check if server is running: `docker-compose ps`
   - Verify WebSocket URL format: `ws://your-server:8080`

4. **Connection drops frequently**:
   - Check network stability
   - Increase `reconnectInterval` in client config
   - Monitor server logs for errors

### Performance Tuning

For high-traffic deployments:

1. **Increase connection limits**:
   ```yaml
   services:
     signaling-server:
       deploy:
         resources:
           limits:
             memory: 512M
             cpus: '0.5'
   ```

2. **Use multiple instances** with a load balancer
3. **Monitor resource usage**: `docker stats`

## Security Considerations

- The server runs as a non-root user in the container
- No authentication is implemented (suitable for trusted environments)
- Consider using HTTPS/WSS in production with a reverse proxy
- Implement rate limiting for production use
- Monitor for abuse and implement connection limits

## Cost Estimation

### DigitalOcean Droplet Costs

- **Basic Droplet** (1GB RAM, 1 CPU): ~$6/month
- **Standard Droplet** (2GB RAM, 1 CPU): ~$12/month
- **CPU-Optimized** (2GB RAM, 2 CPU): ~$18/month

The basic droplet can handle hundreds of concurrent connections, making it very cost-effective for small to medium game sessions.

## Support

For issues or questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review the server logs: `docker-compose logs -f`
3. Test with the included test script: `node test-server.js`
4. Open an issue on the GitHub repository

## License

This signaling server is part of the GameWork framework and is licensed under the MIT License.




