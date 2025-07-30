#!/bin/bash

# Create the Nginx SSL directory if it doesn't exist
if [ ! -d "nginx/ssl" ]; then
    mkdir -p nginx/ssl
    echo "Created nginx/ssl directory"
fi

# Copy the SSL certificates to the Nginx SSL directory
cp cert.pem nginx/ssl/
cp key.pem nginx/ssl/

echo "SSL certificates copied to nginx/ssl/ directory."
echo "You can now run 'docker-compose -f docker-compose.prod.yml up -d' to start the production setup."