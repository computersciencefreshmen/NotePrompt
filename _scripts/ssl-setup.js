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
      reject(new Error(`Timeout: ${label}`));
    }, 120000);
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
  console.log(`\n[STEP] ${label}`);
  const r = await exec(conn, cmd, label);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('Warning:')) console.log('STDERR:', r.stderr);
  return r;
}

async function main() {
  const conn = new Client();
  await new Promise((r, j) => { conn.on('ready', r); conn.on('error', j); conn.connect(SERVER); });
  console.log('=== SSH connected, setting up SSL ===\n');

  // Step 1: Get SSL cert via certbot webroot
  const certResult = await run(conn,
    'certbot certonly --webroot --webroot-path=/opt/note-prompt/certbot/www -d noteprompt.cn -d www.noteprompt.cn --non-interactive --agree-tos --email 13022037121@163.com 2>&1',
    '1. Request SSL certificate from Let\'s Encrypt');

  if (certResult.code !== 0 && !certResult.stdout.includes('not yet due') && !certResult.stdout.includes('Congratulations')) {
    // Maybe certbot can't reach via webroot through Docker, try standalone
    console.log('\nWebroot failed, trying standalone method...');
    
    // Stop nginx temporarily
    await run(conn, 'cd /opt/note-prompt && docker compose stop nginx 2>&1', '1b. Stop nginx for standalone cert');
    
    const standaloneCert = await run(conn,
      'certbot certonly --standalone -d noteprompt.cn -d www.noteprompt.cn --non-interactive --agree-tos --email 13022037121@163.com 2>&1',
      '1c. Request cert via standalone');
    
    if (standaloneCert.code !== 0 && !standaloneCert.stdout.includes('not yet due') && !standaloneCert.stdout.includes('Congratulations')) {
      console.log('\n❌ SSL cert failed. Continuing with HTTP only.');
      await run(conn, 'cd /opt/note-prompt && docker compose start nginx 2>&1', 'Restart nginx');
      conn.end();
      return;
    }
  }

  // Step 2: Copy certs to nginx ssl dir
  await run(conn,
    'cp /etc/letsencrypt/live/noteprompt.cn/fullchain.pem /opt/note-prompt/nginx/ssl/fullchain.pem && cp /etc/letsencrypt/live/noteprompt.cn/privkey.pem /opt/note-prompt/nginx/ssl/privkey.pem && echo "Certs copied"',
    '2. Copy SSL certificates');

  // Step 3: Write HTTPS nginx config
  await run(conn, `cat > /opt/note-prompt/nginx/nginx.conf << 'NGXEOF'
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

    log_format main '\\$remote_addr - [\\$time_local] "\\$request" \\$status \\$body_bytes_sent';
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
NGXEOF
echo "HTTPS nginx.conf written"`,
    '3. Write HTTPS nginx config');

  // Step 4: Restart nginx
  await run(conn,
    'cd /opt/note-prompt && docker compose restart nginx 2>&1',
    '4. Restart nginx with SSL');

  // Wait for nginx to start
  await run(conn, 'sleep 3', 'Wait...');

  // Step 5: Verify
  await run(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', '5. Container status');

  await run(conn,
    'curl -s -o /dev/null -w "HTTP: %{http_code}\\n" http://noteprompt.cn 2>/dev/null; curl -sk -o /dev/null -w "HTTPS: %{http_code}\\n" https://noteprompt.cn 2>/dev/null',
    '6. Test HTTP & HTTPS access');

  await run(conn,
    'curl -sk https://noteprompt.cn/api/health 2>/dev/null',
    '7. HTTPS health check');

  // Step 6: Setup auto-renewal cron
  await run(conn,
    `(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/noteprompt.cn/fullchain.pem /opt/note-prompt/nginx/ssl/ && cp /etc/letsencrypt/live/noteprompt.cn/privkey.pem /opt/note-prompt/nginx/ssl/ && cd /opt/note-prompt && docker compose restart nginx") | crontab - && echo "Auto-renewal cron set"`,
    '8. Setup SSL auto-renewal');

  conn.end();
  console.log('\n========================================');
  console.log('  DEPLOYMENT COMPLETE!');
  console.log('  http://noteprompt.cn');
  console.log('  https://noteprompt.cn');
  console.log('========================================');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
