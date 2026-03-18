const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('=== Connected ===');
  
  const sqlCommands = [
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='agent_report' AND TABLE_NAME IN ('user_usage_stats','ai_usage_daily')",
    "SELECT * FROM user_usage_stats LIMIT 5",
    "SELECT * FROM ai_usage_daily LIMIT 5"
  ];
  
  let idx = 0;
  function runNext() {
    if (idx >= sqlCommands.length) { conn.end(); return; }
    const sql = sqlCommands[idx++];
    console.log('\n--- SQL:', sql, '---');
    conn.exec(`docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "${sql}" 2>&1`, (err, stream) => {
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => { console.log(out); runNext(); });
    });
  }
  runNext();
});

conn.connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' });
