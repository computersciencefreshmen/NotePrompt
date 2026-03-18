const {Client} = require('ssh2');
const conn = new Client();

function execCmd(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log('\n>>> ' + cmd.substring(0, 120));
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
      stream.on('close', () => { console.log(out); resolve(out); });
    });
  });
}

function writeFileSftp(conn, path, content) {
  return new Promise((resolve, reject) => {
    console.log('\n>>> SFTP write: ' + path + ' (' + content.length + ' bytes)');
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(path, content, 'utf8', (err) => {
        sftp.end();
        if (err) return reject(err);
        console.log('Written OK');
        resolve();
      });
    });
  });
}

async function main() {
  return new Promise((resolve) => {
    conn.on('ready', async () => {
      console.log('SSH connected');
      try {
        // Write nginx.conf via SFTP (proper $ signs)
        const nginxConf = `events {
    worker_connections 1024;
}

http {
    upstream note_prompt_app {
        server note-prompt-app:3000;
    }

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=ai:10m rate=2r/s;
    limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # Block known bad user agents
    map $http_user_agent $bad_agent {
        default 0;
        ~*xmrig 1;
        ~*cryptominer 1;
        ~*sqlmap 1;
        ~*nikto 1;
        ~*nmap 1;
        ~*masscan 1;
        ~*dirbuster 1;
        ~*gobuster 1;
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
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers off;

        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Block bad bots/scanners
        if ($bad_agent) {
            return 403;
        }

        # Block common exploit paths
        location ~* /(wp-admin|wp-login|wp-content|wp-includes|xmlrpc\\.php|phpmyadmin|myadmin|\\.env|\\.git|config\\.php|shell|eval|exec) {
            return 444;
        }

        # Connection limits
        limit_conn conn_limit 20;

        # Serve favicon from static files
        location = /favicon.ico {
            alias /var/www/static/favicon.ico;
            expires 30d;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # Health check endpoint (no rate limit)
        location = /api/health {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            access_log off;
        }

        location / {
            limit_req zone=general burst=50 nodelay;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
            proxy_send_timeout 300s;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
            proxy_send_timeout 300s;
        }

        location /_next/static/ {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            expires 365d;
            add_header Cache-Control "public, immutable";
        }
    }
}
`;

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
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"const h=require('http');h.get('http://localhost:3000/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))\\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - note-prompt-network

  redis:
    image: redis:7-alpine
    container_name: note-prompt-redis
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

        // Write both files via SFTP
        await writeFileSftp(conn, '/opt/note-prompt/docker-compose.yml', dockerCompose);
        await writeFileSftp(conn, '/opt/note-prompt/nginx/nginx.conf', nginxConf);
        
        // Verify
        console.log('\n=== Verify nginx.conf (first 40 lines) ===');
        await execCmd(conn, 'head -40 /opt/note-prompt/nginx/nginx.conf');
        
        // Test nginx config inside container before restart
        console.log('\n=== Restart all containers ===');
        await execCmd(conn, 'cd /opt/note-prompt && docker compose down 2>&1');
        await execCmd(conn, 'cd /opt/note-prompt && docker compose up -d 2>&1');
        
        // Wait
        console.log('\nWaiting 15s for startup...');
        await new Promise(r => setTimeout(r, 15000));
        
        // Verify
        console.log('\n=== Container status ===');
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        
        // Test nginx config
        await execCmd(conn, 'docker exec note-prompt-nginx nginx -t 2>&1');
        
        // Test endpoints
        console.log('\n=== Test endpoints ===');
        await execCmd(conn, 'curl -s -o /dev/null -w "Homepage: %{http_code} %{time_total}s\\n" --max-time 15 https://noteprompt.cn/');
        await execCmd(conn, 'curl -s -o /dev/null -w "Login: %{http_code} %{time_total}s\\n" --max-time 15 https://noteprompt.cn/login');
        await execCmd(conn, 'curl -s -o /dev/null -w "Health: %{http_code} %{time_total}s\\n" --max-time 15 https://noteprompt.cn/api/health');
        
        // Logs
        console.log('\n=== App logs ===');
        await execCmd(conn, 'docker logs --tail=5 note-prompt-app 2>&1');
        console.log('\n=== Nginx logs ===');
        await execCmd(conn, 'docker logs --tail=5 note-prompt-nginx 2>&1');
        
      } catch(e) {
        console.error('Error:', e.message);
      }
      conn.end();
      resolve();
    }).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
  });
}

main();
