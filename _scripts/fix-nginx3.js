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
  console.log('SSH connected');

  // Write correct nginx.conf using base64 to avoid ANY escaping issues
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
  let r = await exec(conn, `echo '${b64}' | base64 -d > /opt/note-prompt/nginx/nginx.conf`);
  console.log('Config written via base64');

  // Verify content - check $ signs are correct
  r = await exec(conn, 'grep -c "\\\\\\$" /opt/note-prompt/nginx/nginx.conf');
  console.log('Lines with escaped \\$:', r.stdout || '0');

  r = await exec(conn, 'grep "\\$" /opt/note-prompt/nginx/nginx.conf | head -10');
  console.log('Lines with $:', r.stdout);

  // Test config syntax
  r = await exec(conn, 'docker exec note-prompt-nginx nginx -t 2>&1 || echo "Container not running, will restart"');
  console.log('\nConfig test:', r.stdout, r.stderr);

  // Force restart nginx
  console.log('\nRestarting nginx...');
  r = await exec(conn, 'cd /opt/note-prompt && docker compose restart nginx 2>&1');
  console.log(r.stdout, r.stderr);

  // Wait
  await new Promise(r=>setTimeout(r, 5000));

  // Check container status
  r = await exec(conn, 'docker ps --filter name=note-prompt-nginx --format "{{.Status}}"');
  console.log('\nNginx status:', r.stdout);

  // Check nginx error log
  r = await exec(conn, 'docker logs note-prompt-nginx 2>&1 | tail -5');
  console.log('Recent logs:', r.stdout);

  // Test endpoints
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/api/health');
  console.log('\nHealth:', r.stdout);

  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/');
  console.log('Homepage:', r.stdout);

  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/login');
  console.log('Login:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
