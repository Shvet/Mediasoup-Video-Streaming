const { v4: uuidv4 } = require('uuid');
const mediasoupService = require('./MediasoupService');

class RoomService {
  constructor() {
    this.rooms = new Map();
  }

  async createRoom({ forceTcp, producing, consuming, sctpCapabilities }) {
    try {
      const roomId = uuidv4();
      const producerTransport = await mediasoupService.createWebRtcTransport({
        forceTcp,
        producing,
        consuming,
        sctpCapabilities,
        roomId // Pass roomId to ensure same router
      });

      const room = {
        id: roomId,
        producerTransportId: producerTransport.id,
        producerTransport: producerTransport,
        producerId: null,
        consumers: new Map(),
        createdAt: Date.now(),
        active: true,
        workerId: producerTransport.workerId,
      };

      this.rooms.set(roomId, room);
      return { roomId, producerTransport };
    } catch (error) {
      console.error('Error creating room:', error);
      throw new Error('Failed to create room');
    }
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    return room;
  }

  async addProducer(roomId, producerId, workerId) {
    const room = this.getRoom(roomId);

    // Initialize arrays if they don't exist
    if (!room.producerIds) {
      room.producerIds = [];
    }
    if (!room.producerWorkerIds) {
      room.producerWorkerIds = [];
    }

    // Add the new producer
    room.producerIds.push(producerId);
    room.producerWorkerIds.push(workerId);

    return room;
  }

  async createConsumer(roomId, socketId, rtpCapabilities) {
    try {
      const room = this.getRoom(roomId);
      if (!room.producerId) {
        throw new Error('No producer found in this room');
      }

      // Create consumer transport on SAME router as producer
      const consumerTransport = await mediasoupService.createWebRtcTransport({
        consuming: true,
        roomId // Pass roomId to use same router
      });

      const consumerData = await mediasoupService.createConsumer(
        consumerTransport.id,
        room.producerId,
        rtpCapabilities
      );

      room.consumers.set(socketId, {
        transportId: consumerTransport.id,
        consumerId: consumerData.id,
        socketId
      });

      return { consumerTransport, consumerData };
    } catch (error) {
      console.error('Error creating consumer:', error);
      throw error;
    }
  }
  async removeConsumer(roomId, socketId) {
    try {
      const room = this.getRoom(roomId);
      const consumerData = room.consumers.get(socketId);

      if (consumerData) {
        // Close the transport (this will also close the consumer)
        await mediasoupService.closeTransport(consumerData.transportId);
        room.consumers.delete(socketId);
      }
    } catch (error) {
      console.error('Error removing consumer:', error);
      throw error;
    }
  }

  async closeRoom(roomId) {
    try {
      const room = this.getRoom(roomId);

      // Close producer transport
      if (room.producerTransportId) {
        await mediasoupService.closeTransport(room.producerTransportId);
      }

      // Close all consumer transports
      for (const consumer of room.consumers.values()) {
        await mediasoupService.closeTransport(consumer.transportId);
      }

      this.rooms.delete(roomId);
    } catch (error) {
      console.error('Error closing room:', error);
      throw error;
    }
  }

  async connectTransport(transportId, dtlsParameters) {
    try {
      await mediasoupService.connectTransport(transportId, dtlsParameters);
    } catch (error) {
      console.error('Error connecting transport:', error);
      throw error;
    }
  }

  getRoomStats(roomId) {
    const room = this.getRoom(roomId);
    return {
      id: room.id,
      producerTransportId: room.producerTransportId,
      producerId: room.producerId,
      numConsumers: room.consumers.size,
      createdAt: room.createdAt,
      active: room.active
    };
  }

  getAllRooms() {
    return Array.from(this.rooms.values()).map(room => this.getRoomStats(room.id));
  }

  // Cleanup inactive rooms (can be called periodically)
  async cleanupInactiveRooms(maxAgeMs = 24 * 60 * 60 * 1000) { // default 24 hours
    const now = Date.now();
    const roomsToClose = Array.from(this.rooms.values())
      .filter(room => !room.active || (now - room.createdAt > maxAgeMs))
      .map(room => room.id);

    await Promise.all(roomsToClose.map(roomId => this.closeRoom(roomId)));
    return roomsToClose.length;
  }

  findTransport(transportId) {
    console.log(' Finding transport:', transportId);

    // First try to get it directly from MediasoupService
    const transport = mediasoupService.getTransport(transportId);
    if (transport) {
      console.log(' Found transport in MediasoupService');
      return transport;
    }

    // If not found, search through rooms as fallback
    for (const room of this.rooms.values()) {
      console.log(' Checking room:', room.id);

      // Check producer transport
      if (room.producerTransportId === transportId) {
        console.log(' Found producer transport in room:', room.id);
        return mediasoupService.getTransport(transportId);
      }

      // Check consumer transports
      for (const consumer of room.consumers.values()) {
        if (consumer.transportId === transportId) {
          console.log(' Found consumer transport in room:', room.id);
          return mediasoupService.getTransport(transportId);
        }
      }
    }

    console.log(' Transport not found:', transportId);
    return null;
  }

  getRouterRtpCapabilities() {
    return mediasoupService.getRouterRtpCapabilities();
  }
}

module.exports = new RoomService();
