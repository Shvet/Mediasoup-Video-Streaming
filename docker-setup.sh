#!/bin/bash

# Function to detect the host IP address
get_host_ip() {
    # Try to get the IP address that can reach the internet
    ip=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7}' | tr -d '\n')
    
    # If the above fails, try another method
    if [ -z "$ip" ]; then
        ip=$(hostname -I | awk '{print $1}')
    fi
    
    # Last resort, try to get any non-loopback IPv4 address
    if [ -z "$ip" ]; then
        ip=$(ip -4 addr show scope global | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n 1)
    fi
    
    echo "$ip"
}

# Create .env file from template if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from .env.docker template..."
    cp .env.docker .env
    
    # Update the MEDIASOUP_ANNOUNCED_IP with the detected IP
    HOST_IP=$(get_host_ip)
    if [ ! -z "$HOST_IP" ]; then
        echo "Detected host IP: $HOST_IP"
        sed -i "s/MEDIASOUP_ANNOUNCED_IP=.*/MEDIASOUP_ANNOUNCED_IP=$HOST_IP/" .env
    else
        echo "Could not detect host IP. Please update MEDIASOUP_ANNOUNCED_IP in .env manually."
    fi
fi

# Check if SSL certificates exist
if [ ! -f cert.pem ] || [ ! -f key.pem ]; then
    echo "SSL certificates not found. Generating self-signed certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout key.pem -out cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    
    if [ $? -ne 0 ]; then
        echo "Failed to generate SSL certificates. Please check if OpenSSL is installed."
        exit 1
    fi
fi

# Build and start the Docker containers
echo "Starting Docker containers..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo "Docker containers started successfully!"
    echo "You can access the application at:"
    echo "  - HTTP: http://localhost:$(grep HTTP_PORT .env | cut -d= -f2)"
    echo "  - HTTPS: https://localhost:$(grep HTTPS_PORT .env | cut -d= -f2)"
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
else
    echo "Failed to start Docker containers. Please check the error messages above."
fi