#!/usr/bin/env bash
# Install a successfully renewed Note Prompt certificate into the Docker bind
# mount and reload only the expected Compose Nginx service.

set -euo pipefail

EXPECTED_DOMAINS=("noteprompt.cn" "www.noteprompt.cn")
DEFAULT_LINEAGE="/etc/letsencrypt/live/noteprompt.cn"
TLS_DIR="${NOTE_PROMPT_TLS_DIR:-/opt/note-prompt-secrets/tls}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-note-prompt}"
MIN_VALIDITY_SECONDS="${MIN_VALIDITY_SECONDS:-604800}"

log() {
    printf '[note-prompt-cert] %s\n' "$*"
}

fail() {
    printf '[note-prompt-cert] ERROR: %s\n' "$*" >&2
    exit 1
}

if [ "$(id -u)" -ne 0 ]; then
    fail "the deploy hook must run as root"
fi

for command_name in dirname docker flock grep install mktemp openssl sed stat tr; do
    command -v "${command_name}" >/dev/null 2>&1 || \
        fail "required command is unavailable: ${command_name}"
done

case "${MIN_VALIDITY_SECONDS}" in
    ''|*[!0-9]*) fail "MIN_VALIDITY_SECONDS must be a non-negative integer" ;;
esac
case "${COMPOSE_PROJECT_NAME}" in
    ''|*[!a-zA-Z0-9_.-]*) fail "COMPOSE_PROJECT_NAME contains unsupported characters" ;;
esac
case "${TLS_DIR}" in
    /*) ;;
    *) fail "NOTE_PROMPT_TLS_DIR must be an absolute path" ;;
esac

LINEAGE="${RENEWED_LINEAGE:-${DEFAULT_LINEAGE}}"
case "${LINEAGE}" in
    /*) ;;
    *) fail "RENEWED_LINEAGE must be an absolute path" ;;
esac

SOURCE_CERT="${LINEAGE}/fullchain.pem"
SOURCE_KEY="${LINEAGE}/privkey.pem"

[ -s "${SOURCE_CERT}" ] || fail "renewed fullchain.pem is missing or empty"
[ -s "${SOURCE_KEY}" ] || fail "renewed privkey.pem is missing or empty"

SOURCE_SANS="$(openssl x509 -in "${SOURCE_CERT}" -noout -ext subjectAltName 2>/dev/null)" || \
    fail "renewed fullchain.pem is not a readable X.509 certificate"

san_contains_exact_domain() {
    local sans="$1"
    local domain="$2"

    printf '%s\n' "${sans}" |
        tr ',' '\n' |
        sed 's/^[[:space:]]*//; s/[[:space:]]*$//' |
        grep -Fxq "DNS:${domain}"
}

# Certbot executes directory hooks for every renewed lineage. Unrelated
# certificates must not replace the Note Prompt edge certificate.
if ! san_contains_exact_domain "${SOURCE_SANS}" "noteprompt.cn"; then
    log "renewed lineage does not cover noteprompt.cn; skipping"
    exit 0
fi

validate_pair() {
    local certificate="$1"
    local private_key="$2"
    local sans cert_public_key key_public_key domain

    openssl x509 -in "${certificate}" -noout >/dev/null 2>&1 || return 1
    openssl pkey -in "${private_key}" -noout >/dev/null 2>&1 || return 1
    openssl x509 -in "${certificate}" -noout \
        -checkend "${MIN_VALIDITY_SECONDS}" >/dev/null 2>&1 || return 1

    sans="$(openssl x509 -in "${certificate}" -noout -ext subjectAltName 2>/dev/null)" || return 1
    for domain in "${EXPECTED_DOMAINS[@]}"; do
        san_contains_exact_domain "${sans}" "${domain}" || return 1
    done

    cert_public_key="$(
        openssl x509 -in "${certificate}" -pubkey -noout 2>/dev/null |
            openssl pkey -pubin -outform DER 2>/dev/null |
            openssl dgst -sha256 2>/dev/null
    )" || return 1
    key_public_key="$(
        openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
            openssl dgst -sha256 2>/dev/null
    )" || return 1

    [ -n "${cert_public_key}" ] && [ "${cert_public_key}" = "${key_public_key}" ]
}

validate_pair "${SOURCE_CERT}" "${SOURCE_KEY}" || \
    fail "renewed certificate failed validity, SAN, or private-key matching checks"

