#!/bin/bash
# ONLYOFFICE Document Server Deployment Script for Ubuntu 22.04/24.04
# Usage: sudo bash deploy-onlyoffice-ubuntu.sh docs.yourdomain.com your-email@domain.com

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -ne 2 ]; then
    echo -e "${RED}Usage: sudo bash $0 <domain> <email>${NC}"
    echo "Example: sudo bash $0 docs.example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}ONLYOFFICE Document Server Deployment${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "Domain: ${YELLOW}${DOMAIN}${NC}"
echo -e "Email:  ${YELLOW}${EMAIL}${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Step 1: System Update
echo -e "${GREEN}[1/7] Updating system packages...${NC}"
apt update && apt -y upgrade

# Step 2: Install fonts (optional but recommended)
echo -e "${GREEN}[2/7] Installing Microsoft fonts for better DOCX compatibility...${NC}"
echo ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true | debconf-set-selections
apt -y install ttf-mscorefonts-installer

# Step 3: Add ONLYOFFICE repository
echo -e "${GREEN}[3/7] Adding ONLYOFFICE repository...${NC}"
apt -y install gnupg2 ca-certificates curl jq
curl -fsSL https://download.onlyoffice.com/GPG-KEY-ONLYOFFICE | gpg --dearmor -o /etc/apt/trusted.gpg.d/onlyoffice.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/onlyoffice.gpg] https://download.onlyoffice.com/repo/debian squeeze main" | \
  tee /etc/apt/sources.list.d/onlyoffice.list
apt update

# Step 4: Install ONLYOFFICE Document Server
echo -e "${GREEN}[4/7] Installing ONLYOFFICE Document Server...${NC}"
apt -y install onlyoffice-documentserver

# Step 5: Install Nginx and Certbot
echo -e "${GREEN}[5/7] Installing Nginx and Let's Encrypt...${NC}"
apt -y install nginx certbot python3-certbot-nginx

# Configure firewall if UFW is active
if command -v ufw &> /dev/null; then
    ufw allow 'Nginx Full' || true
fi

# Step 6: Configure Nginx reverse proxy
echo -e "${GREEN}[6/7] Configuring Nginx reverse proxy for ${DOMAIN}...${NC}"
cat >/etc/nginx/sites-available/onlyoffice.conf <<NGINX
server {
  listen 80;
  server_name ${DOMAIN};
  
  location / {
    proxy_pass http://127.0.0.1;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
NGINX

ln -sf /etc/nginx/sites-available/onlyoffice.conf /etc/nginx/sites-enabled/onlyoffice.conf
nginx -t && systemctl reload nginx

# Step 7: Obtain SSL certificate
echo -e "${GREEN}[7/7] Obtaining SSL certificate from Let's Encrypt...${NC}"
certbot --nginx -d ${DOMAIN} --redirect -n --agree-tos -m ${EMAIL}

# Generate random JWT secret
JWT_SECRET=$(openssl rand -base64 48)

# Configure JWT
echo -e "${GREEN}Enabling JWT authentication...${NC}"
cat > /tmp/update-jwt.jq << 'JQ'
.services.CoAuthoring.token = {
  "enable": { "browser": true, "request": { "inbox": true, "outbox": true } },
  "inbox": { "header": "Authorization", "inBody": false },
  "outbox": { "header": "Authorization", "inBody": false }
} |
.services.CoAuthoring.secret = {
  "inbox": { "string": $secret },
  "outbox": { "string": $secret },
  "session": { "string": $secret }
}
JQ

jq --arg secret "${JWT_SECRET}" -f /tmp/update-jwt.jq /etc/onlyoffice/documentserver/local.json > /tmp/local.json.new
mv /tmp/local.json.new /etc/onlyoffice/documentserver/local.json
rm /tmp/update-jwt.jq

systemctl restart onlyoffice-documentserver

# Wait for service to start
echo -e "${YELLOW}Waiting for Document Server to start...${NC}"
sleep 10

# Test the service
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${GREEN}ONLYOFFICE Document Server URL:${NC}"
echo -e "  https://${DOMAIN}"
echo ""
echo -e "${GREEN}JWT Secret (save this!):${NC}"
echo -e "  ${YELLOW}${JWT_SECRET}${NC}"
echo ""
echo -e "${GREEN}Add to your ERP .env file:${NC}"
echo -e "  ONLYOFFICE_DS_URL=https://${DOMAIN}"
echo -e "  ONLYOFFICE_JWT_SECRET=${JWT_SECRET}"
echo ""
echo -e "${GREEN}Test the deployment:${NC}"
echo -e "  curl -I https://${DOMAIN}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Save the JWT secret above!${NC}"
echo -e "${YELLOW}⚠️  Update your ERP backend .env with these values${NC}"
