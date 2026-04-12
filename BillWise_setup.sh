#!/bin/bash

# ==============================
# COLOR + LOGGING SETUP
# ==============================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $1"; }

section() {
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}🚀 $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

set -e
LOG_FILE="billwise_setup.log"
exec > >(tee -a $LOG_FILE) 2>&1

# 1. Git Setup
section "GIT SETUP"
if ! command -v git &> /dev/null; then
  log_info "Installing Git..."
  sudo apt update && sudo apt install -y git && log_success "Git installed"
else
  log_success "Git already installed"
fi

if [ -d "BillWise" ]; then
  read -p "Repository exists. Pull latest changes? (Y/N): " PULL_REPO
  if [[ "$PULL_REPO" =~ ^[Yy]$ ]]; then
    cd BillWise && git pull && cd ..
    log_success "Repository updated"
  else
    log_warn "Skipping git pull"
  fi
else
  log_info "Cloning repository..."
  git clone https://github.com/nileshpatil0529/BillWise.git && log_success "Repository cloned"
fi

cd BillWise

# 2. Node Setup
section "NODE SETUP"
if ! command -v node &> /dev/null; then
  log_info "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt install -y nodejs && log_success "Node installed"
else
  NODE_VER=$(node -v)
  log_success "Node already installed (version: $NODE_VER)"
fi

# 3. Dependencies & Build
section "DEPENDENCIES & BUILD"

# biller-mobile-app
read -p "Install packages for biller-mobile-app? (Y/N): " INSTALL_MOBILE
if [[ "$INSTALL_MOBILE" =~ ^[Yy]$ ]]; then
  cd biller-mobile-app && npm install && log_success "biller-mobile-app dependencies installed" && cd ..
else
  log_warn "Skipping biller-mobile-app dependencies"
fi

read -p "Build biller-mobile-app? (Y/N): " BUILD_MOBILE
if [[ "$BUILD_MOBILE" =~ ^[Yy]$ ]]; then
  cd biller-mobile-app
  log_info "Building mobile app..."
  npm run build || npm run build --if-present || log_error "Build failed"
  cd ..
  log_success "Build output copied to biller-server/public"
else
  log_warn "Skipping mobile app build"
fi

# biller-app
read -p "Install packages for biller-app? (Y/N): " INSTALL_APP
if [[ "$INSTALL_APP" =~ ^[Yy]$ ]]; then
  cd biller-app && npm install && log_success "biller-app dependencies installed" && cd ..
else
  log_warn "Skipping biller-app dependencies"
fi

# biller-server
read -p "Install packages for biller-server? (Y/N): " INSTALL_SERVER
if [[ "$INSTALL_SERVER" =~ ^[Yy]$ ]]; then
  cd biller-server && npm install && log_success "biller-server dependencies installed" && cd ..
else
  log_warn "Skipping biller-server dependencies"
fi

# 4. Systemd Service for Server
section "SYSTEMD SERVICE"
SERVICE_FILE="/etc/systemd/system/billwise.service"
if [ ! -f "$SERVICE_FILE" ]; then
  log_info "Creating systemd service..."
  sudo bash -c "cat > $SERVICE_FILE" <<EOF
[Unit]
Description=BillWise Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)/biller-server
ExecStart=/usr/bin/node src/app.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reexec
  sudo systemctl enable billwise
  sudo systemctl start billwise
  log_success "Systemd service created and started"
else
  log_warn "Systemd service already exists"
fi

# Ask to restart server if code changed
read -p "Restart BillWise server now? (Y/N): " RESTART_SERVER
if [[ "$RESTART_SERVER" =~ ^[Yy]$ ]]; then
  sudo systemctl restart billwise
  log_success "BillWise server restarted"
else
  log_warn "Skipping server restart"
fi

# 5. Nginx Setup
section "NGINX SETUP"
if ! command -v nginx &> /dev/null; then
  log_info "Installing Nginx..."
  sudo apt install -y nginx && log_success "Nginx installed"
fi

NGINX_CONF="/etc/nginx/sites-available/billwise"
if [ ! -f "$NGINX_CONF" ]; then
  log_info "Configuring Nginx..."
  sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name billwise.site www.billwise.site;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

  sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl restart nginx
  log_success "Nginx configured for billwise.site"
else
  log_warn "Nginx already configured"
fi

# 6. Cloudflare Tunnel Setup
section "CLOUDFLARE SETUP"
if ! command -v cloudflared &> /dev/null; then
  log_info "Installing Cloudflare Tunnel..."
  wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
  sudo dpkg -i cloudflared-linux-arm64.deb || sudo apt install -f -y
  log_success "Cloudflare installed"
fi

TUNNEL_ID="c6bc768e-061c-40c8-940c-0124b45f7314"
CRED_FILE="/etc/cloudflared/$TUNNEL_ID.json"

if [ ! -f "$CRED_FILE" ]; then
  log_warn "Manual login required for Cloudflare and tunnel creation."
  sudo mkdir -p /etc/cloudflared
  cloudflared tunnel login
  cloudflared tunnel create billwise
  if [ -f "$HOME/.cloudflared/$TUNNEL_ID.json" ]; then
    sudo cp "$HOME/.cloudflared/$TUNNEL_ID.json" "$CRED_FILE"
  fi
else
  log_warn "Tunnel credentials already exist, skipping tunnel creation."
fi

if [ -f "/etc/systemd/system/cloudflared.service" ]; then
  log_warn "Cloudflared service already installed, skipping service install."
else
  sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: billwise.site
    service: http://localhost:3000
  - service: http_status:404
EOF

  sudo cloudflared service install
  log_success "Cloudflare tunnel configured and running"
fi

section "SETUP COMPLETE"
log_success "BillWise deployed successfully 🚀"
