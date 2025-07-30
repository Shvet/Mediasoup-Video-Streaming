# Create nginx/ssl directory if it doesn't exist
if (-not (Test-Path -Path "nginx/ssl")) {
    New-Item -Path "nginx/ssl" -ItemType Directory -Force
    Write-Host "Created nginx/ssl directory"
}

# Copy the SSL certificates to the Nginx SSL directory
Copy-Item -Path "cert.pem" -Destination "nginx/ssl/" -Force
Copy-Item -Path "key.pem" -Destination "nginx/ssl/" -Force

Write-Host "SSL certificates copied to nginx/ssl/ directory."
Write-Host "You can now run 'docker-compose -f docker-compose.prod.yml up -d' to start the production setup."