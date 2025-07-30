const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const toggleButton = document.getElementById('toggleButton');

let localStream;
let peerConnection;

const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

async function startStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        socket.emit('join', 'room1');
        createPeerConnection();
    } catch (error) {
        console.error('Error accessing media devices.', error);
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onnegotiationneeded = async () => {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        } catch (error) {
            console.error('Error creating offer.', error);
        }
    };

    socket.on('offer', async offer => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    });

    socket.on('answer', async answer => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('ice-candidate', async candidate => {
        try{
        await peerConnection.addIceCandidate(candidate);
        }catch (error) {
            console.error('Error adding ice candidate.', error);
          }
    });

    socket.on('user-joined', () => {
        console.log('A new user has joined the stream.');
    });
}

function stopStream() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    socket.disconnect();
}

let isShowingStream = true;

function toggleStream() {
    if (isShowingStream) {
        remoteVideo.style.display = 'none';
    } else {
        remoteVideo.style.display = 'block';
    }
    isShowingStream = !isShowingStream;
}

startButton.addEventListener('click', startStream);
stopButton.addEventListener('click', stopStream);
toggleButton.addEventListener('click', toggleStream);