# Docker Setup for MediaSoup Live Streaming Server

## Prerequisites

- Docker installed on your system
- Docker Compose installed on your system

## Configuration

1. Copy the example Docker environment file:

```bash
cp .env.docker .env
```

2. Edit the `.env` file and update the `MEDIASOUP_ANNOUNCED_IP` to your host machine's IP address or domain name. This is the IP that will be announced to clients for WebRTC connections.

## SSL Certificates

The Docker setup uses the existing SSL certificates (`cert.pem` and `key.pem`). If you need to generate new certificates, follow the instructions in `SSL_SETUP.md`.

## Building and Running with Docker

### Using Docker Compose (Recommended)

1. Build and start the container:

```bash
docker-compose up -d
```

2. View logs:

```bash
docker-compose logs -f
```

3. Stop the container:

```bash
docker-compose down
```

### Using Docker Directly

1. Build the Docker image:

```bash
docker build -t mediasoup-livestream .
```

2. Run the container:

```bash
docker run -d \
  --name mediasoup-livestream \
  -p 8080:8080 \
  -p 8443:8443 \
  -p 10000-10100:10000-10100/udp \
  -v $(pwd)/cert.pem:/app/cert.pem \
  -v $(pwd)/key.pem:/app/key.pem \
  -e HTTP_PORT=8080 \
  -e HTTPS_PORT=8443 \
  -e MEDIASOUP_LISTEN_IP=0.0.0.0 \
  -e MEDIASOUP_ANNOUNCED_IP=your-ip-address \
  mediasoup-livestream
```

## Accessing the Server

Once the container is running, you can access the server at:

- HTTP: http://localhost:8080 (will redirect to HTTPS)
- HTTPS: https://localhost:8443

## Troubleshooting

### WebRTC Connection Issues

If clients cannot establish WebRTC connections:

1. Verify that the `MEDIASOUP_ANNOUNCED_IP` is set correctly to an IP that is reachable from client devices.
2. Ensure that UDP ports 10000-10100 are open and properly forwarded if behind a NAT/firewall.
3. Check the container logs for any errors:

```bash
docker-compose logs -f
```

### SSL Certificate Issues

If you encounter SSL certificate issues:

1. Ensure that the certificate files are properly mounted in the container.
2. Generate new certificates following the instructions in `SSL_SETUP.md`.

## Production Deployment

For production deployment, we've included optimized configurations:

### Using Production Docker Setup

1. Build and start the production containers:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

2. The production setup includes:
   - Multi-stage build for smaller image size
   - Non-root user for better security
   - Resource limits to prevent container from consuming too many resources
   - Health checks to ensure the application is running properly
   - Nginx reverse proxy for SSL termination and additional security
   - Log rotation to prevent disk space issues

### Production Configuration

1. Use proper SSL certificates from a trusted Certificate Authority:
   - Place your production certificates in the `nginx/ssl/` directory
   - Update the Nginx configuration if needed

2. Configure appropriate firewall rules:
   - Allow HTTP (80) and HTTPS (443) for web access
   - Allow UDP ports 10000-10100 for WebRTC media

3. Adjust the `MEDIASOUP_ANNOUNCED_IP` to your production server's public IP or domain name.

4. For high availability and scaling:
   - Consider using Docker Swarm or Kubernetes for orchestration
   - Set up a load balancer for distributing traffic across multiple instances
   - Implement monitoring and alerting using tools like Prometheus and Grafana