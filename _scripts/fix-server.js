const {Client} = require('ssh2');
const conn = new Client();

function execCmd(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log('\n>>> ' + cmd);
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
        // Step 1: Restart the app container
        console.log('\n=== STEP 1: Restart app container ===');
        await execCmd(conn, 'cd /opt/note-prompt && docker compose restart note-prompt-app');
        
        // Wait for app to start
        console.log('\nWaiting 10s for app to start...');
        await new Promise(r => setTimeout(r, 10000));
        
        // Step 2: Test connection
        console.log('\n=== STEP 2: Test app health ===');
        await execCmd(conn, 'curl -s -o /dev/null -w "CODE:%{http_code} TIME:%{time_total}s" --max-time 15 http://localhost:3000/');
        await execCmd(conn, 'curl -s -o /dev/null -w "CODE:%{http_code} TIME:%{time_total}s" --max-time 15 https://noteprompt.cn/');
        
        // Step 3: Check logs  
        console.log('\n=== STEP 3: Check app logs after restart ===');
        await execCmd(conn, 'docker logs --tail=10 note-prompt-app 2>&1');
        
        // Step 4: Read current docker-compose
        console.log('\n=== STEP 4: Read docker-compose.yml ===');
        await execCmd(conn, 'cat /opt/note-prompt/docker-compose.yml');
        
      } catch(e) {
        console.error('Error:', e.message);
      }
      conn.end();
      resolve();
    }).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
  });
}

main();
