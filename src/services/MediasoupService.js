process.env.DEBUG = "mediasoup*"
const mediasoup = require('mediasoup');
const config = require('../config');

class MediasoupService {
  constructor() {
    this.workers = new Map();
    this.routers = new Map();
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.nextWorkerId = 0;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    console.log(' Initializing mediasoup workers...');
    try {
      const promises = [];
      for (let i = 0; i < config.mediasoup.numWorkers; i++) {
        promises.push(this.initializeWorker(i));
      }
      await Promise.all(promises);
      this.initialized = true;
      console.log(` Created ${this.workers.size} workers`);
    } catch (error) {
      console.error(' Error initializing mediasoup:', error);
      throw error;
    }
  }

  async initializeWorker(workerId) {
    const worker = await mediasoup.createWorker(config.mediasoup.worker);
    const router = await worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs
    });

    worker.on('died', () => {
      console.error(` Mediasoup worker ${workerId} died, exiting in 2 seconds...`);
      setTimeout(() => process.exit(1), 2000);
    });

    this.workers.set(workerId, worker);
    this.routers.set(workerId, router);
    console.log(` Worker ${workerId} and router created`);
  }

  getNextWorker() {
    const workerId = this.nextWorkerId % this.workers.size;
    this.nextWorkerId++;
    return {
      workerId,
      router: this.routers.get(workerId)
    };
  }

  async createWebRtcTransport({ forceTcp, producing, consuming, sctpCapabilities, roomId }) {
    try {
      // Use specific router for room if provided, otherwise use round-robin
      let router, workerId;
      if (roomId && this.roomRouters && this.roomRouters.has(roomId)) {
        // Use existing router for this room
        const roomRouter = this.roomRouters.get(roomId);
        router = roomRouter.router;
        workerId = roomRouter.workerId;
      } else {
        // Get next worker for new room
        const { workerId: newWorkerId, router: newRouter } = this.getNextWorker();
        router = newRouter;
        workerId = newWorkerId;

        // Store room-router mapping if roomId provided
        if (roomId) {
          if (!this.roomRouters) this.roomRouters = new Map();
          this.roomRouters.set(roomId, { router, workerId });
        }
      }

      const webRtcTransportOptions = {
        iceConsentTimeout: 20,
        enableSctp: Boolean(sctpCapabilities),
        numSctpStreams: (sctpCapabilities || {}).numStreams,
        appData: { producing, consuming },
        listenIps: config.mediasoup.webRtcTransport.listenIps,
        enableUdp: config.mediasoup.webRtcTransport.enableUdp,
        enableTcp: config.mediasoup.webRtcTransport.enableTcp,
        maxIncomingBitrate: config.mediasoup.webRtcTransport.maxIncomingBitrate,
        maxOutgoingBitrate: config.mediasoup.webRtcTransport.maxOutgoingBitrate,
        initialAvailableOutgoingBitrate: config.mediasoup.webRtcTransport.initialAvailableOutgoingBitrate,
        maxSctpMessageSize: config.mediasoup.webRtcTransport.maxSctpMessageSize,
      };

      const transport = await router.createWebRtcTransport(webRtcTransportOptions);

      // Store with workerId
      this.transports.set(transport.id, { transport, workerId });

      // ... rest of the method remains same

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
        workerId: workerId,
      };
    } catch (error) {
      console.error('Error creating WebRTC transport:', error);
      throw error;
    }
  }

  async connectTransport(transportId, dtlsParameters) {
    if (!this.transports.has(transportId)) {
      throw new Error(`Transport with id ${transportId} not found`);
    }

    const transport = this.transports.get(transportId);
    await transport.connect({ dtlsParameters });
    console.log(' Transport connected:', {
      transportId: transportId,
      workerId: transport.workerId,
    });
    return true;
  }


  async monitorProducer(producer) {
    setInterval(async () => {
      try {
        const stats = await producer.getStats();
        const bytesReceived = stats.reduce((total, stat) =>
          total + (stat.bytesReceived || 0), 0);
        const packetsReceived = stats.reduce((total, stat) =>
          total + (stat.packetCount || 0), 0);

        console.log(`📈 Producer ${producer.id} Stats:`, {
          bytesReceived,
          packetsReceived,
          timestamp: Date.now(),
          bitrate: producer.score?.[0]?.bitrate || 0,
          fractionLost: stats[0]?.fractionLost || 0
        });

      } catch (error) {
        console.error(`Error monitoring producer ${producer.id}:`, error);
      }
    }, 5000); // Every 5 seconds
  }

  async createProducer(transportId, kind, rtpParameters) {
    try {
      const transportData = this.transports.get(transportId);
      if (!transportData || !transportData.transport) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      console.log('Creating producer with:', {
        transportId,
        kind,
        rtpParameters
      });

      const producer = await transportData.transport.produce({ kind, rtpParameters });
      console.log('✅ Producer Created :', {
        transportId: transportId,
        producerId: producer.id,
        workerId: transportData.workerId,
        kind: kind
      });

      this.producers.set(producer.id, {
        producer,
        workerId: transportData.workerId
      });

      producer.on('transportclose', () => {
        console.log('🔴 Producer transport closed:', {
          producerId: producer.id,
          kind: kind,
          workerId: transportData.workerId
        });
        this.producers.delete(producer.id);
      });

      producer.on('pause', () => {
        console.log('⏸️ Producer paused:', {
          producerId: producer.id,
          kind: kind,
          workerId: transportData.workerId
        });
        producer.pause();
      });

      producer.on('resume', () => {
        console.log('▶️ Producer resumed:', {
          producerId: producer.id,
          kind: kind,
          workerId: transportData.workerId
        });
        producer.resume();
      });

      // Media stream data event listener
      producer.on('trace', (trace) => {
        console.log('📊 Producer trace event:', {
          producerId: producer.id,
          kind: kind,
          direction: trace.direction,
          info: trace.info,
          timestamp: new Date().toISOString()
        });
      });

      // Monitor media stream statistics
      // const streamMonitor = setInterval(async () => {
      //   try {
      //     if (producer.closed) {
      //       clearInterval(streamMonitor);
      //       return;
      //     }

      //     const stats = await producer.getStats();
      //     console.log('📈 Media Stream Stats:', {
      //       producerId: producer.id,
      //       kind: kind,
      //       timestamp: new Date().toISOString(),
      //       stats: stats.map(stat => ({
      //         type: stat.type,
      //         ssrc: stat.ssrc,
      //         packetsReceived: stat.packetCount,
      //         bytesReceived: stat.byteCount,
      //         bitrate: stat.bitrate,
      //         jitter: stat.jitter,
      //         fractionLost: stat.fractionLost,
      //         roundTripTime: stat.roundTripTime
      //       }))
      //     });
      //   } catch (error) {
      //     console.error('❌ Error getting producer stats:', error);
      //     clearInterval(streamMonitor);
      //   }
      // }, 3000); // Every 3 seconds

      // Clean up monitor when producer closes
      producer.on('close', () => {
        // clearInterval(streamMonitor);
        console.log('🔴 Producer closed, stopping stream monitor:', {
          producerId: producer.id,
          kind: kind
        });
      });

      return producer;
    } catch (error) {
      console.error('❌ Error creating producer:', error);
      throw error;
    }
  }

  async createConsumer(transportId, producerId, rtpCapabilities) {
    try {
      const transportData = this.transports.get(transportId);
      if (!transportData) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      const producerData = this.producers.get(producerId);
      if (!producerData) {
        throw new Error(`Producer not found: ${producerId}`);
      }

      // Get the router that has this producer
      const router = this.routers.get(producerData.workerId);
      if (!router) {
        throw new Error(`Router not found for producer ${producerId}`);
      }

      console.log('🔍 Checking consumption capability:', {
        producerId,
        producerWorkerId: producerData.workerId,
        transportWorkerId: transportData.workerId,
        canConsume: router.canConsume({ producerId, rtpCapabilities })
      });

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('Cannot consume this producer - RTP capabilities mismatch');
      }

      const consumer = await transportData.transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      this.consumers.set(consumer.id, {
        consumer,
        workerId: transportData.workerId,
      });

      return {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    } catch (error) {
      console.error('Error creating consumer:', error);
      throw error;
    }
  }
  

  getRtpCapabilities() {
    return this.routers.get(0).rtpCapabilities;
  }

  async closeTransport(transportId) {
    try {
      const transport = this.transports.get(transportId);
      if (transport) {
        console.log(' Closing transport:', {
          transportId: transportId,
          workerId: transport.workerId
        });
        await transport.close();
        this.transports.delete(transportId);
        console.log(' Transport closed successfully:', {
          transportId: transportId,
          workerId: transport.workerId,
        });
      }
    } catch (error) {
      console.error(' Error closing transport:', error);
      throw error;
    }
  }

  getTransport(transportId) {
    const transportData = this.transports.get(transportId);
    return transportData ? transportData.transport : null;
  }

  getTransportStats(transportId) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }
    return transport.getStats();
  }
}
// Create and initialize single instance
const mediasoupService = new MediasoupService();

mediasoupService.initialize();

// Export initialized instance
module.exports = mediasoupService;