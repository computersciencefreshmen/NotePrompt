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

  // 1. Check app container logs for the 500 error
  console.log('=== App Container Logs (last 50 lines) ===');
  let r = await exec(conn, 'docker logs note-prompt-app 2>&1 | tail -50');
  console.log(r.stdout);

  // 2. Check DB columns for users table
  console.log('\n=== Users table columns ===');
  r = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "DESCRIBE users;" 2>/dev/null`);
  console.log(r.stdout);

  // 3. Check .env.local email config
  console.log('\n=== Email config in .env.local ===');
  r = await exec(conn, 'grep -i "EMAIL\\|ENABLE" /opt/note-prompt/.env.local');
  console.log(r.stdout);

  // 4. Test the API directly from inside container
  console.log('\n=== Test send-verification from inside ===');
  r = await exec(conn, `curl -s -X POST http://localhost:3000/api/v1/auth/send-verification -H "Content-Type: application/json" -d '{"email":"test@test.com"}' 2>&1`);
  console.log(r.stdout);

  // 5. Check if favicon exists
  console.log('\n=== Check favicon ===');
  r = await exec(conn, 'ls -la /opt/note-prompt/public/favicon* 2>/dev/null; docker exec note-prompt-app ls /app/public/ 2>/dev/null');
  console.log(r.stdout || 'No favicon found');

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
