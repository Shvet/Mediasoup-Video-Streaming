# MediaSoup Docker Setup Verification Script for Windows

Write-Host "MediaSoup Docker Setup Verification Script"
Write-Host "This script will check your Docker setup and help diagnose common issues."
Write-Host ""

# Check if Docker is installed
Write-Host "Checking if Docker is installed..."
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Docker is installed."
    docker --version
} else {
    Write-Host "Docker is not installed. Please install Docker Desktop for Windows first."
    exit 1
}

# Check if Docker is running
Write-Host "`nChecking if Docker is running..."
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker is running."
    } else {
        Write-Host "Docker is not running. Please start Docker Desktop."
        exit 1
    }
} catch {
    Write-Host "Docker is not running. Please start Docker Desktop."
    exit 1
}

# Check if .env file exists
Write-Host "`nChecking if .env file exists..."
if (Test-Path ".env") {
    Write-Host ".env file exists."
} else {
    Write-Host ".env file does not exist."
    Write-Host "Creating .env file from .env.docker..."
    if (Test-Path ".env.docker") {
        Copy-Item ".env.docker" ".env"
        Write-Host "Created .env file from .env.docker."
    } else {
        Write-Host ".env.docker file does not exist. Please create .env file manually."
    }
}

# Check if SSL certificates exist
Write-Host "`nChecking if SSL certificates exist..."
if ((Test-Path "cert.pem") -and (Test-Path "key.pem")) {
    Write-Host "SSL certificates exist."
} else {
    Write-Host "SSL certificates do not exist."
    Write-Host "Generating self-signed SSL certificates..."
    try {
        # Check if OpenSSL is available
        if (Get-Command openssl -ErrorAction SilentlyContinue) {
            openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Generated self-signed SSL certificates."
            } else {
                Write-Host "Failed to generate SSL certificates."
            }
        } else {
            Write-Host "OpenSSL is not installed or not in PATH. Please install OpenSSL or generate certificates manually."
        }
    } catch {
        Write-Host "Failed to generate SSL certificates: $_"
    }
}

# Check if required ports are available
Write-Host "`nChecking if required ports are available..."
$envContent = Get-Content ".env" -ErrorAction SilentlyContinue
$httpPort = 8080
$httpsPort = 8443

if ($envContent) {
    $httpPortMatch = $envContent | Select-String "HTTP_PORT=([0-9]+)"
    if ($httpPortMatch) {
        $httpPort = $httpPortMatch.Matches.Groups[1].Value
    }
    
    $httpsPortMatch = $envContent | Select-String "HTTPS_PORT=([0-9]+)"
    if ($httpsPortMatch) {
        $httpsPort = $httpsPortMatch.Matches.Groups[1].Value
    }
}

function Test-PortInUse {
    param(
        [int]$Port
    )
    
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        Write-Host "Port $Port is available."
        return $false
    } catch {
        Write-Host "Port $Port is already in use. You may need to stop services using this port or change the port in .env file."
        return $true
    } finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

$httpPortInUse = Test-PortInUse -Port $httpPort
$httpsPortInUse = Test-PortInUse -Port $httpsPort

# Check if MEDIASOUP_ANNOUNCED_IP is set correctly
Write-Host "`nChecking if MEDIASOUP_ANNOUNCED_IP is set correctly..."
$announcedIp = ""
if ($envContent) {
    $pattern = "MEDIASOUP_ANNOUNCED_IP=(.*)"
    $announcedIpMatch = $envContent | Select-String -Pattern $pattern
    if ($announcedIpMatch) {
        $announcedIp = $announcedIpMatch.Matches.Groups[1].Value
    }
}

if ([string]::IsNullOrEmpty($announcedIp) -or $announcedIp -eq "192.168.1.100") {
    Write-Host "MEDIASOUP_ANNOUNCED_IP is not set correctly."
    Write-Host "Detecting host IP address..."
    
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
    
    $hostIp = Get-HostIP
    if ($hostIp) {
        Write-Host "Detected host IP address: $hostIp"
        Write-Host "Updating MEDIASOUP_ANNOUNCED_IP in .env file..."
        
        if ($envContent) {
            $newEnvContent = $envContent -replace "MEDIASOUP_ANNOUNCED_IP=.*", "MEDIASOUP_ANNOUNCED_IP=$hostIp"
            Set-Content -Path ".env" -Value $newEnvContent
        } else {
            Add-Content -Path ".env" -Value "MEDIASOUP_ANNOUNCED_IP=$hostIp"
        }
        
        Write-Host "Updated MEDIASOUP_ANNOUNCED_IP in .env file."
    } else {
        Write-Host "Failed to detect host IP address. Please set MEDIASOUP_ANNOUNCED_IP manually in .env file."
    }
} else {
    Write-Host "MEDIASOUP_ANNOUNCED_IP is set to $announcedIp."
}

# Check Docker build prerequisites
Write-Host "`nChecking Docker build prerequisites..."
if (Test-Path "Dockerfile") {
    $dockerfileContent = Get-Content "Dockerfile"
    if ($dockerfileContent -match "py3-pip") {
        Write-Host "Dockerfile includes py3-pip for mediasoup build."
    } else {
        Write-Host "Dockerfile does not include py3-pip. This may cause mediasoup build to fail."
        Write-Host "Please update your Dockerfile to include py3-pip:"
        Write-Host "RUN apk add --no-cache python3 py3-pip make g++ linux-headers"
    }
} else {
    Write-Host "Dockerfile not found."
}

Write-Host "`nVerification complete!"
Write-Host "You can now build and start the Docker containers with:"
Write-Host "npm run docker:build"
Write-Host "npm run docker:start"
Write-Host "`nIf you encounter any issues, please refer to DOCKER-TROUBLESHOOTING.md"