#!/usr/bin/env bash
# Read-only production reachability checks. This script intentionally avoids
# container logs, environment dumps, and expanded Compose configuration.

set -u

TLS_DIR="${TLS_DIR:-/opt/note-prompt-secrets/tls}"
CERTBOT_LINEAGE="${CERTBOT_LINEAGE:-/etc/letsencrypt/live/noteprompt.cn}"
CERTBOT_RENEWAL_CONFIG="${CERTBOT_RENEWAL_CONFIG:-/etc/letsencrypt/renewal/noteprompt.cn.conf}"
TLS_DOMAIN="${TLS_DOMAIN:-noteprompt.cn}"

echo "== Host clock =="
date -u '+UTC now: %Y-%m-%dT%H:%M:%SZ'
if command -v timedatectl >/dev/null 2>&1; then
    timedatectl show --property=NTPSynchronized --property=Timezone || true
else
    echo "timedatectl is unavailable"
fi

echo
echo "== Certbot renewal scheduling =="
if command -v systemctl >/dev/null 2>&1; then
    systemctl list-timers --all --no-pager 2>/dev/null | grep -i certbot || \
        echo "No Certbot timer is visible"
else
    echo "systemctl is unavailable"
fi
if command -v certbot >/dev/null 2>&1; then
    sudo certbot certificates || true
else
    echo "certbot is unavailable"
fi
if sudo test -r "${CERTBOT_RENEWAL_CONFIG}"; then
    echo "Renewal method:"
    sudo awk -F= '
        /^[[:space:]]*(authenticator|webroot_path)[[:space:]]*=/ {
            key=$1; value=$2
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            print key "=" value
        }
    ' "${CERTBOT_RENEWAL_CONFIG}"
else
    echo "Certbot renewal configuration is missing or unreadable"
fi

echo
echo "== Host listeners (80/443) =="
if command -v ss >/dev/null 2>&1; then
    sudo ss -lntp '( sport = :80 or sport = :443 )' || true
else
    echo "ss is unavailable"
fi

echo
echo "== Container state =="
if command -v docker >/dev/null 2>&1; then
    docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
    docker network inspect mysql8_default --format '{{.Name}}' 2>/dev/null || \
        echo "Docker network mysql8_default is missing or inaccessible"
else
    echo "Docker is unavailable"
fi

echo
echo "== Firewalld state =="
if command -v firewall-cmd >/dev/null 2>&1; then
    sudo firewall-cmd --state || true
    sudo firewall-cmd --get-active-zones || true
    sudo firewall-cmd --list-all || true
else
    echo "firewall-cmd is unavailable"
fi

echo
echo "== TLS material =="
SOURCE_FINGERPRINT=""
MOUNTED_FINGERPRINT=""
if sudo test -s "${CERTBOT_LINEAGE}/fullchain.pem"; then
    echo "Certbot source certificate:"
    sudo openssl x509 -in "${CERTBOT_LINEAGE}/fullchain.pem" \
        -noout -subject -issuer -dates -fingerprint -sha256 -checkend 0 || true
    SOURCE_FINGERPRINT="$(sudo openssl x509 -in "${CERTBOT_LINEAGE}/fullchain.pem" -noout -fingerprint -sha256 2>/dev/null || true)"
else
    echo "Certbot source certificate is missing or empty"
fi
if sudo test -s "${TLS_DIR}/fullchain.pem"; then
    echo "Docker-mounted certificate copy:"
    sudo openssl x509 -in "${TLS_DIR}/fullchain.pem" \
        -noout -subject -issuer -dates -fingerprint -sha256 -checkend 0 || true
    MOUNTED_FINGERPRINT="$(sudo openssl x509 -in "${TLS_DIR}/fullchain.pem" -noout -fingerprint -sha256 2>/dev/null || true)"
else
    echo "TLS certificate is missing or empty"
fi
if sudo test -s "${TLS_DIR}/privkey.pem"; then
    echo "TLS private key is present"
else
    echo "TLS private key is missing or empty"
fi

if [ -n "${SOURCE_FINGERPRINT}" ] && [ -n "${MOUNTED_FINGERPRINT}" ]; then
    if [ "${SOURCE_FINGERPRINT}" = "${MOUNTED_FINGERPRINT}" ]; then
        echo "Certbot source and Docker-mounted certificate match"
    else
        echo "STALE COPY: Certbot source and Docker-mounted certificate differ"
    fi
fi

echo
echo "== Certificate currently served on local port 443 =="
if command -v timeout >/dev/null 2>&1; then
    SERVED_CERTIFICATE_PEM="$(
        timeout 8 openssl s_client \
            -connect 127.0.0.1:443 -servername "${TLS_DOMAIN}" </dev/null 2>/dev/null |
            openssl x509 -outform PEM 2>/dev/null || true
    )"
    if [ -n "${SERVED_CERTIFICATE_PEM}" ]; then
        printf '%s\n' "${SERVED_CERTIFICATE_PEM}" |
            openssl x509 -noout -subject -issuer -dates -fingerprint -sha256 || true
        SERVED_FINGERPRINT="$(
            printf '%s\n' "${SERVED_CERTIFICATE_PEM}" |
                openssl x509 -noout -fingerprint -sha256 2>/dev/null || true
        )"
        if [ -n "${MOUNTED_FINGERPRINT}" ] && \
            [ "${SERVED_FINGERPRINT}" != "${MOUNTED_FINGERPRINT}" ]; then
            echo "STALE SERVED CERT: local port 443 differs from the Docker-mounted certificate"
        fi
    else
        echo "No certificate could be read from local port 443"
    fi
else
    echo "timeout is unavailable; served-certificate probe skipped"
fi

echo
echo "== Local HTTP reachability =="
for url in http://127.0.0.1/ https://127.0.0.1/; do
    if curl --insecure --fail --silent --show-error --max-time 5 \
        --output /dev/null "${url}"; then
        echo "reachable: ${url}"
    else
        echo "unreachable: ${url}"
    fi
done

echo
echo "If listeners and local probes are healthy but the public site is not,"
echo "verify the Alibaba Cloud security-group ingress rules for TCP 80 and 443."
