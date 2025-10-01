#!/bin/bash

# GameWork Signaling Server Deployment Script
# This script deploys the signaling server to a Docker container

set -e

print_status() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

print_status "Starting GameWork Signaling Server deployment..."

# Navigate to the server directory
cd /opt/gamework/server

print_status "Installing dependencies..."
npm ci --production

print_status "Building server..."
npm run build

print_status "Stopping existing container (if running)..."
docker stop gamework-signalling-server 2>/dev/null || true
docker rm gamework-signalling-server 2>/dev/null || true

print_status "Building Docker image..."
docker build -t gamework-signalling-server .

print_status "Starting new container..."
docker run -d \
  --name gamework-signalling-server \
  --network app_network \
  --restart unless-stopped \
  -p 8080:8080 \
  gamework-signalling-server

print_status "Waiting for container to start..."
sleep 5

print_status "Checking container status..."
if docker ps | grep -q gamework-signalling-server; then
    print_status "✅ Container started successfully!"
    print_status "Container name: gamework-signalling-server"
    print_status "Network: app_network"
    print_status "Port: 8080"
    print_status "Ready for Caddy reverse proxy configuration!"
else
    print_error "❌ Container failed to start!"
    print_error "Container logs:"
    docker logs gamework-signalling-server
    exit 1
fi

print_status "✅ Deployment completed successfully!"
