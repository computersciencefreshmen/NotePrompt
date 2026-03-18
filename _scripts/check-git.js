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

  // Check git status on server
  let r = await exec(conn, 'cd /opt/note-prompt && git log --oneline -5');
  console.log('=== Git log ===');
  console.log(r.stdout);

  r = await exec(conn, 'cd /opt/note-prompt && git remote -v');
  console.log('\n=== Git remote ===');
  console.log(r.stdout);

  r = await exec(conn, 'cd /opt/note-prompt && git status');
  console.log('\n=== Git status ===');
  console.log(r.stdout);

  // Try pulling again
  r = await exec(conn, 'cd /opt/note-prompt && git fetch origin 2>&1 && git log --oneline origin/main -3');
  console.log('\n=== Origin/main ===');
  console.log(r.stdout, r.stderr);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
