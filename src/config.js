require('dotenv').config();
const os = require('os');

module.exports = Object.freeze({
  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      logLevel: 'debug',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
    },
    router: {
      mediaCodecs: [
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
          parameters:
          {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters:
          {
            'profile-id': 2,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters:
          {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters:
          {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },
    webRtcTransport: {
      listenIps: [
        {
          protocol: 'udp',
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP,
          portRange:
          {
            min: process.env.MEDIASOUP_MIN_PORT || 40000,
            max: process.env.MEDIASOUP_MAX_PORT || 49999,
          }
        },
        {
          protocol: 'tcp',
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP,
          portRange:
          {
            min: process.env.MEDIASOUP_MIN_PORT || 40000,
            max: process.env.MEDIASOUP_MAX_PORT || 49999,
          }
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      // Additional options that are not part of WebRtcTransportOptions.
      maxIncomingBitrate: 1500000
    }
  }
});