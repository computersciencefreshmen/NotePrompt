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
async function main() {
  await new Promise((r,j)=>{conn.on('ready',r);conn.on('error',j);conn.connect({host:'8.138.176.174',port:22,username:'root',password:'20040618Aa',readyTimeout:10000})});
  console.log('SSH connected\n');

  // Approach: Serve favicon through nginx directly
  // 1. Make sure favicon exists on the host in a location nginx can access
  let r = await exec(conn, 'ls -la /opt/note-prompt/public/favicon.ico');
  console.log('Favicon on host:', r.stdout);

  // 2. Update nginx config to serve favicon from a volume 
  // Read current nginx config
  r = await exec(conn, 'cat /opt/note-prompt/nginx/nginx.conf');
  console.log('Current nginx config length:', r.stdout.length);

  // Write updated nginx config with favicon location
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

    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=ai:10m rate=2r/s;

    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;

    map $http_upgrade $connection_upgrade {
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

        # Serve favicon from static files
        location = /favicon.ico {
            alias /var/www/static/favicon.ico;
            expires 30d;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        location / {
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

  const b64 = Buffer.from(nginxConf).toString('base64');
  r = await exec(conn, `echo '${b64}' | base64 -d > /opt/note-prompt/nginx/nginx.conf`);
  console.log('nginx.conf updated');

  // 3. Create static files dir and copy favicon
  r = await exec(conn, 'mkdir -p /opt/note-prompt/static && cp /opt/note-prompt/public/favicon.ico /opt/note-prompt/static/favicon.ico');
  console.log('Static dir created');

  // 4. Update docker-compose to mount static dir into nginx
  r = await exec(conn, 'cat /opt/note-prompt/docker-compose.yml');
  console.log('\nCurrent docker-compose.yml:');
  console.log(r.stdout);

  // Add static volume mount to nginx service
  const dcContent = r.stdout;
  if (!dcContent.includes('/var/www/static')) {
    const updated = dcContent.replace(
      /- \.\/nginx\/ssl:\/etc\/nginx\/ssl:ro/,
      '- ./nginx/ssl:/etc/nginx/ssl:ro\n      - ./static:/var/www/static:ro'
    );
    const dcB64 = Buffer.from(updated).toString('base64');
    r = await exec(conn, `echo '${dcB64}' | base64 -d > /opt/note-prompt/docker-compose.yml`);
    console.log('docker-compose.yml updated with static volume');
  }

  // 5. Restart nginx with the new config
  r = await exec(conn, 'cd /opt/note-prompt && docker compose up -d nginx 2>&1');
  console.log('\nNginx restart:', r.stdout, r.stderr);

  await new Promise(r=>setTimeout(r,3000));

  // Check nginx is running
  r = await exec(conn, 'docker ps --filter name=note-prompt-nginx --format "{{.Status}}"');
  console.log('Nginx status:', r.stdout);

  // 6. Test
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code} %{size_download}bytes" https://noteprompt.cn/favicon.ico');
  console.log('\nFavicon:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/');
  console.log('Homepage:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/login');
  console.log('Login:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/api/health');
  console.log('Health:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
