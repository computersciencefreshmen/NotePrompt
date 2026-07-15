#!/usr/bin/env bash
# Secure host bootstrap only. Application release steps live in DEPLOY.md.

set -euo pipefail

PROJECT_DIR="/opt/note-prompt"
SECRET_DIR="/opt/note-prompt-secrets"
TLS_DIR="${SECRET_DIR}/tls"
CERTBOT_WEBROOT="/opt/note-prompt-certbot/www"
DEPLOY_USER="${SUDO_USER:-${USER:-}}"

if [ -z "${DEPLOY_USER}" ]; then
    echo "Cannot determine the non-root deployment user" >&2
    exit 1
fi

echo "[1/5] Installing host prerequisites..."
sudo yum install -y yum-utils git wget curl certbot

echo "[2/5] Installing and enabling Docker Engine..."
if ! command -v docker >/dev/null 2>&1; then
    sudo yum install -y docker
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "${DEPLOY_USER}"

echo "[3/5] Ensuring Docker Compose v2 is available..."
if ! docker compose version >/dev/null 2>&1; then
    sudo yum install -y docker-compose-plugin
fi
docker compose version

echo "[4/5] Creating restricted deployment directories..."
DEPLOY_GROUP="$(id -gn "${DEPLOY_USER}")"
sudo install -d -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 0750 "${PROJECT_DIR}"
sudo install -d -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 0700 "${SECRET_DIR}" "${TLS_DIR}"
sudo install -d -o root -g root -m 0755 "${CERTBOT_WEBROOT}"
if [ ! -e "${SECRET_DIR}/runtime.env" ]; then
    sudo install -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 0600 /dev/null "${SECRET_DIR}/runtime.env"
fi
sudo chown "${DEPLOY_USER}:${DEPLOY_GROUP}" "${SECRET_DIR}/runtime.env"
sudo chmod 0600 "${SECRET_DIR}/runtime.env"

echo "[5/5] Restricting the host firewall..."
sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true
sudo firewall-cmd --permanent --add-service=https 2>/dev/null || true
sudo firewall-cmd --permanent --remove-port=3306/tcp 2>/dev/null || true
sudo firewall-cmd --permanent --remove-port=6379/tcp 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true

echo
echo "Host bootstrap complete. Log in again for Docker group membership."
echo "Next: follow DEPLOY.md to create a non-root database account, inject"
echo "runtime secrets, install a real TLS certificate, and build by commit SHA."
