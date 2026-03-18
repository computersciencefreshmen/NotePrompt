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

  // Container status
  let r = await exec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
  console.log('=== Containers ===');
  console.log(r.stdout);

  // Test all key endpoints with response details
  const endpoints = [
    'https://noteprompt.cn/',
    'https://noteprompt.cn/login',
    'https://noteprompt.cn/register',
    'https://noteprompt.cn/api/health',
    'https://noteprompt.cn/api/v1/prompts',
    'https://www.noteprompt.cn/',
    'http://noteprompt.cn/',
  ];

  console.log('\n=== HTTP Tests ===');
  for (const url of endpoints) {
    r = await exec(conn, `curl -sk -o /dev/null -w "%{http_code} %{size_download}bytes %{time_total}s" "${url}"`);
    console.log(`${r.stdout}  ${url}`);
  }

  // Check SSL cert info
  console.log('\n=== SSL Certificate ===');
  r = await exec(conn, 'echo | openssl s_client -connect noteprompt.cn:443 -servername noteprompt.cn 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null');
  console.log(r.stdout);

  // Check homepage returns actual HTML content
  console.log('\n=== Homepage HTML snippet ===');
  r = await exec(conn, 'curl -sk https://noteprompt.cn/ | head -5');
  console.log(r.stdout);

  // Check HTTP -> HTTPS redirect
  console.log('\n=== HTTP redirect ===');
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code} redirect_url=%{redirect_url}" http://noteprompt.cn/');
  console.log(r.stdout);

  // Check disk & memory
  console.log('\n=== Resources ===');
  r = await exec(conn, 'df -h / | tail -1');
  console.log('Disk:', r.stdout);
  r = await exec(conn, 'free -h | grep Mem');
  console.log('Mem: ', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
