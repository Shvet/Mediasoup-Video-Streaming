process.env.DEBUG = "mediasoup*"
const express = require('express');
const http = require('http');
const mediasoup = require('mediasoup');
const WebSocket = require('ws');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Multi-worker management
const numWorkers = os.cpus().length;
const workers = new Map();
const routers = new Map();
const rooms = new Map();
const broadcasters = new Map();
const consumers = new Map();
const producers = new Map();

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  }
];

async function createWorkers() {
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 10000 + (i * 100),
      rtcMaxPort: 10099 + (i * 100),
    });

    worker.on('died', () => {
      console.error(`Worker ${i} died, exiting...`);
      process.exit(1);
    });

    const router = await worker.createRouter({ mediaCodecs });
    workers.set(i, worker);
    routers.set(i, router);
  }
}

function getNextWorker() {
  const workerIds = Array.from(workers.keys());
  const leastLoadedWorkerId = workerIds.reduce((a, b) => 
    (consumers.get(a)?.size || 0) < (consumers.get(b)?.size || 0) ? a : b
  );
  return workers.get(leastLoadedWorkerId);
}

wss.on('connection', async (ws) => {
  const userId = Date.now().toString();
  let transport;

  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'startBroadcast': {
        const worker = getNextWorker();
        const router = routers.get(Array.from(workers.entries())
          .find(([_, w]) => w === worker)[0]);
        
        transport = await createWebRtcTransport(router);
        broadcasters.set(userId, { transport, router });
        
        ws.send(JSON.stringify({
          type: 'broadcastTransport',
          data: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            rtpCapabilities: router.rtpCapabilities
          }
        }));
        break;
      }

      case 'connectBroadcastTransport': {
        const { dtlsParameters } = data;
        await broadcasters.get(userId).transport.connect({ dtlsParameters });
        ws.send(JSON.stringify({ type: 'broadcastConnected' }));
        break;
      }

      case 'produce': {
        const { kind, rtpParameters } = data;
        const producer = await broadcasters.get(userId).transport.produce({ 
          kind,
          rtpParameters: {
            codecs: rtpParameters.codecs,
            headerExtensions: rtpParameters.headerExtensions,
            encodings: rtpParameters.encodings,
            rtcp: rtpParameters.rtcp
          }
        });
        
        producers.set(userId, producer);
        // Monitor producer stats
        setInterval(async () => {
            const stats = await producer.getStats();
            stats.forEach(stat => {
            if (stat.type === 'outbound-rtp') {
                console.log(`Producer Stats - Bytes sent: ${stat.bytesSent}, Packets sent: ${stat.packetsSent}`);
            }
            });
        }, 3000);

        // Monitor consumer stats for this producer
        consumers.forEach(async (consumerTransports) => {
            consumerTransports.forEach(async (transport) => {
            const stats = await transport.getStats();
            stats.forEach(stat => {
                if (stat.type === 'inbound-rtp') {
                console.log(`Consumer Stats - Bytes received: ${stat.bytesReceived}, Packets received: ${stat.packetsReceived}`);
                }
            });
            });
        });
        producer.on('transportclose', () => {
          producer.close();
          producers.delete(userId);
        });

        ws.send(JSON.stringify({
          type: 'producerId',
          data: { id: producer.id }
        }));
        break;
      }
      case 'watch': {
        const broadcaster = Array.from(broadcasters.values())[0];
        if (!broadcaster) {
          ws.send(JSON.stringify({ type: 'error', message: 'No active broadcast' }));
          return;
        }

        const router = broadcaster.router;
        transport = await createWebRtcTransport(router);
        
        if (!consumers.has(userId)) {
          consumers.set(userId, new Map());
        }
        consumers.get(userId).set(transport.id, transport);

        ws.send(JSON.stringify({
          type: 'watchTransport',
          data: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            rtpCapabilities: router.rtpCapabilities
          }
        }));
        break;
      }

      case 'connectWatchTransport': {
        const { dtlsParameters, transportId } = data;
        const transport = consumers.get(userId).get(transportId);
        await transport.connect({ dtlsParameters });
        ws.send(JSON.stringify({ type: 'watchConnected' }));
        break;
      }

      case 'consume': {
        const { transportId, rtpCapabilities } = data;
        const broadcaster = Array.from(broadcasters.values())[0];
        const transport = consumers.get(userId).get(transportId);
        const producer = Array.from(producers.values())[0];

        if (!producer) {
          ws.send(JSON.stringify({ type: 'error', message: 'No active producer' }));
          return;
        }

        const consumer = await transport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: false,
        });

        consumer.on('transportclose', () => {
          consumer.close();
        });

        ws.send(JSON.stringify({
          type: 'consuming',
          data: {
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
          }
        }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (broadcasters.has(userId)) {
        const { transport } = broadcasters.get(userId);
        transport.close();
        broadcasters.delete(userId);
        
        if (producers.has(userId)) {
          producers.get(userId).close();
          producers.delete(userId);
        }
      }
      
      if (consumers.has(userId)) {
        consumers.get(userId).forEach(transport => transport.close());
        consumers.delete(userId);
      }
  });
});

async function createWebRtcTransport(router) {
  return await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: '192.168.29.58' }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
}

async function startServer() {
  await createWorkers();
  server.listen(8080, () => {
    console.log(`Server running with ${numWorkers} workers on port 8080`);
  });
}

startServer();