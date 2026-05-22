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
  console.log('=== SSH Connected ===\n');

  // 1. Check containers
  let r = await exec(conn, 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20');
  console.log('=== Docker Containers ===');
  console.log(r.stdout);

  // 2. Check app health
  r = await exec(conn, 'curl -s http://localhost:3000/api/health 2>/dev/null');
  console.log('\n=== App Health (localhost:3000) ===');
  console.log(r.stdout || '(no response)');

  // 3. Check nginx health
  r = await exec(conn, 'curl -s http://localhost:80/api/health 2>/dev/null');
  console.log('\n=== Health via Nginx (localhost:80) ===');
  console.log(r.stdout || '(no response)');

  // 4. Test login endpoint directly
  r = await exec(conn, `curl -s -w "\\n--- HTTP %{http_code} ---" -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"test123"}' 2>/dev/null`);
  console.log('\n=== Login Test (direct app, wrong pw) ===');
  console.log(r.stdout || '(no response)');

  // 5. Test login via nginx
  r = await exec(conn, `curl -s -w "\\n--- HTTP %{http_code} ---" -X POST http://localhost:80/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"test123"}' 2>/dev/null`);
  console.log('\n=== Login Test (via nginx, wrong pw) ===');
  console.log(r.stdout || '(no response)');

  // 6. Check environment variables
  r = await exec(conn, 'docker exec note-prompt-app printenv | grep -E "JWT_SECRET|MYSQL_HOST|MYSQL_DATABASE|NODE_ENV" | sed "s/JWT_SECRET=.*/JWT_SECRET=***SET***/"');
  console.log('\n=== App Environment ===');
  console.log(r.stdout || r.stderr);

  // 7. Check DB connectivity from container
  r = await exec(conn, 'docker exec note-prompt-app node -e "const mysql=require(\'mysql2/promise\');(async()=>{try{const c=await mysql.createConnection({host:process.env.MYSQL_HOST,port:process.env.MYSQL_PORT,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});const [rows]=await c.execute(\'SELECT COUNT(*) as cnt FROM users\');console.log(\'DB OK, users:\',rows[0].cnt);await c.end();}catch(e){console.log(\'DB ERROR:\',e.message);}})()" 2>&1');
  console.log('\n=== Database Check ===');
  console.log(r.stdout || r.stderr);

  // 8. Check recent app logs for errors
  r = await exec(conn, 'docker logs note-prompt-app 2>&1 | tail -30');
  console.log('\n=== Recent App Logs (last 30 lines) ===');
  console.log(r.stdout || r.stderr);

  // 9. Check nginx error logs
  r = await exec(conn, 'docker logs note-prompt-nginx 2>&1 | grep -i error | tail -10');
  console.log('\n=== Nginx Error Logs ===');
  console.log(r.stdout || r.stderr || '(no errors)');

  // 10. Check disk space
  r = await exec(conn, 'df -h / | tail -1');
  console.log('\n=== Disk Space ===');
  console.log(r.stdout);

  conn.end();
}
main().catch(e=>{console.error('FATAL:',e.message);process.exit(1)});
