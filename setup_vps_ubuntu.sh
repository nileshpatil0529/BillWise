#!/usr/bin/env bash

set -euo pipefail

APP_NAME="billwise-server"
DEFAULT_PORT="3000"

usage() {
  cat <<'EOF'
Usage:
  bash setup_vps_ubuntu.sh

Optional environment variables for non-interactive mode:
  PROJECT_ROOT
  HOST_NAME
  SERVER_PORT
  NODE_MAJOR
  ADMIN_EMAIL
  ADMIN_PASSWORD
  JWT_SECRET
  LETSENCRYPT_EMAIL

Example:
  HOST_NAME=app.example.com ADMIN_PASSWORD='StrongPass@123' bash setup_vps_ubuntu.sh
EOF
}

log() {
  printf "\n[INFO] %s\n" "$1"
}

warn() {
  printf "\n[WARN] %s\n" "$1"
}

err() {
  printf "\n[ERROR] %s\n" "$1"
}

prompt() {
  local var_name="$1"
  local label="$2"
  local default_value="${3:-}"
  local secret="${4:-false}"
  local value=""

  if [ -n "$default_value" ]; then
    if [ "$secret" = "true" ]; then
      read -r -s -p "$label [hidden, press Enter to keep default]: " value
      echo
      if [ -z "$value" ]; then
        value="$default_value"
      fi
    else
      read -r -p "$label [$default_value]: " value
      value="${value:-$default_value}"
    fi
  else
    if [ "$secret" = "true" ]; then
      read -r -s -p "$label: " value
      echo
    else
      read -r -p "$label: " value
    fi
  fi

  printf -v "$var_name" "%s" "$value"
}

maybe_prompt() {
  local var_name="$1"
  local label="$2"
  local default_value="${3:-}"
  local secret="${4:-false}"

  local current_value="${!var_name:-}"
  if [ -n "$current_value" ]; then
    return
  fi

  prompt "$var_name" "$label" "$default_value" "$secret"
}

