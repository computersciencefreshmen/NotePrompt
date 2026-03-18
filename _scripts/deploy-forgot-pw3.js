const { Client } = require('ssh2');
const conn = new Client();
function exec(c, cmd, timeout = 300000) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => res({stdout:'TIMEOUT',stderr:'',code:-1}), timeout);
    c.exec(cmd, (e, s) => {
      if(e) { clearTimeout(timer); return rej(e); }
      let o='',er='';
      s.on('data',d=>{o+=d});
      s.stderr.on('data',d=>{er+=d});
      s.on('close',code=>{clearTimeout(timer);res({stdout:o.trim(),stderr:er.trim(),code})});
    });
  });
}
async function main() {
  await new Promise((r,j)=>{conn.on('ready',r);conn.on('error',j);conn.connect({host:'8.138.176.174',port:22,username:'root',password:'20040618Aa',readyTimeout:10000})});
  console.log('SSH connected\n');

  // 1. Backup local modifications, then force reset to origin/main
  console.log('=== Backing up local files ===');
  let r = await exec(conn, 'cp /opt/note-prompt/docker-compose.yml /opt/note-prompt/docker-compose.yml.bak && cp /opt/note-prompt/nginx/nginx.conf /opt/note-prompt/nginx/nginx.conf.bak && cp /opt/note-prompt/.env.local /opt/note-prompt/.env.local.bak 2>/dev/null; echo done');
  console.log(r.stdout);

  // 2. Force checkout to origin/main
  console.log('\n=== Resetting to origin/main ===');
  r = await exec(conn, 'cd /opt/note-prompt && git fetch origin && git reset --hard origin/main 2>&1');
  console.log(r.stdout);

  // 3. Restore production-specific files
  console.log('\n=== Restoring production files ===');
  r = await exec(conn, 'cp /opt/note-prompt/docker-compose.yml.bak /opt/note-prompt/docker-compose.yml && cp /opt/note-prompt/nginx/nginx.conf.bak /opt/note-prompt/nginx/nginx.conf && cp /opt/note-prompt/.env.local.bak /opt/note-prompt/.env.local 2>/dev/null; echo done');
  console.log(r.stdout);

  // Also restore the static dir for favicon
  r = await exec(conn, 'mkdir -p /opt/note-prompt/static 2>/dev/null; cp /opt/note-prompt/public/favicon.ico /opt/note-prompt/static/favicon.ico 2>/dev/null; echo done');
  console.log(r.stdout);

  // 4. Verify files exist
  r = await exec(conn, 'ls /opt/note-prompt/src/app/api/v1/auth/forgot-password/route.ts /opt/note-prompt/src/app/api/v1/auth/reset-password/route.ts /opt/note-prompt/src/app/forgot-password/page.tsx 2>&1');
  console.log('\n=== New files check ===');
  console.log(r.stdout);

  // 5. Rebuild
  console.log('\n=== Building Docker image ===');
  r = await exec(conn, 'cd /opt/note-prompt && docker build --no-cache -t note-prompt:latest . 2>&1', 600000);
  const lines = r.stdout.split('\n');
  console.log(lines.slice(-15).join('\n'));

  // 6. Restart
  console.log('\n=== Restarting ===');
  r = await exec(conn, 'cd /opt/note-prompt && docker compose up -d note-prompt-app 2>&1');
  console.log(r.stdout, r.stderr);

  await new Promise(r=>setTimeout(r, 5000));

  // 7. Test
  console.log('\n=== Tests ===');
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/forgot-password');
  console.log('Forgot password page:', r.stdout);
  r = await exec(conn, `curl -sk https://noteprompt.cn/api/v1/auth/forgot-password -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}'`);
  console.log('Forgot password API:', r.stdout.substring(0, 150));
  r = await exec(conn, `curl -sk https://noteprompt.cn/api/v1/auth/reset-password -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com","code":"123456","newPassword":"test123"}'`);
  console.log('Reset password API:', r.stdout.substring(0, 150));
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/login');
  console.log('Login:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/');
  console.log('Homepage:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
