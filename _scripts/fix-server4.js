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
        // Check current state first
        console.log('\n=== Current container state ===');
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        
        // Write corrected docker-compose with simpler health check
        console.log('\n=== Writing corrected docker-compose.yml ===');
        const dockerCompose = [
          'version: "3.8"',
          '',
          'services:',
          '  note-prompt-app:',
          '    build:',
          '      context: .',
          '      dockerfile: Dockerfile',
          '    image: note-prompt:latest',
          '    container_name: note-prompt-app',
          '    environment:',
          '      - NODE_ENV=production',
          '      - PORT=3000',
          '      - HOSTNAME=0.0.0.0',
          '    restart: always',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "node -e \\"try{const h=require(\'http\');const r=h.get(\'http://localhost:3000/api/health\',res=>{process.exit(res.statusCode===200?0:1)});r.on(\'error\',()=>process.exit(1));r.setTimeout(5000,()=>{r.destroy();process.exit(1)})}catch(e){process.exit(1)}\\""]',
          '      interval: 30s',
          '      timeout: 10s',
          '      retries: 3',
          '      start_period: 60s',
          '    networks:',
          '      - note-prompt-network',
          '',
          '  redis:',
          '    image: redis:7-alpine',
          '    container_name: note-prompt-redis',
          '    volumes:',
          '      - redis_data:/data',
          '    restart: always',
          '    healthcheck:',
          '      test: ["CMD", "redis-cli", "ping"]',
          '      interval: 30s',
          '      timeout: 5s',
          '      retries: 3',
          '    networks:',
          '      - note-prompt-network',
          '',
          '  nginx:',
          '    image: nginx:alpine',
          '    container_name: note-prompt-nginx',
          '    ports:',
          '      - "80:80"',
          '      - "443:443"',
          '    volumes:',
          '      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro',
          '      - ./nginx/ssl:/etc/nginx/ssl:ro',
          '      - ./static:/var/www/static:ro',
          '      - ./certbot/www:/var/www/certbot:ro',
          '    depends_on:',
          '      - note-prompt-app',
          '    restart: always',
          '    networks:',
          '      - note-prompt-network',
          '',
          'volumes:',
          '  redis_data:',
          '',
          'networks:',
          '  note-prompt-network:',
          '    driver: bridge',
          '',
        ].join('\n');
        
        // Write file using echo with heredoc
        await execCmd(conn, `cat > /opt/note-prompt/docker-compose.yml << 'DEOF'
${dockerCompose}
DEOF`);
        
        // Verify
        await execCmd(conn, 'cat /opt/note-prompt/docker-compose.yml');
        
        // Recreate all containers
        console.log('\n=== Recreating all containers ===');
        await execCmd(conn, 'cd /opt/note-prompt && docker compose up -d --force-recreate 2>&1');
        
        // Wait for startup
        console.log('\nWaiting 20s for services to start...');
        await new Promise(r => setTimeout(r, 20000));
        
        // Verify containers are running
        console.log('\n=== Container status ===');
        await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"');
        
        // Test endpoints
        console.log('\n=== Testing endpoints ===');
        await execCmd(conn, 'curl -s -o /dev/null -w "Homepage: CODE=%{http_code} TIME=%{time_total}s\\n" --max-time 15 https://noteprompt.cn/');
        await execCmd(conn, 'curl -s -o /dev/null -w "Login: CODE=%{http_code} TIME=%{time_total}s\\n" --max-time 15 https://noteprompt.cn/login');
        await execCmd(conn, 'curl -s -o /dev/null -w "API Health: CODE=%{http_code} TIME=%{time_total}s\\n" --max-time 15 https://noteprompt.cn/api/health');
        await execCmd(conn, 'curl -s -o /dev/null -w "Forgot PW: CODE=%{http_code} TIME=%{time_total}s\\n" --max-time 15 https://noteprompt.cn/forgot-password');
        
        // Check recent logs
        console.log('\n=== App logs ===');
        await execCmd(conn, 'docker logs --tail=15 note-prompt-app 2>&1');
        
        console.log('\n=== Nginx logs (last 5) ===');
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
