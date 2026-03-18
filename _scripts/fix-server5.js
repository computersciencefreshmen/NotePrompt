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
      stream.on('close', (code) => { console.log(out); resolve(out); });
    });
  });
}

function writeFile(conn, path, content) {
  return new Promise((resolve, reject) => {
    console.log('\n>>> Writing ' + path + ' (' + content.length + ' bytes)');
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(path, content, 'utf8', (err) => {
        sftp.end();
        if (err) return reject(err);
        console.log('Written successfully');
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
        // Check current state
        console.log('\n=== Current state ===');
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        await execCmd(conn, 'cat /opt/note-prompt/docker-compose.yml');
        
        // Write docker-compose.yml via SFTP (no heredoc issues)
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

        await writeFile(conn, '/opt/note-prompt/docker-compose.yml', dockerCompose);
        
        // Verify the file
        console.log('\n=== Verify docker-compose.yml ===');
        await execCmd(conn, 'cat /opt/note-prompt/docker-compose.yml');
        
        // Force recreate all containers
        console.log('\n=== Force recreate containers ===');
        // First stop everything
        await execCmd(conn, 'cd /opt/note-prompt && docker compose down 2>&1');
        
        // Then start
        await execCmd(conn, 'cd /opt/note-prompt && docker compose up -d 2>&1');
        
        // Wait for startup
        console.log('\nWaiting 15s for services to start...');
        await new Promise(r => setTimeout(r, 15000));
        
        // Verify containers
        console.log('\n=== Container status ===');
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        
        // Test endpoints
        console.log('\n=== Testing endpoints ===');
        await execCmd(conn, 'curl -s -o /dev/null -w "Homepage: %{http_code} %{time_total}s\\n" --max-time 15 https://noteprompt.cn/');
        await execCmd(conn, 'curl -s -o /dev/null -w "Login: %{http_code} %{time_total}s\\n" --max-time 15 https://noteprompt.cn/login');
        await execCmd(conn, 'curl -s -o /dev/null -w "Health: %{http_code} %{time_total}s\\n" --max-time 15 https://noteprompt.cn/api/health');
        
        // App logs
        console.log('\n=== App logs ===');
        await execCmd(conn, 'docker logs --tail=10 note-prompt-app 2>&1');
        
      } catch(e) {
        console.error('Error:', e.message);
      }
      conn.end();
      resolve();
    }).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
  });
}

main();
