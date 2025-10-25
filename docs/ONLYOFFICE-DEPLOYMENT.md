# ONLYOFFICE Document Server Deployment Guide

Complete guide for deploying ONLYOFFICE Document Server for contract editing in the ERP system.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Deployment (Automated)](#quick-deployment-automated)
3. [Manual Deployment](#manual-deployment)
4. [ERP Backend Configuration](#erp-backend-configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Ubuntu Server Requirements
- **OS:** Ubuntu 22.04 or 24.04 LTS
- **RAM:** 4GB minimum (8GB recommended)
- **CPU:** 2 cores minimum (4 cores recommended)
- **Storage:** 20GB minimum
- **Network:** Public IP address
- **Domain:** DNS A record pointing to server IP (e.g., `docs.yourdomain.com`)

### Before You Start
- SSH access to Ubuntu server with sudo privileges
- Domain name with DNS configured
- Email address for Let's Encrypt notifications

---

## Quick Deployment (Automated)

### Option 1: One-Command Deployment

```bash
# On your Ubuntu server
curl -fsSL https://raw.githubusercontent.com/yourusername/2025_Backend_ERP/main/scripts/deploy-onlyoffice-ubuntu.sh | sudo bash -s docs.yourdomain.com your@email.com
```

### Option 2: Download and Run

```bash
# Download the script
wget https://raw.githubusercontent.com/yourusername/2025_Backend_ERP/main/scripts/deploy-onlyoffice-ubuntu.sh

# Make it executable
chmod +x deploy-onlyoffice-ubuntu.sh

# Run with your domain and email
sudo bash deploy-onlyoffice-ubuntu.sh docs.yourdomain.com your@email.com
```

**What the script does:**
1. ✅ Updates system packages
2. ✅ Installs Microsoft fonts for DOCX compatibility
3. ✅ Adds ONLYOFFICE repository
4. ✅ Installs ONLYOFFICE Document Server
5. ✅ Installs and configures Nginx
6. ✅ Obtains SSL certificate from Let's Encrypt
7. ✅ Generates and configures JWT secret
8. ✅ Provides configuration values for your ERP

**Time to complete:** ~5-10 minutes

---

## Manual Deployment

If you prefer manual setup or need to customize:

### Step 1: System Preparation

```bash
# Update system
sudo apt update && sudo apt -y upgrade

# Install fonts (optional but recommended)
sudo apt -y install ttf-mscorefonts-installer
```

### Step 2: Install ONLYOFFICE

```bash
# Add repository
sudo apt -y install gnupg2 ca-certificates
curl -fsSL https://download.onlyoffice.com/GPG-KEY-ONLYOFFICE | \
  sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/onlyoffice.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/onlyoffice.gpg] https://download.onlyoffice.com/repo/debian squeeze main" | \
  sudo tee /etc/apt/sources.list.d/onlyoffice.list

# Install Document Server
sudo apt update
sudo apt -y install onlyoffice-documentserver
```

### Step 3: Configure Nginx + SSL

```bash
# Install Nginx and Certbot
sudo apt -y install nginx certbot python3-certbot-nginx

# Configure firewall
sudo ufw allow 'Nginx Full'

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/onlyoffice.conf
```

Paste this configuration (replace `docs.yourdomain.com`):

```nginx
server {
  listen 80;
  server_name docs.yourdomain.com;
  
  location / {
    proxy_pass http://127.0.0.1;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/onlyoffice.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Obtain SSL certificate:

```bash
sudo certbot --nginx -d docs.yourdomain.com --redirect -n --agree-tos -m your@email.com
```

### Step 4: Enable JWT Authentication

Generate a strong secret:

```bash
JWT_SECRET=$(openssl rand -base64 48)
echo "Save this JWT secret: $JWT_SECRET"
```

Configure ONLYOFFICE:

```bash
sudo nano /etc/onlyoffice/documentserver/local.json
```

Add/modify the JWT configuration:

```json
{
  "services": {
    "CoAuthoring": {
      "token": {
        "enable": {
          "browser": true,
          "request": {
            "inbox": true,
            "outbox": true
          }
        },
        "inbox": {
          "header": "Authorization",
          "inBody": false
        },
        "outbox": {
          "header": "Authorization",
          "inBody": false
        }
      },
      "secret": {
        "inbox": {
          "string": "YOUR_JWT_SECRET_HERE"
        },
        "outbox": {
          "string": "YOUR_JWT_SECRET_HERE"
        },
        "session": {
          "string": "YOUR_JWT_SECRET_HERE"
        }
      }
    }
  }
}
```

Restart the service:

```bash
sudo systemctl restart onlyoffice-documentserver
```

---

## ERP Backend Configuration

### 1. Update Environment Variables

Edit your backend `.env` file:

```bash
# ONLYOFFICE Document Server Configuration
ONLYOFFICE_DS_URL=https://docs.yourdomain.com
ONLYOFFICE_JWT_SECRET=<paste-your-jwt-secret-here>
APP_BASE_URL=https://your-erp-backend.onrender.com  # or http://localhost:3001 for local
FILE_STORAGE_DIR=./uploads/contracts
```

### 2. Restart Backend

```bash
# Local development
npm run dev

# Production (Render will auto-restart on env var changes)
```

---

## Testing

### 1. Test Document Server

Visit `https://docs.yourdomain.com` - you should see the ONLYOFFICE welcome page.

### 2. Test API Integration

```bash
# Test contract editor config endpoint
curl -s "https://your-backend.com/api/contracts/1/onlyoffice/config" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "X-Tenant-Id: demo" | jq
```

Expected response:
```json
{
  "docServerUrl": "https://docs.yourdomain.com",
  "config": {
    "documentType": "word",
    "document": { ... },
    "editorConfig": { ... },
    "token": "eyJ..."
  }
}
```

### 3. End-to-End Test

1. Log into your ERP
2. Go to a project → Packages
3. Select a package → "Direct Award"
4. Select a supplier and create contract
5. Click "Edit" on the created contract
6. The ONLYOFFICE editor should load
7. Type something and save (Ctrl+S)
8. Check backend logs for callback: `POST /api/contracts/:id/onlyoffice/callback`
9. Verify new file created in `uploads/contracts/<id>/`

---

## Troubleshooting

### Issue: Editor doesn't load

**Check browser console:**
```
Mixed Content: The page was loaded over HTTPS, but requested an insecure resource
```

**Solution:** Ensure both ERP and Document Server use HTTPS.

---

### Issue: "Download failed" or permission errors

**Check JWT configuration:**
```bash
# On Ubuntu server
sudo cat /etc/onlyoffice/documentserver/local.json | jq '.services.CoAuthoring'
```

Verify JWT secret matches your backend `.env`.

---

### Issue: Callback fails (document doesn't save)

**Check backend logs:**
```bash
# Should see callback requests
POST /api/contracts/:id/onlyoffice/callback
```

**Check APP_BASE_URL:**
- Must be publicly accessible from Document Server
- If using localhost, Document Server can't reach it
- Use ngrok or deploy backend to cloud

---

### Issue: Service not starting

**Check service status:**
```bash
sudo systemctl status onlyoffice-documentserver
sudo journalctl -u onlyoffice-documentserver -n 50
```

**Common fixes:**
```bash
# Restart service
sudo systemctl restart onlyoffice-documentserver

# Check disk space
df -h

# Check memory
free -h
```

---

## Security Best Practices

1. **JWT Secret:** Use a strong, randomly generated secret (minimum 32 characters)
2. **Firewall:** Only allow HTTP(S) traffic, block everything else
3. **Updates:** Keep Ubuntu and ONLYOFFICE up to date
4. **Backups:** Regular backups of `/etc/onlyoffice/` configuration
5. **Monitoring:** Set up uptime monitoring for the Document Server

---

## Maintenance

### Update ONLYOFFICE

```bash
sudo apt update
sudo apt upgrade onlyoffice-documentserver
sudo systemctl restart onlyoffice-documentserver
```

### View Logs

```bash
# Service logs
sudo journalctl -u onlyoffice-documentserver -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Document Server logs
sudo tail -f /var/log/onlyoffice/documentserver/*
```

### Backup Configuration

```bash
# Backup JWT config
sudo cp /etc/onlyoffice/documentserver/local.json ~/onlyoffice-backup-$(date +%Y%m%d).json

# Backup Nginx config
sudo cp /etc/nginx/sites-available/onlyoffice.conf ~/nginx-onlyoffice-backup-$(date +%Y%m%d).conf
```

---

## Cost Estimation

### Cloud Provider Costs (Monthly)

| Provider | Instance Type | Specs | Est. Cost |
|----------|---------------|-------|-----------|
| DigitalOcean | Basic Droplet | 2 vCPU, 4GB RAM | $24/mo |
| AWS Lightsail | 2GB Instance | 1 vCPU, 2GB RAM | $10/mo |
| Linode | Nanode 2GB | 1 vCPU, 2GB RAM | $10/mo |
| Hetzner | CX21 | 2 vCPU, 4GB RAM | €5.83/mo (~$6) |

**Recommendation:** Hetzner CX21 or AWS Lightsail for best value.

---

## Support

- **ONLYOFFICE Docs:** https://helpcenter.onlyoffice.com/installation/docs-community-install-ubuntu.aspx
- **Community Forum:** https://forum.onlyoffice.com/
- **GitHub Issues:** https://github.com/ONLYOFFICE/DocumentServer/issues

---

## Next Steps

After successful deployment:

1. ✅ Update ERP backend environment variables
2. ✅ Test document creation and editing
3. ✅ Set up monitoring (optional but recommended)
4. ✅ Configure automated backups
5. ✅ Document the JWT secret in password manager

---

**Deployment complete!** 🎉 Your ERP can now edit contracts with ONLYOFFICE.
