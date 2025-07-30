// run `node index.js` in the terminal

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mediasoupService = require('./src/services/MediasoupService');
const handleConnection = require('./src/handlers/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize mediasoup
mediasoupService.initialize().then(() => {
  console.log('✅ Mediasoup initialized successfully');
}).catch(error => {
  console.error('❌ Failed to initialize mediasoup:', error);
  process.exit(1);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  handleConnection(socket, io);
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});

// Assuming you have a function to fetch rooms from your backend
async function fetchRooms() {
    // Replace with your actual API call
    return [
        { id: 1, name: 'Room 1', streamUrl: 'http://example.com/stream1' },
        { id: 2, name: 'Room 2', streamUrl: 'http://example.com/stream2' },
        { id: 3, name: 'Room 3', streamUrl: 'http://example.com/stream3' }
    ];
}

// Function to initialize the room list
async function initializeRoomList() {
    const rooms = await fetchRooms();
    const roomListElement = document.getElementById('roomList');

    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = room.name;
        li.onclick = () => viewLiveStream(room.streamUrl);
        roomListElement.appendChild(li);
    });
}

// Call the initialization function on page load
// initializeRoomList(); // This line should be removed as it's a server-side code and document is not defined here.

// Function to view live stream
function viewLiveStream(streamUrl) {
    const videoPlayer = document.getElementById('videoPlayer');
    const liveStreamElement = document.getElementById('liveStream');
    videoPlayer.src = streamUrl;
    liveStreamElement.style.display = 'block';
}
