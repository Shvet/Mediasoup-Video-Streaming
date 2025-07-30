#!/bin/bash

# Colors for output
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
NC="\033[0m" # No Color

echo -e "${YELLOW}MediaSoup Docker Setup Verification Script${NC}"
echo "This script will check your Docker setup and help diagnose common issues."
echo ""

# Check if Docker is installed
echo -e "${YELLOW}Checking if Docker is installed...${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker is installed.${NC}"
    docker --version
else
    echo -e "${RED}✗ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
echo -e "\n${YELLOW}Checking if Docker Compose is installed...${NC}"
if command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✓ Docker Compose is installed.${NC}"
    docker-compose --version
else
    echo -e "${RED}✗ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Check if Docker daemon is running
echo -e "\n${YELLOW}Checking if Docker daemon is running...${NC}"
if docker info &> /dev/null; then
    echo -e "${GREEN}✓ Docker daemon is running.${NC}"
else
    echo -e "${RED}✗ Docker daemon is not running. Please start Docker daemon first.${NC}"
    exit 1
fi

# Check if .env file exists
echo -e "\n${YELLOW}Checking if .env file exists...${NC}"
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists.${NC}"
else
    echo -e "${RED}✗ .env file does not exist.${NC}"
    echo -e "${YELLOW}Creating .env file from .env.docker...${NC}"
    if [ -f ".env.docker" ]; then
        cp .env.docker .env
        echo -e "${GREEN}✓ Created .env file from .env.docker.${NC}"
    else
        echo -e "${RED}✗ .env.docker file does not exist. Please create .env file manually.${NC}"
    fi
fi

# Check if SSL certificates exist
echo -e "\n${YELLOW}Checking if SSL certificates exist...${NC}"
if [ -f "cert.pem" ] && [ -f "key.pem" ]; then
    echo -e "${GREEN}✓ SSL certificates exist.${NC}"
else
    echo -e "${RED}✗ SSL certificates do not exist.${NC}"
    echo -e "${YELLOW}Generating self-signed SSL certificates...${NC}"
    openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Generated self-signed SSL certificates.${NC}"
    else
        echo -e "${RED}✗ Failed to generate SSL certificates. Please install OpenSSL and try again.${NC}"
    fi
fi

# Check if required ports are available
echo -e "\n${YELLOW}Checking if required ports are available...${NC}"
HTTP_PORT=$(grep HTTP_PORT .env | cut -d= -f2 || echo "8080")
HTTPS_PORT=$(grep HTTPS_PORT .env | cut -d= -f2 || echo "8443")

check_port() {
    local port=$1
    if command -v nc &> /dev/null; then
        nc -z localhost $port &> /dev/null
        if [ $? -eq 0 ]; then
            echo -e "${RED}✗ Port $port is already in use.${NC}"
            return 1
        else
            echo -e "${GREEN}✓ Port $port is available.${NC}"
            return 0
        fi
    else
        echo -e "${YELLOW}? Cannot check if port $port is available. 'nc' command not found.${NC}"
        return 0
    fi
}

check_port $HTTP_PORT
check_port $HTTPS_PORT

# Check if MEDIASOUP_ANNOUNCED_IP is set correctly
echo -e "\n${YELLOW}Checking if MEDIASOUP_ANNOUNCED_IP is set correctly...${NC}"
ANNOUNCED_IP=$(grep MEDIASOUP_ANNOUNCED_IP .env | cut -d= -f2)
if [ -z "$ANNOUNCED_IP" ] || [ "$ANNOUNCED_IP" = "192.168.1.100" ]; then
    echo -e "${RED}✗ MEDIASOUP_ANNOUNCED_IP is not set correctly.${NC}"
    echo -e "${YELLOW}Detecting host IP address...${NC}"
    
    # Try to get the IP address that can reach the internet
    HOST_IP=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7}' | tr -d '\n')
    
    # If the above fails, try another method
    if [ -z "$HOST_IP" ]; then
        HOST_IP=$(hostname -I | awk '{print $1}')
    fi
    
    # Last resort, try to get any non-loopback IPv4 address
    if [ -z "$HOST_IP" ]; then
        HOST_IP=$(ip -4 addr show scope global | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n 1)
    fi
    
    if [ -n "$HOST_IP" ]; then
        echo -e "${GREEN}✓ Detected host IP address: $HOST_IP${NC}"
        echo -e "${YELLOW}Updating MEDIASOUP_ANNOUNCED_IP in .env file...${NC}"
        sed -i "s/MEDIASOUP_ANNOUNCED_IP=.*/MEDIASOUP_ANNOUNCED_IP=$HOST_IP/" .env
        echo -e "${GREEN}✓ Updated MEDIASOUP_ANNOUNCED_IP in .env file.${NC}"
    else
        echo -e "${RED}✗ Failed to detect host IP address. Please set MEDIASOUP_ANNOUNCED_IP manually in .env file.${NC}"
    fi
else
    echo -e "${GREEN}✓ MEDIASOUP_ANNOUNCED_IP is set to $ANNOUNCED_IP.${NC}"
fi

# Check Docker build prerequisites
echo -e "\n${YELLOW}Checking Docker build prerequisites...${NC}"
if grep -q "py3-pip" Dockerfile; then
    echo -e "${GREEN}✓ Dockerfile includes py3-pip for mediasoup build.${NC}"
else
    echo -e "${RED}✗ Dockerfile does not include py3-pip. This may cause mediasoup build to fail.${NC}"
    echo -e "${YELLOW}Please update your Dockerfile to include py3-pip:${NC}"
    echo -e "${YELLOW}RUN apk add --no-cache python3 py3-pip make g++ linux-headers${NC}"
fi

echo -e "\n${GREEN}Verification complete!${NC}"
echo -e "You can now build and start the Docker containers with:"
echo -e "${YELLOW}npm run docker:build${NC}"
echo -e "${YELLOW}npm run docker:start${NC}"
echo -e "\nIf you encounter any issues, please refer to DOCKER-TROUBLESHOOTING.md"