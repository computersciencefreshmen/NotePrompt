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
  
  // Check nginx error log
  let r = await exec(conn, 'docker logs note-prompt-nginx 2>&1 | tail -20');
  console.log('=== Nginx logs ===');
  console.log(r.stdout || r.stderr);

  // Test various endpoints
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://localhost 2>/dev/null; echo ""');
  console.log('\n=== HTTPS localhost ===');
  console.log(r.stdout);

  r = await exec(conn, 'curl -sk https://localhost/api/health 2>/dev/null');
  console.log('\n=== HTTPS health ===');
  console.log(r.stdout);

  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn 2>/dev/null; echo ""');
  console.log('\n=== HTTPS domain ===');
  console.log(r.stdout);

  // Check nginx config test
  r = await exec(conn, 'docker exec note-prompt-nginx nginx -t 2>&1');
  console.log('\n=== Nginx config test ===');
  console.log(r.stdout || r.stderr);

  // Check if note-prompt-app is reachable from nginx container
  r = await exec(conn, 'docker exec note-prompt-nginx wget -q -O- http://note-prompt-app:3000/api/health 2>&1 || echo "FAIL"');
  console.log('\n=== Nginx->App connectivity ===');
  console.log(r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
