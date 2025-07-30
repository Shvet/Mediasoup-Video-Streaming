const roomListElement = document.getElementById('roomList');
const liveStreamElement = document.getElementById('liveStream');
const videoPlayer = document.getElementById('videoPlayer');

// Sample data for rooms (replace this with actual data fetching logic)
const rooms = [
    { id: 1, name: 'Room 1', streamUrl: 'http://example.com/stream1' },
    { id: 2, name: 'Room 2', streamUrl: 'http://example.com/stream2' },
    { id: 3, name: 'Room 3', streamUrl: 'http://example.com/stream3' }
];

// Function to display rooms
function displayRooms() {
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = room.name;
        li.onclick = () => viewLiveStream(room.streamUrl);
        roomListElement.appendChild(li);
    });
}

// Function to view live stream
function viewLiveStream(streamUrl) {
    videoPlayer.src = streamUrl;
    liveStreamElement.style.display = 'block';
}

// Initialize the room list
displayRooms();
