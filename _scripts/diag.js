const {Client} = require('ssh2');
const conn = new Client();

function execCmd(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
      stream.on('close', () => resolve(out));
    });
  });
}

function writeFileSftp(conn, path, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(path, content, 'utf8', (err) => {
        sftp.end();
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

async function main() {
  return new Promise((resolve) => {
    conn.on('ready', async () => {
      console.log('=== SSH Connected ===');
      try {
        // 1. Quick diagnosis
        console.log('\n--- Container Status ---');
        console.log(await execCmd(conn, 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"'));
        
        console.log('--- Memory ---');
        console.log(await execCmd(conn, 'free -m'));
        
        console.log('--- Load ---');
        console.log(await execCmd(conn, 'uptime'));
        
        console.log('--- App Logs (last 20) ---');
        console.log(await execCmd(conn, 'docker logs --tail=20 note-prompt-app 2>&1'));
        
        console.log('--- Nginx Logs (last 10) ---');
        console.log(await execCmd(conn, 'docker logs --tail=10 note-prompt-nginx 2>&1'));

        console.log('--- Test localhost:3000 ---');
        console.log(await execCmd(conn, 'curl -s -o /dev/null -w "APP: %{http_code} %{time_total}s\\n" --max-time 10 http://localhost:3000/ 2>&1'));

        console.log('--- Test HTTPS ---');
        console.log(await execCmd(conn, 'curl -s -o /dev/null -w "HTTPS: %{http_code} %{time_total}s\\n" --max-time 10 https://noteprompt.cn/ 2>&1'));

        console.log('--- Docker compose config ---');
        console.log(await execCmd(conn, 'cat /opt/note-prompt/docker-compose.yml'));

        console.log('--- Healthcheck status ---');
        console.log(await execCmd(conn, 'docker inspect --format "{{.State.Health.Status}}" note-prompt-app 2>&1'));

      } catch(e) {
        console.error('Error:', e.message);
      }
      conn.end();
      resolve();
    }).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
  });
}
main();
