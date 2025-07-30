const mediasoupService = require('../services/MediasoupService');
const roomService = require('../services/RoomService');

const handleConnection = (socket, io) => {
  console.log('🔌 New client connected:', {
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  socket.on('create-room', async ({ forceTcp,
    producing,
    consuming,
    sctpCapabilities }, callback) => {
    console.log('📝 Creating room request from:', socket.id);
    // const {
    //   forceTcp,
    //   producing,
    //   consuming,
    //   sctpCapabilities
    // } = request;

    try {
      const result = await roomService.createRoom({
        forceTcp,
        producing,
        consuming,
        sctpCapabilities,
      });
      console.log('✅ Room created successfully:', {
        roomId: result.roomId,
        transportId: result.producerTransport.id,
      });

      callback({
        roomId: result.roomId,
        rtpCapabilities: mediasoupService.getRtpCapabilities(),
        producerTransportOptions: {
          id: result.producerTransport.id,
          iceParameters: result.producerTransport.iceParameters,
          iceCandidates: result.producerTransport.iceCandidates,
          dtlsParameters: result.producerTransport.dtlsParameters,
        }
      });
    } catch (error) {
      console.error('❌ Error creating room:', {
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  socket.on('join-room', async ({ roomId, forceTcp, producing, consuming }, callback) => {
    try {
      const room = roomService.getRoom(roomId);
      if (!room) {
        callback({ error: 'Room not found' });
        return;
      }

      socket.roomId = roomId;
      socket.join(roomId);

      // Create consumer transport on SAME router as producer
      const consumerTransport = await mediasoupService.createWebRtcTransport({
        consuming: consuming,
        forceTcp: forceTcp,
        producing: producing,
        roomId: roomId // Pass roomId to use same router
      });

      room.consumers.set(socket.id, {
        transportId: consumerTransport.id,
        socketId: socket.id,
        consumerId: null,
        workerId: consumerTransport.workerId
      });

      let producers = [];
      if (room.producerIds && room.producerIds.length > 0) {
        room.producerIds.forEach((producerId, index) => {
          const producerData = mediasoupService.producers.get(producerId);
          console.log('Producer data:', producerData);
          if (producerData) {
            producers.push({
              id: producerId,
              kind: producerData.producer.kind,
              workerId: room.producerWorkerIds[index]
            });
          }
        });
      }
      callback({
        rtpCapabilities: mediasoupService.getRtpCapabilities(),
        consumerTransportOptions: {
          id: consumerTransport.id,
          iceParameters: consumerTransport.iceParameters,
          iceCandidates: consumerTransport.iceCandidates,
          dtlsParameters: consumerTransport.dtlsParameters,
        },
        producers: producers
      });

      if (room.producerId) {
        socket.emit('new-producer', {
          producerId: room.producerId,
          workerId: room.producerWorkerId
        });
      }
    } catch (error) {
      console.error('❌ Error joining room:', error);
      callback({ error: error.message });
    }
  });

  socket.on('getRouterRtpCapabilities', async ({ }, callback) => {
    callback({ rtpCapabilities: mediasoupService.routers.get(0).rtpCapabilities });
  });

  socket.on('connect-transport', async ({ transportId, dtlsParameters, sdp }, callback) => {
    console.log('🔗 Connecting transport:', {
      socketId: socket.id,
      transportId: transportId
    });

    try {
      const transport = roomService.findTransport(transportId);
      if (!transport) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      console.log('Connecting transport:', {
        transportId: transportId,
        sdp: sdp
      });

      await transport.connect({
        dtlsParameters,
        sdp  // Include the SDP in transport connection
      });

      console.log('✅ Transport connected:', {
        socketId: socket.id,
        transportId: transportId
      });

      callback({
        success: true,
        transportId: transport.id,
        sdp: transport.sdp  // Send back the negotiated SDP
      });
    } catch (error) {
      console.error('❌ Error connecting transport:', {
        socketId: socket.id,
        transportId: transportId,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  socket.on('producedata', async ({ transportId, sctpStreamParameters, label, protocol, appData }, callback) => {
    console.log('Producing data:', {
      socketId: socket.id,
      transportId: transportId,
      data: data
    });
    const transport = roomService.findTransport(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }
    const produceData = await transport.produceData({
      sctpStreamParameters,
      label,
      protocol,
      appData
    });
    // roomService.addProducerData(transportId, produceData);
    callback({
      success: true,
      id: produceData.id,
    });
  });

  socket.on('connect-consumer-transport', async ({ transportId, dtlsParameters }, callback) => {
    console.log('🔗 Connecting consumer transport:', {
      socketId: socket.id,
      transportId: transportId
    });

    try {
      const transport = roomService.findTransport(transportId);
      if (!transport) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      await transport.connect({ dtlsParameters });
      console.log('✅ Consumer transport connected:', {
        socketId: socket.id,
        transportId: transportId
      });

      callback({ success: true });
    } catch (error) {
      console.error('❌ Error connecting consumer transport:', {
        socketId: socket.id,
        transportId: transportId,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  socket.on('connect-producer-transport', async ({ transportId, dtlsParameters, sdp }, callback) => {
    console.log('🔗 Connecting producer transport:', {
      socketId: socket.id,
      transportId: transportId,
      sdp,
      dtlsParameters,
    });

    try {
      const transport = roomService.findTransport(transportId);
      if (!transport) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      await transport.connect({ dtlsParameters });
      console.log('✅ Producer transport connected:', {
        socketId: socket.id,
        transportId: transportId
      });

      callback({ success: true });
    } catch (error) {
      console.error('❌ Error connecting producer transport:', {
        socketId: socket.id,
        transportId: transportId,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  socket.on('produce', async ({ transportId, kind, rtpParameters, roomId }, callback) => {
    console.log('🎥 Starting production:', {
      socketId: socket.id,
      roomId: roomId,
      transportId: transportId,
      kind: kind
    });

    try {
      const room = roomService.getRoom(roomId);
      if (!room) {
        throw new Error(`Room not found: ${roomId}`);
      }

      const producer = await mediasoupService.createProducer(transportId, kind, rtpParameters);
      const transportData = mediasoupService.transports.get(transportId);
      await roomService.addProducer(roomId, producer.id, transportData.workerId);

      console.log('✅ Producer created successfully:', {
        roomId: roomId,
        producerId: producer.id,
        kind: kind
      });

      // Notify all consumers in the room
      socket.to(roomId).emit('new-producer', {
        producerId: producer.id,
        kind: kind,
        workerId: transportData.workerId,
        roomId: roomId,
      });

      callback({ id: producer.id });
    } catch (error) {
      console.error('❌ Error in produce:', {
        socketId: socket.id,
        roomId: roomId,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  socket.on('consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
    const targetRoomId = roomId || socket.roomId;

    try {
      if (!targetRoomId) {
        throw new Error('Room ID not provided and not found in socket');
      }

      const room = roomService.getRoom(targetRoomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Create consumer
      const consumerData = await mediasoupService.createConsumer(
        room.consumers.get(socket.id).transportId,
        producerId,
        rtpCapabilities
      );

      const consumerInfo = room.consumers.get(socket.id);

      // Initialize consumers Map if it doesn't exist
      if (!consumerInfo.consumers) {
        consumerInfo.consumers = new Map();
      }

      // Get the actual consumer object from mediasoupService
      const actualConsumerData = mediasoupService.consumers.get(consumerData.id);

      // Store the actual consumer object
      consumerInfo.consumers.set(consumerData.id, {
        consumerId: consumerData.id,
        consumer: actualConsumerData.consumer, // This is the actual MediaSoup consumer
        producerId: producerId
      });

      console.log('✅ Consumer created and stored:', {
        roomId: targetRoomId,
        consumerId: consumerData.id,
        producerId: consumerData.producerId,
        transportId: consumerInfo.transportId,
        totalConsumers: consumerInfo.consumers.size,
        hasResumeMethod: typeof actualConsumerData.consumer.resume === 'function'
      });

      callback({
        id: consumerData.id,
        producerId: consumerData.producerId,
        kind: consumerData.kind,
        rtpParameters: consumerData.rtpParameters
      });
    } catch (error) {
      console.error('❌ Error consuming:', error);
      callback({ error: error.message });
    }
  });

  socket.on('resume-consumer', async ({ consumerId, roomId }, callback) => {
    try {
      const targetRoomId = roomId || socket.roomId;
      const room = roomService.getRoom(targetRoomId);
      const consumerInfo = room.consumers.get(socket.id);

      // Find the specific consumer
      const consumerData = consumerInfo.consumers.get(consumerId);
      if (!consumerData) {
        throw new Error(`Consumer ${consumerId} not found`);
      }

      console.log('🔄 Resuming consumer:', {
        consumerId,
        hasResumeMethod: typeof consumerData.consumer.resume === 'function'
      });

      await consumerData.consumer.resume();
      console.log('✅ Consumer resumed:', consumerId);

      callback({ success: true });
    } catch (error) {
      console.error('❌ Error resuming consumer:', error);
      callback({ error: error.message });
    }
  });

  socket.on('consumer-resume', async ({ consumerId, sdp }, callback) => {
    console.log('▶️ Resume consumer request:', {
      socketId: socket.id,
      consumerId: consumerId,
      sdp: sdp
    });

    try {
      const room = roomService.getRoom(socket.roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const consumer = room.consumers.get(socket.id);
      if (!consumer || consumer.consumerId !== consumerId) {
        throw new Error('Consumer not found');
      }

      // Create answer for the consumer
      const answer = {
        type: 'answer',
        sdp: modifySdpForBetterPerformance(consumer.consumer.rtpParameters),
        timestamp: Date.now()
      };

      // Return the original SDP without modification
      callback({
        sdp: answer.sdp,
        resumed: true,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Error in consumer-resume:', {
        socketId: socket.id,
        consumerId: consumerId,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  function modifySdpForBetterPerformance(rtpParameters) {
    const sdp = `v=0\r\n` +
      `o=- ${Date.now()} 2 IN IP4 127.0.0.1\r\n` +
      `s=-\r\n` +
      `t=0 0\r\n` +
      `a=group:BUNDLE 0 1\r\n` +
      `a=extmap-allow-mixed\r\n` +
      `a=msid-semantic: WMS\r\n` +
      `m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 35 36 37 38 39 40 41 42 127 103 104 105 106 107 108 45\r\n` +
      `c=IN IP4 0.0.0.0\r\n` +
      `a=rtcp:9 IN IP4 0.0.0.0\r\n` +
      `a=ice-ufrag:${Math.random().toString(36).substr(2, 4)}\r\n` +
      `a=ice-pwd:${Math.random().toString(36).substr(2, 24)}\r\n` +
      `a=ice-options:trickle renomination\r\n` +
      `a=fingerprint:sha-256 ${rtpParameters.dtlsParameters?.fingerprints[0]?.value || ''}\r\n` +
      `a=setup:active\r\n` +
      `a=mid:0\r\n` +
      `a=extmap:1 urn:ietf:params:rtp-hdrext:toffset\r\n` +
      `a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n` +
      `a=extmap:3 urn:3gpp:video-orientation\r\n` +
      `a=extmap:4 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n` +
      `a=extmap:5 http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\r\n` +
      `a=extmap:6 http://www.webrtc.org/experiments/rtp-hdrext/video-content-type\r\n` +
      `a=extmap:7 http://www.webrtc.org/experiments/rtp-hdrext/video-timing\r\n` +
      `a=extmap:8 http://www.webrtc.org/experiments/rtp-hdrext/color-space\r\n` +
      `a=extmap:9 urn:ietf:params:rtp-hdrext:sdes:mid\r\n` +
      `a=extmap:10 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r\n` +
      `a=extmap:11 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r\n` +
      `a=recvonly\r\n` +
      `a=rtcp-mux\r\n` +
      `a=rtcp-rsize\r\n` +
      `a=rtpmap:96 VP8/90000\r\n` +
      `a=rtcp-fb:96 goog-remb\r\n` +
      `a=rtcp-fb:96 transport-cc\r\n` +
      `a=rtcp-fb:96 ccm fir\r\n` +
      `a=rtcp-fb:96 nack\r\n` +
      `a=rtcp-fb:96 nack pli\r\n` +
      `a=rtpmap:97 rtx/90000\r\n` +
      `a=fmtp:97 apt=96\r\n` +
      `a=rtpmap:98 VP9/90000\r\n` +
      `a=rtcp-fb:98 goog-remb\r\n` +
      `a=rtcp-fb:98 transport-cc\r\n` +
      `a=rtcp-fb:98 ccm fir\r\n` +
      `a=rtcp-fb:98 nack\r\n` +
      `a=rtcp-fb:98 nack pli\r\n` +
      `a=fmtp:98 profile-id=0\r\n` +
      `a=rtpmap:99 rtx/90000\r\n` +
      `a=fmtp:99 apt=98\r\n` +
      // Add audio section
      `m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 102 0 8 13 110 126\r\n` +
      `c=IN IP4 0.0.0.0\r\n` +
      `a=rtcp:9 IN IP4 0.0.0.0\r\n` +
      `a=ice-ufrag:${Math.random().toString(36).substr(2, 4)}\r\n` +
      `a=ice-pwd:${Math.random().toString(36).substr(2, 24)}\r\n` +
      `a=ice-options:trickle renomination\r\n` +
      `a=fingerprint:sha-256 ${rtpParameters.dtlsParameters?.fingerprints[0]?.value || ''}\r\n` +
      `a=setup:active\r\n` +
      `a=mid:1\r\n` +
      `a=extmap:14 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n` +
      `a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n` +
      `a=extmap:4 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n` +
      `a=extmap:9 urn:ietf:params:rtp-hdrext:sdes:mid\r\n` +
      `a=recvonly\r\n` +
      `a=rtcp-mux\r\n` +
      `a=rtpmap:111 opus/48000/2\r\n` +
      `a=rtcp-fb:111 transport-cc\r\n` +
      `a=fmtp:111 minptime=10;useinbandfec=1\r\n` +
      `a=rtpmap:63 red/48000/2\r\n` +
      `a=fmtp:63 111/111\r\n`;

    return sdp;
  }
  socket.on('stop-stream', async ({ roomId }, callback) => {
    console.log('🛑 Stop stream request:', {
      socketId: socket.id,
      roomId: roomId
    });

    try {
      await roomService.closeRoom(roomId);
      io.to(roomId).emit('stream-ended');
      console.log('✅ Stream stopped:', {
        roomId: roomId
      });

      callback({ success: true });
    } catch (error) {
      console.error('❌ Error stopping stream:', {
        socketId: socket.id,
        roomId: roomId,
        error: error.message,
        stack: error.stack
      });
      callback({ error: error.message });
    }
  });

  socket.on('disconnect', async () => {
    console.log('🔌 Client disconnected:', {
      socketId: socket.id,
      roomId: socket.roomId
    });

    try {
      // Clean up consumers when socket disconnects
      for (const [roomId, room] of roomService.rooms) {
        if (room.consumers.has(socket.id)) {
          await roomService.removeConsumer(roomId, socket.id);
          console.log('🧹 Cleaned up consumer:', {
            socketId: socket.id,
            roomId: roomId
          });
        }
      }
    } catch (error) {
      console.error('❌ Error during disconnect cleanup:', {
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
    }
  });
};

module.exports = handleConnection;