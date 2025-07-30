require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const mediasoupService = require('./services/MediasoupService');
const handleConnection = require('./handlers/socketHandlers');

// Import the test-watch file to demonstrate nodemon's file watching capability
const testWatch = require('./test-watch');
console.log('Server started with test-watch module:', testWatch.testFunction());

// SSL Certificate options
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, '../key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../cert.pem'))
};

const app = express();

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, 'client')));

// Redirect HTTP to HTTPS
app.use((req, res, next) => {
  if (!req.secure) {
    // Check if the request is not secure (HTTP)
    const httpsUrl = `https://${req.headers.host.split(':')[0]}:${process.env.HTTPS_PORT || 8443}${req.url}`;
    return res.redirect(httpsUrl);
  }
  next();
});

// Create both HTTP and HTTPS servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(sslOptions, app);

// Socket.io can attach to the HTTPS server
const io = new Server(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

async function startServer() {
  try {
    await mediasoupService.initialize();
    
    io.on('connection', (socket) => {
      console.log('a user connected');
      handleConnection(socket, io);
    });

    const httpPort = process.env.HTTP_PORT || 8080;
    const httpsPort = process.env.HTTPS_PORT || 8443;
    
    // Start HTTP server
    httpServer.listen(httpPort, '0.0.0.0', () => {
      console.log(`HTTP Server is running on port ${httpPort}`);
    });
    
    // Start HTTPS server
    httpsServer.listen(httpsPort, '0.0.0.0', () => {
      console.log(`HTTPS Server is running on port ${httpsPort}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();