# MediaSoup Docker Health Check Script for Windows

# Function to print colored output
function Print-Status {
    param (
        [string]$status,
        [string]$message
    )
    
    if ($status -eq "OK") {
        Write-Host "[OK] $message" -ForegroundColor Green
    }
    elseif ($status -eq "WARNING") {
        Write-Host "[WARNING] $message" -ForegroundColor Yellow
    }
    else {
        Write-Host "[FAIL] $message" -ForegroundColor Red
    }
}

Write-Host "MediaSoup Docker Health Check"
Write-Host "============================" 
Write-Host ""

# Check if containers are running
Write-Host "Checking container status..."
$containerRunning = docker ps | Select-String -Pattern "mediasoup-livestream"

if ($containerRunning) {
    Print-Status "OK" "MediaSoup container is running"
    
    # Get container ID
    $containerId = docker ps -qf "name=mediasoup-livestream"
    
    # Check container health if using healthcheck
    $healthStatus = docker inspect --format='{{.State.Health.Status}}' $containerId 2>$null
    if ($healthStatus -eq "healthy") {
        Print-Status "OK" "Container health check is passing"
    }
    elseif ($healthStatus -eq $null -or $healthStatus -eq "") {
        Print-Status "WARNING" "No health check configured for container"
    }
    else {
        Print-Status "FAIL" "Container health check is failing"
        Write-Host "Health check logs:"
        docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' $containerId
    }
    
    # Check container resource usage
    Write-Host ""
    Write-Host "Container resource usage:"
    docker stats $containerId --no-stream --format "CPU: {{.CPUPerc}}, Memory: {{.MemUsage}}, Network I/O: {{.NetIO}}"
    
    # Check container logs for errors
    Write-Host ""
    Write-Host "Checking container logs for errors..."
    $errorLogs = docker logs $containerId --since 1h 2>&1 | Select-String -Pattern "error|exception|fatal" -CaseSensitive:$false
    if ($errorLogs.Count -eq 0) {
        Print-Status "OK" "No errors found in container logs"
    }
    else {
        Print-Status "WARNING" "Found $($errorLogs.Count) errors in container logs"
        Write-Host "Recent errors:"
        $errorLogs | Select-Object -Last 5 | ForEach-Object { Write-Host $_ }
    }
    
    # Check network connectivity
    Write-Host ""
    Write-Host "Checking network connectivity..."
    $httpPort = docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "8080/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' $containerId
    $httpsPort = docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "8443/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' $containerId
    
    try {
        $httpResponse = Invoke-WebRequest -Uri "http://localhost:$httpPort" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        Print-Status "OK" "HTTP port $httpPort is accessible"
    }
    catch {
        Print-Status "FAIL" "HTTP port $httpPort is not accessible"
    }
    
    try {
        $httpsResponse = Invoke-WebRequest -Uri "https://localhost:$httpsPort" -UseBasicParsing -TimeoutSec 5 -SkipCertificateCheck -ErrorAction SilentlyContinue
        Print-Status "OK" "HTTPS port $httpsPort is accessible"
    }
    catch {
        Print-Status "FAIL" "HTTPS port $httpsPort is not accessible"
    }
    
    # Check UDP ports for WebRTC
    Write-Host ""
    Write-Host "Checking UDP ports for WebRTC..."
    $udpPortsMapped = docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{if contains "/udp" $p}}{{$p}}{{end}}{{end}}' $containerId
    if ($udpPortsMapped) {
        Print-Status "OK" "UDP ports are mapped: $udpPortsMapped"
    }
    else {
        Print-Status "FAIL" "No UDP ports mapped for WebRTC"
    }
}
else {
    Print-Status "FAIL" "MediaSoup container is not running"
    
    # Check if container exists but is stopped
    $containerExists = docker ps -a | Select-String -Pattern "mediasoup-livestream"
    if ($containerExists) {
        Print-Status "WARNING" "Container exists but is stopped"
        Write-Host "Container status:"
        docker inspect --format='{{.State.Status}}' (docker ps -aqf "name=mediasoup-livestream")
        Write-Host "Exit code: $(docker inspect --format='{{.State.ExitCode}}' (docker ps -aqf "name=mediasoup-livestream"))"
        Write-Host "Last logs:"
        docker logs (docker ps -aqf "name=mediasoup-livestream") --tail 10
    }
    
    Write-Host ""
    Write-Host "To start the container, run:"
    Write-Host "npm run docker:start"
}

Write-Host ""
Write-Host "Health check complete!"