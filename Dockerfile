FROM node:18-alpine

WORKDIR /app

# Install build dependencies for mediasoup
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy server-side code
COPY src/ ./src/
COPY .env* ./

# Expose only the HTTP port
EXPOSE 8080

# Start the app
CMD ["node", "src/server.js"]
