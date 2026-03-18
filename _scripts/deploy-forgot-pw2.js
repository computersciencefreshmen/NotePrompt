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

  // Check if files exist on server
  let r = await exec(conn, 'ls -la /opt/note-prompt/src/app/api/v1/auth/forgot-password/ /opt/note-prompt/src/app/api/v1/auth/reset-password/ /opt/note-prompt/src/app/forgot-password/ 2>&1');
  console.log('=== Files on server ===');
  console.log(r.stdout);

  // Rebuild without cache
  console.log('\n=== Rebuilding without cache ===');
  r = await exec(conn, 'cd /opt/note-prompt && docker build --no-cache -t note-prompt:latest . 2>&1', 600000);
  // Show last 30 lines
  const lines = r.stdout.split('\n');
  console.log(lines.slice(-30).join('\n'));
  if (r.stderr) console.log('STDERR:', r.stderr.slice(-200));

  // Restart app
  console.log('\n=== Restarting app ===');
  r = await exec(conn, 'cd /opt/note-prompt && docker compose up -d note-prompt-app 2>&1');
  console.log(r.stdout, r.stderr);

  await new Promise(r=>setTimeout(r, 5000));

  // Check status
  r = await exec(conn, 'docker ps --filter name=note-prompt-app --format "{{.Status}}"');
  console.log('App status:', r.stdout);

  // Test
  console.log('\n=== Tests ===');
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/forgot-password');
  console.log('Forgot password page:', r.stdout);
  r = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"test@example.com"}'`);
  console.log('Forgot password API:', r.stdout.substring(0, 200));
  r = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/reset-password -H "Content-Type: application/json" -d '{"email":"test@example.com","code":"123456","newPassword":"newpass123"}'`);
  console.log('Reset password API:', r.stdout.substring(0, 200));
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/login');
  console.log('Login page:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
