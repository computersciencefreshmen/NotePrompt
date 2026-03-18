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

  // First trigger a request to the home page
  let r = await exec(conn, 'curl -sk https://localhost/ 2>&1 | head -30');
  console.log('=== Home page response ===');
  console.log(r.stdout);

  // Now check app logs for errors
  r = await exec(conn, 'docker logs note-prompt-app 2>&1 | tail -40');
  console.log('\n=== App container logs ===');
  console.log(r.stdout || r.stderr);

  // Check the env vars inside the container
  r = await exec(conn, 'docker exec note-prompt-app env 2>&1 | sort');
  console.log('\n=== Container env vars ===');
  console.log(r.stdout);

  // Check if .env.local is in the container
  r = await exec(conn, 'docker exec note-prompt-app cat /app/.env.local 2>&1 | head -5');
  console.log('\n=== .env.local in container ===');
  console.log(r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
