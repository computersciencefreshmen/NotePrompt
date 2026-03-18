const { Client } = require('ssh2');

const SERVER = {
  host: '8.138.176.174',
  port: 22,
  username: 'root',
  password: '20040618Aa',
  readyTimeout: 15000,
};

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Command timed out after 300s: ${label || cmd.substring(0, 60)}`));
    }, 300000);
    
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timeout); return reject(err); }
      let stdout = '', stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
      });
    });
  });
}

async function run(conn, cmd, label) {
  console.log(`\n[STEP] ${label || cmd.substring(0, 80)}`);
  const r = await exec(conn, cmd, label);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('Warning:')) console.log('STDERR:', r.stderr);
  if (r.code !== 0 && r.code !== null) console.log(`Exit code: ${r.code}`);
  return r;
}

async function main() {
  const conn = new Client();
  
  try {
    await new Promise((resolve, reject) => {
      conn.on('ready', resolve);
      conn.on('error', reject);
      conn.connect(SERVER);
    });
    console.log('=== SSH connected, starting deployment ===\n');

    // ============== STEP 1: Backup old deployment ==============
    await run(conn, 
      'cd /opt/note-prompt && cp docker-compose.yml docker-compose.yml.old 2>/dev/null; cp .env .env.old 2>/dev/null; echo "Backup done"',
      '1. Backup old config');

    // ============== STEP 2: Stop old containers ==============
    await run(conn,
      'cd /opt/note-prompt && docker compose down 2>/dev/null || docker-compose down 2>/dev/null; echo "Old containers stopped"',
      '2. Stop old app containers (keep MySQL)');

    // ============== STEP 3: Clone new repo ==============
    await run(conn,
      'rm -rf /opt/note-prompt-new && git clone https://github.com/computersciencefreshmen/NotePrompt.git /opt/note-prompt-new 2>&1 && echo "Clone success"',
      '3. Clone latest code from GitHub');

    // ============== STEP 4: Preserve data directories ==============
    await run(conn,
      'cp -r /opt/note-prompt/data /opt/note-prompt-new/data 2>/dev/null; echo "Data preserved"',
      '4. Preserve data directories');

    // ============== STEP 5: Switch directories ==============
    await run(conn,
      'mv /opt/note-prompt /opt/note-prompt-backup && mv /opt/note-prompt-new /opt/note-prompt && echo "Directory switched"',
      '5. Switch to new code');

    // ============== STEP 6: Database migration (add email verification columns) ==============
    await run(conn,
      `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA='agent_report' AND TABLE_NAME='users' AND COLUMN_NAME='email_verified';" 2>&1`,
      '6a. Check if email_verified column exists');

    const migrationResult = await run(conn,
      `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) DEFAULT 0 COMMENT '邮箱是否已验证';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10) DEFAULT NULL COMMENT '邮箱验证码';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP NULL DEFAULT NULL COMMENT '验证码过期时间';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_sent_at TIMESTAMP NULL DEFAULT NULL COMMENT '最后发送验证码时间';
      " 2>&1`,
      '6b. Add email verification columns to users table');

    // Set existing users as verified
    await run(conn,
      `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "
        UPDATE users SET email_verified = 1 WHERE email_verified = 0 OR email_verified IS NULL;
      " 2>&1`,
      '6c. Mark existing users as email verified');

    // ============== STEP 7: Create production .env.local ==============
    await run(conn,
      `cat > /opt/note-prompt/.env.local << 'ENVEOF'
# Production MySQL (Docker container on host port 3306)
MYSQL_HOST=172.17.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=gw_yhy_1229
MYSQL_DATABASE=agent_report

# JWT
JWT_SECRET=Z31wXXxY1mug+WZ63FAA9Hq6cb0iyGXaQJmIj1RKN1w=
JWT_EXPIRES_IN=7d

# NextAuth
NEXTAUTH_SECRET=Z31wXXxY1mug+WZ63FAA9Hq6cb0iyGXaQJmIj1RKN1w=
NEXTAUTH_URL=https://noteprompt.cn
NODE_ENV=production

# Next.js
NEXT_PUBLIC_API_URL=https://noteprompt.cn

# AI API Keys
DEEPSEEK_API_KEY=sk-3319286c16924e049e4f1b5ee919fcdc
KIMI_API_KEY=sk-lYdDyyZg2SGWuUJZgPEuhOLXqYlwUiQpsV2c8v9Sfjn0ASzE
DASHSCOPE_API_KEY=sk-a2a40ca778b84781b9ac35cdb017874c
QWEN_API_KEY=sk-a2a40ca778b84781b9ac35cdb017874c
GEMINI_API_KEY=AIzaSyAlGyUdC14bR5vMDDCtZvfukmsHhifXbE8
ZHIPU_API_KEY=534b457c9fc94267a4f7e5f090930fe8.RYHwpbe6GHc5H2VR

# Email
EMAIL_HOST=smtp.163.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=13022037121@163.com
EMAIL_PASS=AX2hP39QZZ6pE9Dp
EMAIL_FROM=13022037121@163.com
EMAIL_FROM_NAME=Note Prompt
ENABLE_EMAIL_VERIFICATION=true
ENVEOF
echo ".env.local created"`,
      '7. Create production .env.local');

    // ============== STEP 8: Create production docker-compose.yml ==============
    await run(conn,
      `cat > /opt/note-prompt/docker-compose.yml << 'DCEOF'
version: '3.8'

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
    restart: unless-stopped
    networks:
      - note-prompt-network

  redis:
    image: redis:7-alpine
    container_name: note-prompt-redis
    volumes:
      - redis_data:/data
    restart: unless-stopped
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
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - note-prompt-app
    restart: unless-stopped
    networks:
      - note-prompt-network

volumes:
  redis_data:

networks:
  note-prompt-network:
    driver: bridge
DCEOF
echo "docker-compose.yml created"`,
      '8. Create production docker-compose.yml');

    // ============== STEP 9: Create initial nginx conf (HTTP only for certbot) ==============
    await run(conn,
      `mkdir -p /opt/note-prompt/nginx/ssl /opt/note-prompt/certbot/www && cat > /opt/note-prompt/nginx/nginx.conf << 'NGEOF'
events {
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

    log_format main '$remote_addr - [$time_local] "$request" $status $body_bytes_sent';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        listen 80;
        server_name noteprompt.cn www.noteprompt.cn;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
NGEOF
echo "Initial nginx.conf created (HTTP only)"`,
      '9. Create nginx config (HTTP first for certbot)');

    // ============== STEP 10: Build Docker image ==============
    console.log('\n[STEP] 10. Building Docker image (this takes 2-5 minutes)...');
    const buildResult = await exec(conn, 
      'cd /opt/note-prompt && docker build -t note-prompt:latest . 2>&1 | tail -15',
      'Docker build');
    console.log(buildResult.stdout);
    if (buildResult.stderr) console.log('STDERR:', buildResult.stderr);
    if (buildResult.code !== 0) {
      console.error('BUILD FAILED! Checking full output...');
      const fullBuild = await exec(conn, 'cd /opt/note-prompt && docker build -t note-prompt:latest . 2>&1 | tail -50');
      console.log(fullBuild.stdout);
      conn.end();
      process.exit(1);
    }

    // ============== STEP 11: Start containers ==============
    await run(conn,
      'cd /opt/note-prompt && docker compose up -d 2>&1',
      '11. Start all containers');

    // Wait for startup
    await run(conn,
      'sleep 5 && docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
      '11b. Check container status');

    // ============== STEP 12: Test app ==============
    await run(conn,
      'curl -s -o /dev/null -w "%{http_code}" http://localhost:80 2>/dev/null && echo " - Port 80 OK" || echo "Port 80 FAIL"',
      '12a. Test port 80');

    await run(conn,
      'curl -s http://localhost:80/api/health 2>/dev/null | head -100 || echo "Health check failed"',
      '12b. Test health endpoint');

    // ============== STEP 13: Install certbot and get SSL ==============
    await run(conn,
      'yum install -y certbot 2>&1 | tail -3',
      '13a. Install certbot');

    console.log('\n[STEP] 13b. Getting SSL certificate...');
    const certResult = await exec(conn,
      'certbot certonly --webroot --webroot-path=/opt/note-prompt/certbot/www -d noteprompt.cn -d www.noteprompt.cn --non-interactive --agree-tos --email 13022037121@163.com 2>&1',
      'Get SSL cert');
    console.log(certResult.stdout);
    if (certResult.stderr) console.log('STDERR:', certResult.stderr);

    if (certResult.code === 0 || certResult.stdout.includes('Congratulations') || certResult.stdout.includes('Certificate not yet due')) {
      // SSL cert obtained, update nginx to enable HTTPS
      await run(conn,
        `# Copy certs to nginx ssl dir
cp /etc/letsencrypt/live/noteprompt.cn/fullchain.pem /opt/note-prompt/nginx/ssl/fullchain.pem 2>/dev/null
cp /etc/letsencrypt/live/noteprompt.cn/privkey.pem /opt/note-prompt/nginx/ssl/privkey.pem 2>/dev/null
echo "SSL certs copied"`,
        '13c. Copy SSL certificates');

      // Write full HTTPS nginx config
      await run(conn,
        `cat > /opt/note-prompt/nginx/nginx.conf << 'NGEOF'
events {
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

    log_format main '$remote_addr - [$time_local] "$request" $status $body_bytes_sent';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    limit_req_zone \\$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \\$binary_remote_addr zone=ai:10m rate=2r/s;

    server {
        listen 80;
        server_name noteprompt.cn www.noteprompt.cn;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://\\$host\\$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name noteprompt.cn www.noteprompt.cn;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:MozTLS:10m;
        ssl_session_tickets off;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers off;

        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;

        location / {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \\$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \\$host;
            proxy_set_header X-Real-IP \\$remote_addr;
            proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\$scheme;
            proxy_cache_bypass \\$http_upgrade;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host \\$host;
            proxy_set_header X-Real-IP \\$remote_addr;
            proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\$scheme;
        }

        location /api/v1/ai/ {
            limit_req zone=ai burst=5 nodelay;
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Host \\$host;
            proxy_set_header X-Real-IP \\$remote_addr;
            proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\$scheme;
            proxy_connect_timeout 120s;
            proxy_send_timeout 120s;
            proxy_read_timeout 120s;
        }

        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            proxy_pass http://note_prompt_app;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGEOF
echo "HTTPS nginx.conf written"`,
        '13d. Update nginx config with HTTPS');

      // Reload nginx
      await run(conn,
        'cd /opt/note-prompt && docker compose restart nginx 2>&1',
        '13e. Restart nginx with SSL');
    } else {
      console.log('\n⚠️ SSL certificate failed - site will work on HTTP only');
      console.log('You can retry SSL later with: certbot certonly --webroot --webroot-path=/opt/note-prompt/certbot/www -d noteprompt.cn');
    }

    // ============== STEP 14: Setup certbot auto-renewal ==============
    await run(conn,
      `(crontab -l 2>/dev/null; echo "0 0 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/noteprompt.cn/fullchain.pem /opt/note-prompt/nginx/ssl/ && cp /etc/letsencrypt/live/noteprompt.cn/privkey.pem /opt/note-prompt/nginx/ssl/ && cd /opt/note-prompt && docker compose restart nginx") | sort -u | crontab - 2>&1 && echo "Auto-renewal cron added"`,
      '14. Setup SSL auto-renewal');

    // ============== STEP 15: Final verification ==============
    await run(conn,
      'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
      '15a. Final container status');

    await run(conn,
      'curl -s -o /dev/null -w "HTTP %{http_code}" http://noteprompt.cn 2>/dev/null; echo ""; curl -s -o /dev/null -w "HTTPS %{http_code}" https://noteprompt.cn 2>/dev/null; echo ""',
      '15b. Test domain access');

    conn.end();
    console.log('\n========================================');
    console.log('=== DEPLOYMENT COMPLETE ===');
    console.log('========================================');
    console.log('HTTP:  http://noteprompt.cn');
    console.log('HTTPS: https://noteprompt.cn');
    console.log('========================================');
  } catch (e) {
    console.error('\n!!! DEPLOYMENT ERROR:', e.message);
    conn.end();
    process.exit(1);
  }
}

main();
