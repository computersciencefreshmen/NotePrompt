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

async function main() {
  return new Promise((resolve) => {
    conn.on('ready', async () => {
      console.log('SSH connected');
      try {
        // Check current state
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        
        // Fix docker-compose - use wget instead of curl for healthcheck
        const dockerCompose = `version: '3.8'

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
      test: ["CMD-SHELL", "node -e \\"fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
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
      note-prompt-app:
        condition: service_healthy
    restart: always
    networks:
      - note-prompt-network

volumes:
  redis_data:

networks:
  note-prompt-network:
    driver: bridge
`;

        await execCmd(conn, `cat > /opt/note-prompt/docker-compose.yml << 'COMPOSEOF'
${dockerCompose}
COMPOSEOF`);

        // Verify the file was written
        await execCmd(conn, 'cat /opt/note-prompt/docker-compose.yml');
        
        // Check node version in app container  
        await execCmd(conn, 'docker exec note-prompt-app node -v 2>&1');
        
        // Try the health check command manually
        await execCmd(conn, `docker exec note-prompt-app node -e "fetch('http://localhost:3000/api/health').then(r=>console.log('status:',r.status)).catch(e=>console.error(e))" 2>&1`);
        
        // Recreate containers with new compose
        console.log('\n=== Recreating containers ===');
        await execCmd(conn, 'cd /opt/note-prompt && docker compose up -d 2>&1');
        
        // Wait
        console.log('\nWaiting 15s...');
        await new Promise(r => setTimeout(r, 15000));
        
        // Verify
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        await execCmd(conn, 'curl -s -o /dev/null -w "HTTPS: CODE:%{http_code} TIME:%{time_total}s\\n" --max-time 10 https://noteprompt.cn/');
        await execCmd(conn, 'curl -s -o /dev/null -w "LOGIN: CODE:%{http_code} TIME:%{time_total}s\\n" --max-time 10 https://noteprompt.cn/login');
        
      } catch(e) {
        console.error('Error:', e.message);
      }
      conn.end();
      resolve();
    }).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
  });
}

main();
