FROM node:18-alpine

WORKDIR /app

# Install dependencies for mediasoup
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=dev

# Copy server-side code only
COPY src/ ./src/
COPY cert.pem key.pem .env* ./

# Expose ports
EXPOSE 8080 8443 10000-10100/udp

# Start the application
CMD ["node", "src/server.js"]