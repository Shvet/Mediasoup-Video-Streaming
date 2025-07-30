# Docker Troubleshooting Guide

This guide helps you troubleshoot common issues with the Docker setup for the MediaSoup WebRTC Live Streaming Server.

## Common Issues and Solutions

### 1. MediaSoup Installation Fails

**Error Message:**
```
npm error code 1
npm error path /app/node_modules/mediasoup
npm error command failed
npm error command sh -c node npm-scripts.mjs postinstall
/usr/bin/python3: No module named pip
```

**Solution:**
This error occurs when Python's pip module is missing. The Dockerfile has been updated to include `py3-pip`, but if you're still encountering this issue:

1. Rebuild the Docker image without cache:
   ```bash
   npm run docker:build:no-cache
   ```

2. If the issue persists, you can manually modify the Dockerfile to ensure pip is installed:
   ```dockerfile
   RUN apk add --no-cache python3 py3-pip make g++ linux-headers
   ```

### 2. WebRTC Connection Issues

**Symptoms:** Clients cannot establish WebRTC connections with the server.

**Solutions:**

1. Check that the `MEDIASOUP_ANNOUNCED_IP` in your `.env` file is set to your host machine's public IP address or domain name.

2. Verify that UDP ports 10000-10100 are open and properly forwarded if behind a NAT/firewall.

3. Run the server in interactive mode to see real-time logs:
   ```bash
   npm run docker:start:interactive
   ```

### 3. SSL Certificate Issues

**Symptoms:** HTTPS connections fail or show certificate warnings.

**Solutions:**

1. Ensure your SSL certificates are properly mounted in the container:
   ```bash
   # Check if certificates exist
   ls -la cert.pem key.pem
   ```

2. For development, generate new self-signed certificates:
   ```bash
   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
   ```

3. For production, use proper certificates from a trusted Certificate Authority.

### 4. Docker Build Hangs or Takes Too Long

**Solution:**

1. Build with verbose output to see where it's hanging:
   ```bash
   docker-compose build --progress=plain
   ```

2. Try building without cache:
   ```bash
   npm run docker:build:no-cache
   ```

### 5. Debugging Container Issues

To debug issues inside the container:

1. Start an interactive shell in the container:
   ```bash
   npm run docker:debug
   ```

2. For production container:
   ```bash
   npm run docker:prod:debug
   ```

3. Inside the container, you can check installed packages, file permissions, and run tests.

## Advanced Troubleshooting

### Checking Container Logs

```bash
# View logs for all services
npm run docker:logs

# View logs for production services
npm run docker:prod:logs
```

### Inspecting Container Configuration

```bash
# Inspect container details
docker inspect mediasoup-livestream
```

### Network Troubleshooting

```bash
# Check if ports are correctly exposed
docker-compose ps

# Test network connectivity from inside the container
npm run docker:debug
# Then inside the container:
apk add --no-cache curl
curl -k https://localhost:8443
```

## Verification and Health Check Scripts

### Setup Verification

Use the provided verification scripts to automatically check for common issues before starting containers:

```bash
# On Windows
.\docker-verify.ps1

# On Unix
./docker-verify.sh
```

These scripts will check:
- Docker installation and running status
- Required environment files
- SSL certificate existence
- Port availability
- MEDIASOUP_ANNOUNCED_IP configuration
- Dockerfile dependencies

### Container Health Check

Use the health check scripts to monitor running containers and diagnose issues:

```bash
# On Windows
.\docker-healthcheck.ps1

# On Unix
./docker-healthcheck.sh
```

These scripts will check:
- Container running status
- Container health status
- Resource usage (CPU, memory, network)
- Error logs analysis
- Network connectivity
- Port accessibility
- WebRTC UDP port mapping

## Getting Help

If you've tried the solutions above and are still experiencing issues, please open an issue on the project repository with:

1. A detailed description of the problem
2. Steps to reproduce the issue
3. Your environment details (OS, Docker version, etc.)
4. Relevant logs and error messages