# GameWork Signaling Server

A WebSocket-based signaling server for the GameWork framework that facilitates peer-to-peer WebRTC connections for multiplayer board games.

## Features

- 🚀 **WebSocket-based**: Real-time communication for WebRTC signaling
- 🏠 **Room Management**: Automatic room creation and player management
- 🔄 **Message Routing**: Efficient message delivery between peers
- 🐳 **Docker Ready**: Easy deployment with Docker and Docker Compose
- 🛡️ **Production Ready**: Health checks, graceful shutdown, and error handling
- 📊 **Room Cleanup**: Automatic cleanup of old rooms and messages

## Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd gamework/signaling-server
   ```

2. **Start the server**:
   ```bash
   docker-compose up -d
   ```

3. **Check status**:
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

The server will be available at `ws://your-server:8080`

### Manual Docker Build

1. **Build the image**:
   ```bash
   docker build -t gamework-signaling-server .
   ```

2. **Run the container**:
   ```bash
   docker run -d -p 8080:8080 --name signaling-server gamework-signaling-server
   ```

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   npm start
   ```

## API Reference

### WebSocket Connection

Connect to the signaling server using WebSocket:

```javascript
const ws = new WebSocket('ws://your-server:8080');
```

### Message Types

#### Client Messages (to server)

**Join Room**
```json
{
  "type": "join_room",
  "payload": {
    "roomId": "ABC123",
    "playerId": "player-uuid",
    "playerName": "Player Name"
  }
}
```

**Leave Room**
```json
{
  "type": "leave_room",
  "payload": {}
}
```

**Signaling Message**
```json
{
  "type": "signaling_message",
  "payload": {
    "type": "offer|answer|ice_candidate",
    "payload": { /* WebRTC data */ },
    "to": "target-player-id" // optional, broadcasts to room if not specified
  }
}
```

**Ping**
```json
{
  "type": "ping",
  "payload": {}
}
```

#### Server Messages (from server)

**Room Joined**
```json
{
  "type": "room_joined",
  "payload": {
    "room": { /* room info */ },
    "playerId": "player-uuid",
    "playerName": "Player Name"
  },
  "roomId": "ABC123"
}
```

**Room Update**
```json
{
  "type": "room_update",
  "payload": {
    "room": { /* updated room info */ }
  },
  "roomId": "ABC123"
}
```

**Signaling Message**
```json
{
  "type": "signaling_message",
  "payload": {
    "type": "offer|answer|ice_candidate",
    "payload": { /* WebRTC data */ },
    "from": "sender-player-id",
    "to": "target-player-id",
    "roomId": "ABC123"
  },
  "roomId": "ABC123"
}
```

**Error**
```json
{
  "type": "error",
  "payload": {
    "message": "Error description"
  }
}
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 8080)
- `NODE_ENV`: Environment (development/production)

### Docker Compose Configuration

You can customize the deployment by modifying `docker-compose.yml`:

```yaml
services:
  signaling-server:
    ports:
      - "8080:8080"  # Change port mapping
    environment:
      - PORT=8080    # Change server port
```

## Deployment on DigitalOcean Droplet

### Prerequisites

- Ubuntu 20.04+ droplet
- Docker and Docker Compose installed
- Firewall configured to allow port 8080

### Step-by-Step Deployment

1. **Connect to your droplet**:
   ```bash
   ssh root@your-droplet-ip
   ```

2. **Install Docker and Docker Compose**:
   ```bash
   # Update system
   apt update && apt upgrade -y
   
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Install Docker Compose
   curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   chmod +x /usr/local/bin/docker-compose
   ```

3. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd gamework/signaling-server
   ```

4. **Start the server**:
   ```bash
   docker-compose up -d
   ```

5. **Configure firewall** (if needed):
   ```bash
   ufw allow 8080
   ```

6. **Verify deployment**:
   ```bash
   docker-compose ps
   curl -I http://localhost:8080
   ```

### Using a Reverse Proxy (Optional)

For production deployments, consider using Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
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

## Monitoring and Maintenance

### Health Checks

The server includes built-in health checks:

```bash
# Check container health
docker-compose ps

# View logs
docker-compose logs -f

# Restart if needed
docker-compose restart
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

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :8080
   
   # Kill the process or change port in docker-compose.yml
   ```

2. **Container won't start**:
   ```bash
   # Check logs
   docker-compose logs signaling-server
   
   # Check if port is available
   docker-compose ps
   ```

3. **WebSocket connection fails**:
   - Ensure port 8080 is open in firewall
   - Check if server is running: `docker-compose ps`
   - Verify WebSocket URL format: `ws://your-server:8080`

### Performance Tuning

For high-traffic deployments:

1. **Increase connection limits** in Docker Compose
2. **Use a load balancer** for multiple instances
3. **Monitor resource usage**: `docker stats`

## Security Considerations

- The server runs as a non-root user in the container
- No authentication is implemented (suitable for trusted environments)
- Consider using HTTPS/WSS in production with a reverse proxy
- Implement rate limiting for production use
- Monitor for abuse and implement connection limits

## License

MIT License - see the main GameWork repository for details.




