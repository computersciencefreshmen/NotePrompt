const { Client } = require('ssh2');
const conn = new Client();
function exec(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (e, s) => {
      if(e) return rej(e);
      let o='',er='';
      s.on('data',d=>{o+=d});
      s.stderr.on('data',d=>{er+=d});
      s.on('close',code=>{res({stdout:o.trim(),stderr:er.trim(),code})});
    });
  });
}
async function run(c, cmd, label) {
  console.log(`[STEP] ${label}`);
  const r = await exec(c, cmd, label);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('Warning:') && !r.stderr.includes('obsolete')) console.log('ERR:', r.stderr);
  return r;
}
async function main() {
  await new Promise((r,j)=>{conn.on('ready',r);conn.on('error',j);conn.connect({host:'8.138.176.174',port:22,username:'root',password:'20040618Aa',readyTimeout:10000})});
  console.log('SSH OK\n');

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

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    limit_req_zone \\$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \\$binary_remote_addr zone=ai:10m rate=2r/s;

    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;

    map \\$http_upgrade \\$connection_upgrade {
        default upgrade;
        ''      close;
    }

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
        listen 443 ssl;
        http2 on;
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
        add_header X-Content-Type-Options "nosniff" always;

        location / {
            proxy_pass http://note_prompt_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \\$http_upgrade;
            proxy_set_header Connection \\$connection_upgrade;
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

        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)\\$ {
            proxy_pass http://note_prompt_app;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGXEOF
echo "nginx.conf updated"`, '1. Fix nginx Connection header (conditional upgrade)');

  await run(conn, 'cd /opt/note-prompt && docker compose restart nginx 2>&1', '2. Restart nginx');
  await run(conn, 'sleep 3', 'Wait...');
  await run(conn, 'docker exec note-prompt-nginx nginx -t 2>&1', '3. Config test');
  await run(conn, 'curl -sk -o /dev/null -w "Homepage: %{http_code}\\n" https://localhost/ 2>/dev/null', '4. Test homepage');
  await run(conn, 'curl -sk -o /dev/null -w "Health: %{http_code}\\n" https://localhost/api/health 2>/dev/null', '5. Test health');
  await run(conn, 'curl -sk -o /dev/null -w "Login: %{http_code}\\n" https://localhost/login 2>/dev/null', '6. Test login');

  conn.end();
  console.log('\nDone!');
}
main().catch(e=>{console.error(e);process.exit(1)});
