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
  console.log('SSH OK\n');

  // Check nginx error
  let r = await exec(conn, 'docker logs note-prompt-nginx 2>&1 | tail -20');
  console.log('=== Nginx logs ===');
  console.log(r.stdout || r.stderr);

  // Check the config file on disk
  r = await exec(conn, 'cat /opt/note-prompt/nginx/nginx.conf | head -60');
  console.log('\n=== nginx.conf (first 60 lines) ===');
  console.log(r.stdout);

  // Check for dollar sign issues
  r = await exec(conn, 'grep -n "\\$" /opt/note-prompt/nginx/nginx.conf | head -20');
  console.log('\n=== Lines with $ ===');
  console.log(r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
