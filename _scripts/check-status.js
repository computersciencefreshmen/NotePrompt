const {Client} = require('ssh2');
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
  console.log('SSH OK');
  
  let r = await exec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
  console.log('\n=== Containers ===');
  console.log(r.stdout);
  
  r = await exec(conn, 'curl -s http://localhost:80/api/health 2>/dev/null');
  console.log('\n=== Health (port 80) ===');
  console.log(r.stdout);

  r = await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://noteprompt.cn 2>/dev/null; echo ""');
  console.log('\n=== External via domain ===');
  console.log(r.stdout);

  r = await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://8.138.176.174 2>/dev/null; echo ""');
  console.log('\n=== External via IP ===');
  console.log(r.stdout);

  r = await exec(conn, 'docker logs note-prompt-app 2>&1 | tail -5');
  console.log('\n=== App logs ===');
  console.log(r.stdout);

  r = await exec(conn, 'docker logs note-prompt-nginx 2>&1 | tail -10');
  console.log('\n=== Nginx logs ===');
  console.log(r.stdout || r.stderr);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
