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

  // Check container structure
  let r = await exec(conn, 'docker exec note-prompt-app ls -la /app/');
  console.log('=== /app/ ===');
  console.log(r.stdout);

  r = await exec(conn, 'docker exec note-prompt-app ls -la /app/public/ 2>/dev/null || echo "No /app/public/"');
  console.log('\n=== /app/public/ ===');
  console.log(r.stdout);

  // Check Dockerfile to understand the structure
  r = await exec(conn, 'cat /opt/note-prompt/Dockerfile');
  console.log('\n=== Dockerfile ===');
  console.log(r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
