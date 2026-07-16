#!/usr/bin/env bash
# Read-only production reachability checks. This script intentionally avoids
# container logs, environment dumps, and expanded Compose configuration.

set -u

TLS_DIR="${TLS_DIR:-/opt/note-prompt-secrets/tls}"

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
if sudo test -s "${TLS_DIR}/fullchain.pem"; then
    sudo openssl x509 -in "${TLS_DIR}/fullchain.pem" \
        -noout -subject -dates -checkend 0 || true
else
    echo "TLS certificate is missing or empty"
fi
if sudo test -s "${TLS_DIR}/privkey.pem"; then
    echo "TLS private key is present"
else
    echo "TLS private key is missing or empty"
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
