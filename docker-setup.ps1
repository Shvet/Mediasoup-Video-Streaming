# Function to detect the host IP address
function Get-HostIP {
    try {
        # Try to get the IP address that can reach the internet
        $ip = (Get-NetRoute | Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' } | Get-NetIPAddress).IPAddress
        if ($ip) {
            return $ip
        }
        
        # If the above fails, try another method
        $ip = (Get-NetIPAddress | Where-Object { $_.AddressFamily -eq 'IPv4' -and $_.PrefixOrigin -eq 'Dhcp' }).IPAddress
        if ($ip) {
            return $ip
        }
        
        # Last resort, try to get any IPv4 address
        $ip = (Get-NetIPAddress | Where-Object { $_.AddressFamily -eq 'IPv4' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1).IPAddress
        if ($ip) {
            return $ip
        }
        
        return $null
    } catch {
        Write-Host "Error detecting IP: $_"
        return $null
    }
}

# Create .env file from template if it doesn't exist
if (-not (Test-Path -Path ".env")) {
    Write-Host "Creating .env file from .env.docker template..."
    Copy-Item -Path ".env.docker" -Destination ".env"
    
    # Update the MEDIASOUP_ANNOUNCED_IP with the detected IP
    $hostIP = Get-HostIP
    if ($hostIP) {
        Write-Host "Detected host IP: $hostIP"
        (Get-Content -Path ".env") -replace "MEDIASOUP_ANNOUNCED_IP=.*", "MEDIASOUP_ANNOUNCED_IP=$hostIP" | Set-Content -Path ".env"
    } else {
        Write-Host "Could not detect host IP. Please update MEDIASOUP_ANNOUNCED_IP in .env manually."
    }
}

# Check if SSL certificates exist
if (-not (Test-Path -Path "cert.pem") -or -not (Test-Path -Path "key.pem")) {
    Write-Host "SSL certificates not found. Generating self-signed certificates..."
    
    # Check if OpenSSL is available
    $openssl = Get-Command "openssl" -ErrorAction SilentlyContinue
    if (-not $openssl) {
        Write-Host "OpenSSL not found. Please install OpenSSL or generate certificates manually according to SSL_SETUP.md"
        exit 1
    }
    
    # Generate certificates
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
        -keyout key.pem -out cert.pem `
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to generate SSL certificates. Please check if OpenSSL is installed correctly."
        exit 1
    }
}

# Build and start the Docker containers
Write-Host "Starting Docker containers..."
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    $httpPort = (Get-Content -Path ".env" | Where-Object { $_ -match "HTTP_PORT=(.*)" } | ForEach-Object { $matches[1] })
    $httpsPort = (Get-Content -Path ".env" | Where-Object { $_ -match "HTTPS_PORT=(.*)" } | ForEach-Object { $matches[1] })
    
    Write-Host "Docker containers started successfully!"
    Write-Host "You can access the application at:"
    Write-Host "  - HTTP: http://localhost:$httpPort"
    Write-Host "  - HTTPS: https://localhost:$httpsPort"
    Write-Host ""
    Write-Host "To view logs: docker-compose logs -f"
    Write-Host "To stop: docker-compose down"
} else {
    Write-Host "Failed to start Docker containers. Please check the error messages above."
}