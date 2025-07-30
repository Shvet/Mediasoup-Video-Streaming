# SSL Setup for Flutter Live Streaming Server

## Overview

This document describes how SSL certificates were set up for the Flutter Live Streaming server to enable secure HTTPS connections.

## SSL Certificate Generation

SSL certificates were generated using OpenSSL with the following command:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config openssl.cnf -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

The certificates are self-signed and valid for 365 days. For production use, you should obtain certificates from a trusted Certificate Authority (CA).

## Certificate Files

- **key.pem**: The private key file
- **cert.pem**: The certificate file
- **openssl.cnf**: The OpenSSL configuration file with the following settings:
  - Common Name (CN): localhost
  - Subject Alternative Names (SANs): localhost, 127.0.0.1, and the server's IP address

## Server Configuration

The server is configured to run both HTTP and HTTPS servers:

- HTTP server runs on port 8080 (configurable via HTTP_PORT environment variable)
- HTTPS server runs on port 8443 (configurable via HTTPS_PORT environment variable)

HTTP requests are automatically redirected to HTTPS for better security.

## Testing

You can test the HTTPS connection by accessing:

```
https://localhost:8443/https-test.html
```

Note: Since the certificates are self-signed, browsers will show a security warning. You can proceed by accepting the risk.

## Production Considerations

For production deployment:

1. Obtain certificates from a trusted CA like Let's Encrypt
2. Update the SSL options in server.js with the new certificate paths
3. Configure proper firewall rules to allow traffic on the HTTPS port
4. Consider implementing HSTS (HTTP Strict Transport Security) for additional security