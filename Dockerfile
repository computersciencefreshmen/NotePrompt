# syntax=docker/dockerfile:1.7

# The default image is pinned by manifest digest for reproducible builds.
# Override NODE_IMAGE only through a reviewed dependency-update change.
ARG NODE_IMAGE=node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# The standalone output intentionally contains only modules found by Next's
# static tracer. OCR is launched as a separate Node process, so keep a pruned,
# deterministic production dependency tree for that runtime path.
FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runner

# Runtime document extraction is fully local: no production OCR language-pack
# download and no Windows-only PDF binary assumptions.
RUN apk add --no-cache \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-chi_sim

# The final container executes Node directly and never installs packages.
# Remove npm/npx from the runtime layer to shrink the attack surface and keep
# vulnerabilities in package-manager-only dependencies out of production.
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx
RUN test ! -e /usr/local/lib/node_modules/npm \
    && ! command -v npm \
    && ! command -v npx

ARG APP_VERSION=unknown
LABEL org.opencontainers.image.title="Note Prompt" \
      org.opencontainers.image.revision="${APP_VERSION}"

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    PDFTOTEXT_PATH=/usr/bin/pdftotext \
    TESSERACT_PATH=/usr/bin/tesseract

# The official Node image already provides the unprivileged `node` user. Keep
# application code root-owned; only explicit tmpfs mounts are writable at run time.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts/ocr-image.cjs ./scripts/ocr-image.cjs
COPY --from=builder /app/scripts/mysql-migrate.cjs ./scripts/mysql-migrate.cjs
COPY --from=builder /app/scripts/lib ./scripts/lib
COPY --from=builder /app/database/migrations ./database/migrations
COPY --from=builder /app/database/schema-requirements.json ./database/schema-requirements.json

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM

CMD ["node", "server.js"]
