#!/bin/bash
# MediaSoup Docker Health Check Script

# Function to print colored output
print_status() {
  local status=$1
  local message=$2
  if [ "$status" == "OK" ]; then
    echo -e "\033[0;32m[OK]\033[0m $message"
  elif [ "$status" == "WARNING" ]; then
    echo -e "\033[0;33m[WARNING]\033[0m $message"
  else
    echo -e "\033[0;31m[FAIL]\033[0m $message"
  fi
}

echo "MediaSoup Docker Health Check"
echo "============================"
echo ""

# Check if containers are running
echo "Checking container status..."
if docker ps | grep -q "mediasoup-livestream"; then
  print_status "OK" "MediaSoup container is running"
  
  # Get container ID
  CONTAINER_ID=$(docker ps -qf "name=mediasoup-livestream")
  
  # Check container health if using healthcheck
  if docker inspect --format='{{.State.Health.Status}}' $CONTAINER_ID 2>/dev/null | grep -q "healthy"; then
    print_status "OK" "Container health check is passing"
  elif docker inspect --format='{{.State.Health}}' $CONTAINER_ID 2>/dev/null | grep -q "null"; then
    print_status "WARNING" "No health check configured for container"
  else
    print_status "FAIL" "Container health check is failing"
    echo "Health check logs:"
    docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' $CONTAINER_ID
  fi
  
  # Check container resource usage
  echo ""
  echo "Container resource usage:"
  docker stats $CONTAINER_ID --no-stream --format "CPU: {{.CPUPerc}}, Memory: {{.MemUsage}}, Network I/O: {{.NetIO}}"
  
  # Check container logs for errors
  echo ""
  echo "Checking container logs for errors..."
  ERROR_COUNT=$(docker logs $CONTAINER_ID --since 1h 2>&1 | grep -i "error\|exception\|fatal" | wc -l)
  if [ $ERROR_COUNT -eq 0 ]; then
    print_status "OK" "No errors found in container logs"
  else
    print_status "WARNING" "Found $ERROR_COUNT errors in container logs"
    echo "Recent errors:"
    docker logs $CONTAINER_ID --since 1h 2>&1 | grep -i "error\|exception\|fatal" | tail -5
  fi
  
  # Check network connectivity
  echo ""
  echo "Checking network connectivity..."
  HTTP_PORT=$(docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "8080/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' $CONTAINER_ID)
  HTTPS_PORT=$(docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "8443/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' $CONTAINER_ID)
  
  if curl -s http://localhost:$HTTP_PORT > /dev/null; then
    print_status "OK" "HTTP port $HTTP_PORT is accessible"
  else
    print_status "FAIL" "HTTP port $HTTP_PORT is not accessible"
  fi
  
  if curl -sk https://localhost:$HTTPS_PORT > /dev/null; then
    print_status "OK" "HTTPS port $HTTPS_PORT is accessible"
  else
    print_status "FAIL" "HTTPS port $HTTPS_PORT is not accessible"
  fi
  
  # Check UDP ports for WebRTC
  echo ""
  echo "Checking UDP ports for WebRTC..."
  UDP_PORTS_MAPPED=$(docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{if contains "/udp" $p}}{{$p}}{{end}}{{end}}' $CONTAINER_ID)
  if [ -n "$UDP_PORTS_MAPPED" ]; then
    print_status "OK" "UDP ports are mapped: $UDP_PORTS_MAPPED"
  else
    print_status "FAIL" "No UDP ports mapped for WebRTC"
  fi
  
else
  print_status "FAIL" "MediaSoup container is not running"
  
  # Check if container exists but is stopped
  if docker ps -a | grep -q "mediasoup-livestream"; then
    print_status "WARNING" "Container exists but is stopped"
    echo "Container status:"
    docker inspect --format='{{.State.Status}}' $(docker ps -aqf "name=mediasoup-livestream")
    echo "Exit code: $(docker inspect --format='{{.State.ExitCode}}' $(docker ps -aqf "name=mediasoup-livestream"))"
    echo "Last logs:"
    docker logs $(docker ps -aqf "name=mediasoup-livestream") --tail 10
  fi
  
  echo ""
  echo "To start the container, run:"
  echo "npm run docker:start"
fi

echo ""
echo "Health check complete!"