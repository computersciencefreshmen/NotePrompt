const {Client} = require('ssh2');
const conn = new Client();

function execCmd(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
      stream.on('close', (code) => resolve({ out, code }));
    });
  });
}

function log(msg) { console.log(`\n[${new Date().toLocaleTimeString()}] ${msg}`); }

async function run(conn, cmd, label) {
  log(label);
  const r = await execCmd(conn, cmd);
  console.log(r.out.substring(0, 2000));
  if (r.code !== 0 && r.code !== null) console.log(`[exit: ${r.code}]`);
  return r;
}

function writeFileSftp(conn, path, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(path, content, 'utf8', (err) => {
        sftp.end();
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

// ===================== NGINX CONFIG - HARDENED =====================
const nginxConf = `
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    upstream note_prompt_app {
        server note-prompt-app:3000;
        keepalive 32;
    }

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    client_max_body_size 10M;
    server_tokens off;

    # Buffers
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging - reduced for performance
    log_format main '$remote_addr - $status $request_method $uri $request_time';
    access_log /var/log/nginx/access.log main buffer=16k flush=5s;
    error_log /var/log/nginx/error.log warn;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 4;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=15r/s;
    limit_req_zone $binary_remote_addr zone=ai:10m rate=2r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    # Proxy buffers for SSR
    proxy_buffer_size 128k;
    proxy_buffers 8 256k;
    proxy_busy_buffers_size 512k;
    proxy_temp_file_write_size 512k;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # Block known bad user agents
    map $http_user_agent $bad_agent {
        default 0;
        ~*Go-http-client 1;
        ~*xmrig 1;
        ~*cryptominer 1;
        ~*sqlmap 1;
        ~*nikto 1;
        ~*nmap 1;
        ~*masscan 1;
        ~*dirbuster 1;
        ~*gobuster 1;
        ~*zgrab 1;
        ~*python-requests 1;
        ~*Scrapy 1;
        ~*wget 1;
        ~*libwww-perl 1;
    }

    # Block x-middleware-subrequest header (CVE-2025-29927)
    map $http_x_middleware_subrequest $block_middleware {
        default 0;
        "~." 1;
    }

    server {
        listen 80;
        server_name noteprompt.cn www.noteprompt.cn;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        http2 on;
        server_name noteprompt.cn www.noteprompt.cn;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Block bad bots
        if ($bad_agent) {
            return 444;
        }

        # Block CVE-2025-29927 (Next.js middleware bypass)
        if ($block_middleware) {
            return 444;
        }

        # Block common exploit paths
        location ~* /(wp-admin|wp-login|wp-content|wp-includes|xmlrpc\\.php|phpmyadmin|myadmin|\\.env|\\.git|config\\.php|shell|eval|cgi-bin|administrator) {
            return 444;
        }

        # Block POST to root (main attack vector)
        location = / {
            limit_req zone=general burst=20 nodelay;
            limit_conn conn_limit 15;

            # Only allow GET, HEAD
            limit_except GET HEAD {
                deny all;
            }

            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 30s;
            proxy_connect_timeout 10s;
            proxy_send_timeout 30s;
        }

        # Serve favicon
        location = /favicon.ico {
            alias /var/www/static/favicon.ico;
            expires 30d;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # Health check (no limit)
        location = /api/health {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            access_log off;
        }

        # Auth endpoints - strict rate limit
        location ~ ^/api/v1/auth/(login|register|forgot-password|reset-password|send-verification) {
            limit_req zone=auth burst=3 nodelay;
            limit_conn conn_limit 5;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 30s;
        }

        # AI endpoints - strict rate limit
        location ~ ^/api/v1/ai/ {
            limit_req zone=ai burst=3 nodelay;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 120s;
        }

        # All API endpoints
        location /api/ {
            limit_req zone=api burst=30 nodelay;
            limit_conn conn_limit 15;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
            proxy_connect_timeout 10s;
            proxy_send_timeout 60s;
        }

        # Static assets - long cache
        location /_next/static/ {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            expires 365d;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # Everything else - pages
        location / {
            limit_req zone=general burst=30 nodelay;
            limit_conn conn_limit 15;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
            proxy_connect_timeout 10s;
            proxy_send_timeout 60s;
        }
    }
}
`.trim();

// ===================== DOCKER COMPOSE - WITH PM2 AND SECURITY =====================
const dockerCompose = `version: "3.8"

services:
  note-prompt-app:
    build:
      context: .
      dockerfile: Dockerfile
    image: note-prompt:latest
    container_name: note-prompt-app
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"const h=require('http');const r=h.get('http://localhost:3000/api/health',res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(8000,()=>{r.destroy();process.exit(1)})\\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    read_only: true
    tmpfs:
      - /tmp
      - /app/.next/cache
    security_opt:
      - no-new-privileges:true
    networks:
      - note-prompt-network

  redis:
    image: redis:7-alpine
    container_name: note-prompt-redis
    command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - note-prompt-network

  nginx:
    image: nginx:alpine
    container_name: note-prompt-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./static:/var/www/static:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - note-prompt-app
    restart: always
    networks:
      - note-prompt-network

volumes:
  redis_data:

networks:
  note-prompt-network:
    driver: bridge
`;

// ===================== DOCKERFILE - HARDENED =====================
const dockerfile = `#
# Stage 1: Build
#
FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

#
# Stage 2: Production runner
#
FROM node:18-alpine AS runner
WORKDIR /app

# Security: non-root user
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy .env.local from host (mounted or baked in at deploy time)
COPY --from=builder /app/.env.local ./.env.local

RUN chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000

# Use node directly - Docker restart: always handles restarts
CMD ["node", "server.js"]
`;

// ===================== NEXT CONFIG - SECURITY HEADERS =====================
const nextConfigPatch = `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  serverExternalPackages: ['mysql2'],

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },

  // Disable x-powered-by header
  poweredByHeader: false,
};

export default nextConfig;
`;

async function main() {
  return new Promise((resolve) => {
    conn.on('ready', async () => {
      log('SSH Connected');
      try {
        // ============ PHASE 1: IMMEDIATE RESTART ============
        log('=== PHASE 1: IMMEDIATE RESTART ===');
        await run(conn, 'cd /opt/note-prompt && docker compose restart note-prompt-app 2>&1', 'Restart app container');
        
        // Wait for app
        log('Waiting 8s for app to start...');
        await new Promise(r => setTimeout(r, 8000));
        
        // Quick health check
        const quickCheck = await execCmd(conn, 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://noteprompt.cn/ 2>&1');
        log(`Quick check: ${quickCheck.out}`);

        // ============ PHASE 2: WRITE ALL CONFIGS ============
        log('=== PHASE 2: WRITE CONFIGS VIA SFTP ===');
        
        // Backup first
        await run(conn, 'cd /opt/note-prompt && cp docker-compose.yml docker-compose.yml.bak3 && cp nginx/nginx.conf nginx/nginx.conf.bak3 && cp Dockerfile Dockerfile.bak3 2>/dev/null; echo "Backups done"', 'Backup current configs');
        
        // Write files
        log('Writing nginx.conf...');
        await writeFileSftp(conn, '/opt/note-prompt/nginx/nginx.conf', nginxConf);
        
        log('Writing docker-compose.yml...');
        await writeFileSftp(conn, '/opt/note-prompt/docker-compose.yml', dockerCompose);
        
        log('Writing Dockerfile...');
        await writeFileSftp(conn, '/opt/note-prompt/Dockerfile', dockerfile);
        
        // Verify
        await run(conn, 'wc -l /opt/note-prompt/nginx/nginx.conf /opt/note-prompt/docker-compose.yml /opt/note-prompt/Dockerfile', 'Verify file sizes');
        
        // ============ PHASE 3: TEST NGINX CONFIG ============
        log('=== PHASE 3: VALIDATE NGINX ===');
        // Copy new nginx and test
        await run(conn, 'docker cp /opt/note-prompt/nginx/nginx.conf note-prompt-nginx:/etc/nginx/nginx.conf && docker exec note-prompt-nginx nginx -t 2>&1', 'Test nginx config');
        
        // Reload nginx (zero downtime)
        await run(conn, 'docker exec note-prompt-nginx nginx -s reload 2>&1', 'Reload nginx');
        
        // ============ PHASE 4: REBUILD APP (zero-downtime) ============
        log('=== PHASE 4: REBUILD APP ===');
        
        // Pull latest code
        await run(conn, 'cd /opt/note-prompt && git fetch origin && git reset --hard origin/main 2>&1', 'Pull latest code');
        
        // Restore production configs
        await run(conn, 'cd /opt/note-prompt && cp docker-compose.yml.bak3 docker-compose.yml.git && cp Dockerfile.bak3 Dockerfile.git 2>/dev/null; echo ok', 'Save git versions');
        await writeFileSftp(conn, '/opt/note-prompt/docker-compose.yml', dockerCompose);
        await writeFileSftp(conn, '/opt/note-prompt/nginx/nginx.conf', nginxConf);
        await writeFileSftp(conn, '/opt/note-prompt/Dockerfile', dockerfile);
        
        // Also update next.config.mjs with security headers
        await writeFileSftp(conn, '/opt/note-prompt/next.config.mjs', nextConfigPatch);
        
        // Build new image
        await run(conn, 'cd /opt/note-prompt && docker build --no-cache -t note-prompt:latest . 2>&1 | tail -20', 'Build new Docker image (this takes a while...)');
        
        // ============ PHASE 5: ROLLING RESTART ============
        log('=== PHASE 5: ROLLING RESTART ===');
        
        // Recreate containers
        await run(conn, 'cd /opt/note-prompt && docker compose up -d --force-recreate 2>&1', 'Recreate all containers');
        
        // Wait
        log('Waiting 15s for all services...');
        await new Promise(r => setTimeout(r, 15000));
        
        // ============ PHASE 6: VERIFY ============
        log('=== PHASE 6: VERIFICATION ===');
        
        await run(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"', 'Container status');
        
        const tests = [
          ['Homepage', 'https://noteprompt.cn/'],
          ['Login', 'https://noteprompt.cn/login'],
          ['Health', 'https://noteprompt.cn/api/health'],
          ['ForgotPW', 'https://noteprompt.cn/forgot-password'],
        ];
        
        for (const [name, url] of tests) {
          const r = await execCmd(conn, `curl -s -o /dev/null -w "${name}: %{http_code} %{time_total}s" --max-time 15 ${url} 2>&1`);
          console.log(r.out);
        }
        
        // Security test - POST to / should be blocked
        log('Security tests:');
        const postTest = await execCmd(conn, 'curl -s -o /dev/null -w "POST /: %{http_code}" -X POST --max-time 5 https://noteprompt.cn/ 2>&1');
        console.log(postTest.out);
        
        const badAgentTest = await execCmd(conn, 'curl -s -o /dev/null -w "Bad UA: %{http_code}" -A "Go-http-client/1.1" --max-time 5 https://noteprompt.cn/ 2>&1');
        console.log(badAgentTest.out);
        
        const middlewareTest = await execCmd(conn, 'curl -s -o /dev/null -w "CVE test: %{http_code}" -H "x-middleware-subrequest: 1" --max-time 5 https://noteprompt.cn/ 2>&1');
        console.log(middlewareTest.out);
        
        // Final logs
        await run(conn, 'docker logs --tail=10 note-prompt-app 2>&1', 'App logs');
        await run(conn, 'docker logs --tail=5 note-prompt-nginx 2>&1', 'Nginx logs');
        
        // Memory
        await run(conn, 'free -m', 'Memory status');
        await run(conn, 'docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"', 'Container resources');
        
        log('=== DEPLOYMENT COMPLETE ===');
        
      } catch(e) {
        console.error('Error:', e.message, e.stack);
      }
      conn.end();
      resolve();
    }).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
  });
}

main();