TLS_PARENT="$(dirname -- "${TLS_DIR}")"
if [ -L "${TLS_PARENT}" ] || [ -L "${TLS_DIR}" ]; then
    fail "TLS parent and target directories must not be symbolic links"
fi
install -d -o root -m 0750 "${TLS_PARENT}" "${TLS_DIR}"

for secure_directory in "${TLS_PARENT}" "${TLS_DIR}"; do
    DIRECTORY_UID="$(stat -c '%u' "${secure_directory}")"
    DIRECTORY_MODE="$(stat -c '%a' "${secure_directory}")"
    [ "${DIRECTORY_UID}" -eq 0 ] || \
        fail "certificate directory must be owned by root: ${secure_directory}"
    if (( (8#${DIRECTORY_MODE} & 0022) != 0 )); then
        fail "certificate directory must not be writable by group or others: ${secure_directory}"
    fi
done

[ -d /run/lock ] || fail "/run/lock is unavailable"
[ ! -L /run/lock/note-prompt-certbot-deploy.lock ] || \
    fail "certificate deployment lock must not be a symbolic link"
exec 9>/run/lock/note-prompt-certbot-deploy.lock
flock -n 9 || fail "another certificate deployment is already running"

TEMP_CERT="$(mktemp "${TLS_DIR}/.fullchain.pem.XXXXXX")"
TEMP_KEY="$(mktemp "${TLS_DIR}/.privkey.pem.XXXXXX")"
BACKUP_DIR="$(mktemp -d "${TLS_DIR}/.previous.XXXXXX")"
HAD_CERT=0
HAD_KEY=0

cleanup() {
    rm -f "${TEMP_CERT}" "${TEMP_KEY}"
    rm -rf "${BACKUP_DIR}"
}
trap cleanup EXIT

install -m 0644 "${SOURCE_CERT}" "${TEMP_CERT}"
install -m 0600 "${SOURCE_KEY}" "${TEMP_KEY}"
validate_pair "${TEMP_CERT}" "${TEMP_KEY}" || \
    fail "staged certificate files failed validation"

if [ -e "${TLS_DIR}/fullchain.pem" ]; then
    install -m 0644 "${TLS_DIR}/fullchain.pem" "${BACKUP_DIR}/fullchain.pem"
    HAD_CERT=1
fi
if [ -e "${TLS_DIR}/privkey.pem" ]; then
    install -m 0600 "${TLS_DIR}/privkey.pem" "${BACKUP_DIR}/privkey.pem"
    HAD_KEY=1
fi

restore_previous_pair() {
    if [ "${HAD_CERT}" -eq 1 ]; then
        install -m 0644 "${BACKUP_DIR}/fullchain.pem" "${TLS_DIR}/fullchain.pem"
    else
        rm -f "${TLS_DIR}/fullchain.pem"
    fi
    if [ "${HAD_KEY}" -eq 1 ]; then
        install -m 0600 "${BACKUP_DIR}/privkey.pem" "${TLS_DIR}/privkey.pem"
    else
        rm -f "${TLS_DIR}/privkey.pem"
    fi
}

mv -f "${TEMP_CERT}" "${TLS_DIR}/fullchain.pem"
mv -f "${TEMP_KEY}" "${TLS_DIR}/privkey.pem"

NGINX_CONTAINERS=()
while IFS= read -r container_id; do
    [ -n "${container_id}" ] && NGINX_CONTAINERS+=("${container_id}")
done < <(
    docker ps \
        --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
        --filter "label=com.docker.compose.service=nginx" \
        --format '{{.ID}}'
)

if [ "${#NGINX_CONTAINERS[@]}" -eq 0 ]; then
    log "certificate installed; the application Nginx container is not running and will load it on next start"
    exit 0
fi
if [ "${#NGINX_CONTAINERS[@]}" -ne 1 ]; then
    fail "expected exactly one running application Nginx container"
fi

NGINX_CONTAINER="${NGINX_CONTAINERS[0]}"
if ! docker exec "${NGINX_CONTAINER}" nginx -t; then
    restore_previous_pair
    docker exec "${NGINX_CONTAINER}" nginx -t >/dev/null 2>&1 || true
    fail "Nginx rejected the renewed files; the previous certificate was restored"
fi

if ! docker kill --signal=HUP "${NGINX_CONTAINER}" >/dev/null; then
    fail "renewed certificate is installed, but Nginx reload failed"
fi

log "certificate installed and Nginx reloaded successfully"
