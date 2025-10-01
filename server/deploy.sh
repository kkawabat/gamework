#!/bin/bash

# GameWork Signaling Server Deployment Script
# This script deploys the signaling server to a Docker container

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "Starting GameWork Signaling Server deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if the app_network exists (required for reverse proxy integration)
if ! docker network ls | grep -q "app_network"; then
    print_error "app_network does not exist. Please ensure your reverse proxy is running."
    exit 1
fi

# Navigate to the project root (parent of server)
cd /opt/gamework

print_status "Installing server dependencies..."
cd server
npm ci

print_status "Building server..."
npm run build

print_status "Installing production dependencies..."
npm ci --production

print_status "Stopping existing containers..."
cd ..
docker-compose -f server/docker-compose.yml down --remove-orphans 2>/dev/null || true

# Force remove the container if it exists
docker rm -f gamework-signalling-server 2>/dev/null || true

print_status "Building and starting the signaling server..."
docker-compose -f server/docker-compose.yml up -d --build

print_status "Waiting for server to be ready..."
sleep 10

# Check if the container is running
if docker-compose -f server/docker-compose.yml ps | grep -q "Up"; then
    print_status "✅ Signaling server is running successfully!"
    
    # Get the server URL
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "localhost")
    print_status "🌐 Server is available at: ws://${SERVER_IP}:8080"
    
    # Show container status
    echo ""
    print_status "Container status:"
    docker-compose -f server/docker-compose.yml ps
    
    # Show logs
    echo ""
    print_status "Recent logs:"
    docker-compose -f server/docker-compose.yml logs --tail=20
    
else
    print_error "❌ Failed to start the signaling server"
    print_status "Checking logs for errors:"
    docker-compose -f server/docker-compose.yml logs
    exit 1
fi

print_status "🎉 Deployment completed successfully!"
print_status "Useful commands:"
echo "  View logs:     docker-compose -f server/docker-compose.yml logs -f"
echo "  Stop server:   docker-compose -f server/docker-compose.yml down"
echo "  Restart:       docker-compose -f server/docker-compose.yml restart"
echo "  Update:        git pull && ./server/deploy.sh"
