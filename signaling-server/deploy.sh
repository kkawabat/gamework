#!/bin/bash

# GameWork Signaling Server Deployment Script
# This script automates the deployment process on a DigitalOcean droplet

set -e

echo "🚀 GameWork Signaling Server Deployment Script"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_warning "Running as root. Consider using a non-root user for production."
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    
    # Add current user to docker group
    if [[ $EUID -ne 0 ]]; then
        sudo usermod -aG docker $USER
        print_warning "Added user to docker group. You may need to log out and back in."
    fi
else
    print_status "Docker is already installed"
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_status "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    print_status "Docker Compose is already installed"
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
    print_status "Installing git..."
    sudo apt update
    sudo apt install -y git
else
    print_status "Git is already installed"
fi

# Clone repository if not already present
if [ ! -d "gamework" ]; then
    print_status "Cloning GameWork repository..."
    git clone https://github.com/kkawabat/gamework.git
else
    print_status "Repository already exists, updating..."
    cd gamework
    git pull
    cd ..
fi

# Navigate to signaling server directory
cd gamework/signaling-server

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Are you in the correct directory?"
    exit 1
fi

# Stop any existing containers
print_status "Stopping any existing containers..."
docker-compose down 2>/dev/null || true

# Build and start the containers
print_status "Building and starting the signaling server..."
docker-compose up -d --build

# Wait for the container to be ready
print_status "Waiting for server to be ready..."
sleep 10

# Check if the container is running
if docker-compose ps | grep -q "Up"; then
    print_status "✅ Signaling server is running successfully!"
    
    # Get the server URL
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "localhost")
    print_status "🌐 Server is available at: ws://${SERVER_IP}:8080"
    
    # Show container status
    echo ""
    print_status "Container status:"
    docker-compose ps
    
    # Show logs
    echo ""
    print_status "Recent logs:"
    docker-compose logs --tail=20
    
else
    print_error "❌ Failed to start the signaling server"
    print_status "Checking logs for errors:"
    docker-compose logs
    exit 1
fi

# Configure firewall if ufw is available
if command -v ufw &> /dev/null; then
    print_status "Configuring firewall..."
    sudo ufw allow 8080/tcp
    print_status "Firewall rule added for port 8080"
fi

echo ""
print_status "🎉 Deployment completed successfully!"
echo ""
print_status "Useful commands:"
echo "  View logs:     docker-compose logs -f"
echo "  Stop server:   docker-compose down"
echo "  Restart:       docker-compose restart"
echo "  Update:        git pull && docker-compose up -d --build"
echo ""
print_status "Server URL: ws://${SERVER_IP}:8080"




