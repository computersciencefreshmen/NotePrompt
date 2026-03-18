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

  // 1. Pull latest code
  console.log('=== Pulling latest code ===');
  let r = await exec(conn, 'cd /opt/note-prompt && git pull origin main 2>&1');
  console.log(r.stdout, r.stderr);

  // 2. Rebuild Docker image
  console.log('\n=== Building Docker image ===');
  r = await exec(conn, 'cd /opt/note-prompt && docker build -t note-prompt:latest . 2>&1');
  console.log(r.stdout.slice(-500)); // last 500 chars

  // 3. Restart app container
  console.log('\n=== Restarting app ===');
  r = await exec(conn, 'cd /opt/note-prompt && docker compose up -d note-prompt-app 2>&1');
  console.log(r.stdout, r.stderr);

  // Wait for startup
  await new Promise(r=>setTimeout(r, 5000));

  // 4. Check containers
  r = await exec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}"');
  console.log('\nContainers:', r.stdout);

  // 5. Test endpoints
  console.log('\n=== Testing endpoints ===');
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/');
  console.log('Homepage:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/forgot-password');
  console.log('Forgot password page:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/login');
  console.log('Login page:', r.stdout);
  r = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"test@test.com"}'`);
  console.log('Forgot password API:', r.stdout);
  r = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/reset-password -H "Content-Type: application/json" -d '{"email":"test@test.com","code":"123456","newPassword":"test123"}'`);
  console.log('Reset password API:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/favicon.ico');
  console.log('Favicon:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
