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

  // Direct access to app container (bypass nginx)
  let r = await exec(conn, 'docker exec note-prompt-nginx wget -q -O- --timeout=10 http://note-prompt-app:3000/ 2>&1 | head -20');
  console.log('=== Direct app access (from nginx container) ===');
  console.log(r.stdout);

  // Try different pages
  r = await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://172.19.0.2:3000/ 2>/dev/null; echo " homepage"');
  console.log('\n=== Direct curl to app IP ===');
  console.log(r.stdout);

  r = await exec(conn, 'curl -s --max-time 10 http://172.19.0.2:3000/ 2>/dev/null | head -5');
  console.log('\n=== Direct homepage response ===');
  console.log(r.stdout);

  // Check memory
  r = await exec(conn, 'free -m');
  console.log('\n=== Memory ===');
  console.log(r.stdout);

  // Docker stats
  r = await exec(conn, 'docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"');
  console.log('\n=== Docker stats ===');
  console.log(r.stdout);

  // Check ALL app logs including stderr
  r = await exec(conn, 'docker logs note-prompt-app 2>&1');
  console.log('\n=== ALL app logs ===');
  console.log(r.stdout || r.stderr);

  // Try accessing login page
  r = await exec(conn, 'docker exec note-prompt-nginx wget -q -O- --timeout=10 http://note-prompt-app:3000/login 2>&1 | head -5');
  console.log('\n=== Login page ===');
  console.log(r.stdout);

  // Try API endpoint
  r = await exec(conn, 'docker exec note-prompt-nginx wget -q -O- --timeout=10 http://note-prompt-app:3000/api/v1/prompts?page=1 2>&1 | head -5');
  console.log('\n=== API prompts ===');
  console.log(r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
