#!/bin/bash

# ==============================
# COLOR + LOGGING SETUP
# ==============================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
log_success() { echo -e "${GREEN}✓${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
log_error()   { echo -e "${RED}✗${NC}  $1"; }
log_step()    { echo -e "${MAGENTA}▶${NC}  ${BOLD}$1${NC}"; }

section() {
  echo ""
  echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}${BOLD}║  $1${NC}"
  echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════╝${NC}"
  echo ""
}

# Improved Yes/No prompt with default
confirm() {
  local prompt="$1"
  local default="${2:-Y}"
  local response
  
  if [[ "$default" == "Y" ]]; then
    echo -ne "${BOLD}❯ $prompt${NC} ${GREEN}[Y/n]${NC}: "
  else
    echo -ne "${BOLD}❯ $prompt${NC} ${YELLOW}[y/N]${NC}: "
  fi
  
  read -r response
  response=${response:-$default}
  
  if [[ "$response" =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

set -e
LOG_FILE="billwise_setup.log"
exec > >(tee -a $LOG_FILE) 2>&1

# ==============================
# SELF-UPDATE MECHANISM
# ==============================
SCRIPT_URL="https://raw.githubusercontent.com/nileshpatil0529/BillWise/main/BillWise_setup.sh"
SCRIPT_NAME="BillWise_setup.sh"

# Check if script should update itself
if [ "$1" != "--skip-update" ]; then
  echo -e "${BLUE}ℹ${NC}  Checking for script updates..."
  
  # Remove old script if exists
  if [ -f "${SCRIPT_NAME}.tmp" ]; then
    rm -f "${SCRIPT_NAME}.tmp"
  fi
  
  # Download latest version
  if wget -q "$SCRIPT_URL" -O "${SCRIPT_NAME}.tmp"; then
    # Check if download was successful and file is not empty
    if [ -s "${SCRIPT_NAME}.tmp" ]; then
      # Compare with current script
      if ! cmp -s "${SCRIPT_NAME}.tmp" "$0"; then
        echo -e "${GREEN}✓${NC}  New version found, updating..."
        chmod +x "${SCRIPT_NAME}.tmp"
        mv "${SCRIPT_NAME}.tmp" "$SCRIPT_NAME"
        echo -e "${GREEN}✓${NC}  Script updated, restarting..."
        exec ./"$SCRIPT_NAME" --skip-update "$@"
      else
        echo -e "${GREEN}✓${NC}  Already running latest version"
        rm -f "${SCRIPT_NAME}.tmp"
      fi
    else
      echo -e "${YELLOW}⚠${NC}  Update check failed, continuing with current version"
      rm -f "${SCRIPT_NAME}.tmp"
    fi
  else
    echo -e "${YELLOW}⚠${NC}  Could not check for updates, continuing with current version"
    rm -f "${SCRIPT_NAME}.tmp"
  fi
fi

echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║                                                   ║${NC}"
echo -e "${BOLD}${CYAN}║          🍽️  BillWise Setup Wizard 🍽️           ║${NC}"
echo -e "${BOLD}${CYAN}║                                                   ║${NC}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Git Setup
section "📦 GIT SETUP"
if ! command -v git &> /dev/null; then
  log_step "Installing Git..."
  sudo apt update -qq && sudo apt install -y git -qq && log_success "Git installed"
else
  log_success "Git already installed"
fi

if [ -d "BillWise" ]; then
  if confirm "Repository exists. Pull latest changes?"; then
    log_step "Pulling latest changes..."
    cd BillWise && git pull && cd ..
    log_success "Repository updated"
  else
    log_info "Skipping git pull"
  fi
else
  log_step "Cloning repository..."
  git clone https://github.com/nileshpatil0529/BillWise.git && log_success "Repository cloned"
fi

cd BillWise

# 2. Node Setup
section "⚙️  NODE.JS SETUP"
if ! command -v node &> /dev/null; then
  log_step "Installing Node.js 18.x..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - > /dev/null 2>&1
  sudo apt install -y nodejs -qq && log_success "Node.js installed"
else
  NODE_VER=$(node -v)
  log_success "Node.js already installed ${CYAN}$NODE_VER${NC}"
fi

# 3. Dependencies & Build
section "📦 DEPENDENCIES & BUILD"

# biller-mobile-app
if confirm "Install packages for biller-mobile-app?"; then
  log_step "Installing mobile app dependencies..."
  cd biller-mobile-app && npm install --silent && log_success "Mobile app dependencies installed" && cd ..
else
  log_info "Skipping mobile app dependencies"
fi

if confirm "Build biller-mobile-app?"; then
  log_step "Building mobile app (this may take a moment)..."
  cd biller-mobile-app
  npm run build > /dev/null 2>&1 || npm run build --if-present > /dev/null 2>&1 || log_error "Build failed"
  cd ..
  log_success "Mobile app built and copied to biller-server/public"
else
  log_info "Skipping mobile app build"
fi

# biller-app
if confirm "Install packages for biller-app?" "N"; then
  log_step "Installing web app dependencies..."
  cd biller-app && npm install --silent && log_success "Web app dependencies installed" && cd ..
else
  log_info "Skipping web app dependencies"
fi

# biller-server
if confirm "Install packages for biller-server?"; then
  log_step "Installing server dependencies..."
  cd biller-server && npm install --silent && log_success "Server dependencies installed" && cd ..
else
  log_info "Skipping server dependencies"
fi

# Environment Setup
section "🔧 ENVIRONMENT SETUP"
if [ ! -f "biller-server/.env" ]; then
  log_step "Creating environment configuration..."
  cp biller-server/.env.example biller-server/.env
  log_success "Environment file created"
else
  log_success "Environment file already exists"
fi

# Configure PRINTER_INTERFACE in .env
if ! grep -q "PRINTER_INTERFACE=" biller-server/.env; then
  echo "PRINTER_INTERFACE=/dev/usb/lp0" >> biller-server/.env
  log_success "Printer interface configured"
elif ! grep -q "PRINTER_INTERFACE=/dev/usb/lp0" biller-server/.env; then
  sed -i 's|PRINTER_INTERFACE=.*|PRINTER_INTERFACE=/dev/usb/lp0|g' biller-server/.env
  log_success "Printer interface updated"
fi

# Printer Setup
section "🖨️  PRINTER SETUP"

# Check if user is already in printer groups
if groups $USER | grep -q '\blp\b' && groups $USER | grep -q '\bdialout\b'; then
  log_success "User already in printer groups ${CYAN}(lp, dialout)${NC}"
  GROUPS_CONFIGURED=true
else
  GROUPS_CONFIGURED=false
fi

# Check if udev rule exists
if [ -f "/etc/udev/rules.d/99-usb-printer.rules" ]; then
  log_success "Printer udev rules already configured"
  UDEV_CONFIGURED=true
else
  UDEV_CONFIGURED=false
fi

# Check if printer device exists
if [ -e "/dev/usb/lp0" ]; then
  log_success "Printer device detected ${CYAN}/dev/usb/lp0${NC}"
  
  # Configure if not already done
  if [ "$GROUPS_CONFIGURED" = false ] || [ "$UDEV_CONFIGURED" = false ]; then
    log_step "Configuring printer permissions..."
    
    # Add user to printer groups
    if [ "$GROUPS_CONFIGURED" = false ]; then
      sudo usermod -a -G lp $USER
      sudo usermod -a -G dialout $USER
      log_success "User added to printer groups"
    fi
    
    # Create udev rule
    if [ "$UDEV_CONFIGURED" = false ]; then
      sudo bash -c 'cat > /etc/udev/rules.d/99-usb-printer.rules' <<EOF
SUBSYSTEM=="usb", MODE="0666", GROUP="lp"
SUBSYSTEM=="usbmisc", MODE="0666", GROUP="lp"
KERNEL=="lp[0-9]*", MODE="0666", GROUP="lp"
EOF
      
      # Reload udev rules
      sudo udevadm control --reload-rules > /dev/null 2>&1
      sudo udevadm trigger > /dev/null 2>&1
      log_success "Udev rules configured"
    fi
    
    # Apply immediate permissions
    sudo chmod 666 /dev/usb/lp0
    
    log_success "Printer setup completed"
    log_warn "Note: Log out and log back in for group changes to take effect"
  else
    log_success "Printer already configured"
  fi
else
  log_warn "Printer device not found ${CYAN}/dev/usb/lp0${NC}"
  log_info "Connect printer and run: ${BOLD}sudo chmod 666 /dev/usb/lp0${NC}"
fi

# 4. Systemd Service for Server
section "🔄 SYSTEMD SERVICE"
SERVICE_FILE="/etc/systemd/system/billwise.service"
if [ ! -f "$SERVICE_FILE" ]; then
  log_step "Creating systemd service..."
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
  sudo systemctl enable billwise > /dev/null 2>&1
  sudo systemctl start billwise
  log_success "Systemd service created and started"
else
  log_success "Systemd service already exists"
fi

# Ask to restart server if code changed
if confirm "Restart BillWise server now?"; then
  log_step "Restarting server..."
  sudo systemctl restart billwise
  log_success "BillWise server restarted"
else
  log_info "Skipping server restart"
fi

# 5. Nginx Setup
section "🌐 NGINX SETUP"
if ! command -v nginx &> /dev/null; then
  log_step "Installing Nginx..."
  sudo apt install -y nginx -qq && log_success "Nginx installed"
else
  log_success "Nginx already installed"
fi

NGINX_CONF="/etc/nginx/sites-available/billwise"
if [ ! -f "$NGINX_CONF" ]; then
  log_step "Configuring Nginx for ${CYAN}billwise.site${NC}..."
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
  sudo nginx -t > /dev/null 2>&1 && sudo systemctl restart nginx
  log_success "Nginx configured for billwise.site"
else
  log_success "Nginx already configured"
fi

# 6. Cloudflare Tunnel Setup
section "☁️  CLOUDFLARE TUNNEL"
if ! command -v cloudflared &> /dev/null; then
  log_step "Installing Cloudflare Tunnel..."
  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
  sudo dpkg -i cloudflared-linux-arm64.deb > /dev/null 2>&1 || sudo apt install -f -y -qq
  rm -f cloudflared-linux-arm64.deb
  log_success "Cloudflare Tunnel installed"
else
  log_success "Cloudflare Tunnel already installed"
fi

TUNNEL_ID="c6bc768e-061c-40c8-940c-0124b45f7314"
CRED_FILE="/etc/cloudflared/$TUNNEL_ID.json"

if [ ! -f "$CRED_FILE" ]; then
  log_warn "Manual Cloudflare login required"
  log_info "Follow the prompts to authenticate..."
  sudo mkdir -p /etc/cloudflared
  cloudflared tunnel login
  cloudflared tunnel create billwise
  if [ -f "$HOME/.cloudflared/$TUNNEL_ID.json" ]; then
    sudo cp "$HOME/.cloudflared/$TUNNEL_ID.json" "$CRED_FILE"
    log_success "Tunnel credentials configured"
  fi
else
  log_success "Tunnel credentials already exist"
fi

if [ -f "/etc/systemd/system/cloudflared.service" ]; then
  log_success "Cloudflared service already installed"
else
  log_step "Configuring Cloudflare tunnel service..."
  sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: billwise.site
    service: http://localhost:3000
  - service: http_status:404
EOF

  sudo cloudflared service install > /dev/null 2>&1
  log_success "Cloudflare tunnel configured and running"
fi

section "✅ SETUP COMPLETE"
echo ""
echo -e "  ${GREEN}✓${NC} ${BOLD}BillWise deployed successfully!${NC} 🎉"
echo ""
echo -e "  ${CYAN}▶${NC} Server running at: ${BOLD}http://localhost:3000${NC}"
echo -e "  ${CYAN}▶${NC} Public URL: ${BOLD}https://billwise.site${NC}"
echo ""
echo -e "  ${YELLOW}⚠${NC} Remember to logout/login for printer permissions"
echo ""