is_ip() {
  local host="$1"
  if [[ "$host" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    return 0
  fi
  return 1
}

require_sudo() {
  if ! sudo -n true 2>/dev/null; then
    warn "This script needs sudo access. You may be prompted for password."
    sudo true
  fi
}

install_nodejs() {
  local target_major="$1"

  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node -v | sed 's/v//' | cut -d'.' -f1)"
    if [ "$current_major" = "$target_major" ]; then
      log "Node.js v$target_major already installed"
      return
    fi
    warn "Node.js major version is $current_major, target is $target_major. Upgrading."
  fi

  curl -fsSL "https://deb.nodesource.com/setup_${target_major}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
}

setup_env_file() {
  local server_dir="$1"
  local port="$2"
  local cors_origin="$3"
  local admin_email="$4"
  local admin_password="$5"
  local jwt_secret="$6"

  local env_file="$server_dir/.env"

  if [ -f "$env_file" ]; then
    cp "$env_file" "$env_file.bak.$(date +%Y%m%d%H%M%S)"
    log "Existing .env backed up"
  fi

  cat > "$env_file" <<EOF
NODE_ENV=production
PORT=$port
JWT_SECRET=$jwt_secret
JWT_EXPIRES_IN=24h
ADMIN_EMAIL=$admin_email
ADMIN_PASSWORD=$admin_password
CORS_ORIGIN=$cors_origin
EOF

  log ".env configured at $env_file"
}

write_nginx_http_only() {
  local host="$1"
  local port="$2"
  local conf_file="$3"

  sudo tee "$conf_file" >/dev/null <<EOF
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name $host;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:$port/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
}

write_nginx_https_ip_self_signed() {
  local host="$1"
  local port="$2"
  local conf_file="$3"

  sudo mkdir -p /etc/ssl/billwise
  if [ ! -f /etc/ssl/billwise/selfsigned.crt ] || [ ! -f /etc/ssl/billwise/selfsigned.key ]; then
    sudo openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
      -keyout /etc/ssl/billwise/selfsigned.key \
      -out /etc/ssl/billwise/selfsigned.crt \
      -subj "/CN=$host"
  fi

  sudo tee "$conf_file" >/dev/null <<EOF
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name $host;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $host;

    ssl_certificate /etc/ssl/billwise/selfsigned.crt;
    ssl_certificate_key /etc/ssl/billwise/selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:$port/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
}

main() {
  if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage
    exit 0
  fi

  log "BillWise Ubuntu VPS setup started"

  require_sudo

  local cwd
  cwd="$(pwd)"

  maybe_prompt PROJECT_ROOT "Project root path (contains biller-server, biller-app, biller-mobile-app)" "$cwd"
  PROJECT_ROOT="${PROJECT_ROOT%/}"

  local SERVER_DIR="$PROJECT_ROOT/biller-server"
  local DESKTOP_DIR="$PROJECT_ROOT/biller-app"
  local MOBILE_DIR="$PROJECT_ROOT/biller-mobile-app"

  if [ ! -d "$SERVER_DIR" ] || [ ! -d "$DESKTOP_DIR" ] || [ ! -d "$MOBILE_DIR" ]; then
    err "Could not find expected folders under $PROJECT_ROOT"
    err "Expected: biller-server, biller-app, biller-mobile-app"
    exit 1
  fi

  maybe_prompt HOST_NAME "Domain or VPS IP for access (example: app.example.com or 1.2.3.4)"
  maybe_prompt SERVER_PORT "Backend port" "$DEFAULT_PORT"
  maybe_prompt NODE_MAJOR "Node.js major version" "20"

  local default_admin_email="admin@$HOST_NAME"
  maybe_prompt ADMIN_EMAIL "Admin email" "$default_admin_email"
  maybe_prompt ADMIN_PASSWORD "Admin password" "Admin@123" true

  local default_jwt
  if command -v openssl >/dev/null 2>&1; then
    default_jwt="$(openssl rand -hex 32)"
  else
    default_jwt="change-this-secret"
  fi
  maybe_prompt JWT_SECRET "JWT secret" "$default_jwt" true

  local LETSENCRYPT_EMAIL=""
  local USE_DOMAIN_SSL="false"
  if is_ip "$HOST_NAME"; then
    warn "IP detected. Script will configure self-signed HTTPS certificate."
    warn "Browser will show certificate warning unless manually trusted."
  else
    USE_DOMAIN_SSL="true"
    maybe_prompt LETSENCRYPT_EMAIL "Email for Let's Encrypt" "$ADMIN_EMAIL"
  fi

  log "Installing system packages"
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg nginx git ufw certbot python3-certbot-nginx

  log "Installing Node.js"
  install_nodejs "$NODE_MAJOR"

  log "Installing PM2"
  sudo npm install -g pm2

  log "Installing project dependencies"
  cd "$DESKTOP_DIR"
  npm install
  cd "$MOBILE_DIR"
  npm install
  cd "$SERVER_DIR"
  npm install

  log "Building desktop and mobile production bundles"
  npm run build:prod

  local cors_origin
  if is_ip "$HOST_NAME"; then
    cors_origin="https://$HOST_NAME"
  else
    cors_origin="https://$HOST_NAME"
  fi

  log "Creating server environment file"
  setup_env_file "$SERVER_DIR" "$SERVER_PORT" "$cors_origin" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$JWT_SECRET"

  log "Starting server with PM2"
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start "$SERVER_DIR/src/app.js" --name "$APP_NAME" --time
  fi

  pm2 save
  sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/tmp/pm2_startup_cmd.txt || true

  log "Configuring Nginx"
  local conf_file="/etc/nginx/sites-available/billwise"

  if is_ip "$HOST_NAME"; then
    write_nginx_https_ip_self_signed "$HOST_NAME" "$SERVER_PORT" "$conf_file"
  else
    write_nginx_http_only "$HOST_NAME" "$SERVER_PORT" "$conf_file"
  fi

  sudo ln -sf "$conf_file" /etc/nginx/sites-enabled/billwise
  if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi

  sudo nginx -t
  sudo systemctl reload nginx

  if [ "$USE_DOMAIN_SSL" = "true" ]; then
    log "Issuing Let's Encrypt certificate"
    sudo certbot --nginx -d "$HOST_NAME" -m "$LETSENCRYPT_EMAIL" --agree-tos --non-interactive --redirect
    sudo systemctl reload nginx
  fi

  log "Configuring firewall"
  sudo ufw allow OpenSSH || true
  sudo ufw allow 'Nginx Full' || true
  sudo ufw --force enable || true

  local health_url
  if is_ip "$HOST_NAME"; then
    health_url="https://$HOST_NAME/api/health"
    log "Checking health endpoint (self-signed cert expected)"
    curl -k -I "$health_url" || true
  else
    health_url="https://$HOST_NAME/api/health"
    log "Checking health endpoint"
    curl -I "$health_url" || true
  fi

  log "Setup complete"
  echo
  echo "Open: https://$HOST_NAME"
  echo "API health: $health_url"
  echo "PM2 logs: pm2 logs $APP_NAME"
  if is_ip "$HOST_NAME"; then
    echo "Note: IP HTTPS uses self-signed certificate by default."
  fi
}

main "$@"
