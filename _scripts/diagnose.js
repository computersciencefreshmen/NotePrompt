const {Client} = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  const cmds = [
    'curl -s -o /dev/null -w "CODE:%{http_code} TIME:%{time_total}s" --max-time 10 http://localhost:3000/',
    'curl -s -o /dev/null -w "CODE:%{http_code} TIME:%{time_total}s" --max-time 10 https://noteprompt.cn/',
    'docker logs --tail=30 note-prompt-app 2>&1',
    'docker stats --no-stream',
    'cat /opt/note-prompt/nginx/nginx.conf',
    'docker exec note-prompt-app ls /app/src/app/forgot-password/ 2>&1',
    'netstat -tlnp | grep -E "80|443|3000"',
  ];
  let i = 0;
  function run() {
    if (i >= cmds.length) { conn.end(); return; }
    const cmd = cmds[i++];
    console.log('\n=== ' + cmd.substring(0,80) + ' ===');
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); run(); return; }
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
      stream.on('close', () => { console.log(out); run(); });
    });
  }
  run();
}).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
